-- PROVA DE QUE A PORTA PÚBLICA DO INVENTÁRIO ESTÁ FECHADA.
--
-- A migration 53 abriu a primeira rota da plataforma sem login. Este script
-- existe para ser RODADO DE NOVO a cada mudança que toque nela: basta colar
-- inteiro no SQL Editor do Supabase e olhar a coluna `passou`.
--
-- Ele cria dois clientes de teste, exercita tudo, e apaga o que criou.
--
-- As asserções comparam VALOR, não ausência de erro. RLS nega afetando zero
-- linhas em silêncio, e teste que só procura exceção passa com o sistema
-- aberto — foi assim que eu quase subi a edição de rota duplicando cidades.

begin;

create temp table prova (caso text, resultado text, passou boolean) on commit drop;

do $$
declare
  v_cli_a uuid;
  v_cli_b uuid;
  v_tok_a text;
  v_tok_b text;
  v_tok_a2 text;
  v_r jsonb;
  v_erro text;
  v_n integer;
  v_chaves text;
  v_exp1 timestamptz;
  v_exp2 timestamptz;
  v_fin timestamptz;
begin
  -- ------------------------------------------------------------------ setup
  insert into clientes (tipo, nome, documento, telefone, email, status, origem,
                        endereco_coleta, endereco_entrega, observacoes, itens)
  values ('PF','ZZ INV CLIENTE A','111.111.111-11','(31) 90000-1111','a@zz.test',
          'Novo','WhatsApp','Rua Secreta A, 1','Rua Secreta A, 2','','')
  returning id into v_cli_a;

  insert into clientes (tipo, nome, documento, telefone, email, status, origem,
                        endereco_coleta, endereco_entrega, observacoes, itens)
  values ('PF','ZZ INV CLIENTE B','222.222.222-22','(31) 90000-2222','b@zz.test',
          'Novo','WhatsApp','Rua Secreta B, 1','Rua Secreta B, 2','','')
  returning id into v_cli_b;

  v_tok_a := (inventario_liberar(v_cli_a, 7) ->> 'token');
  v_tok_b := (inventario_liberar(v_cli_b, 7) ->> 'token');

  -- Cliente B já tem um item, para provar que o token de A não o alcança.
  insert into inventario_itens (cliente_id, ambiente, item, quantidade, valor_unitario)
  values (v_cli_b, 'Sala', 'Sofá do B', 1, 1500);

  insert into prova values
    ('0. token tem 64 caracteres', length(v_tok_a) || ' caracteres', length(v_tok_a) = 64),
    ('0. tokens de A e B são diferentes', 'ok', v_tok_a <> v_tok_b);

  /* ------------------------------------------- o anônimo não alcança tabela
   *
   * ATENÇÃO AO CRITÉRIO. Tabela com RLS ligado e nenhuma policy para `anon`
   * NÃO levanta exceção: ela devolve ZERO LINHAS, em silêncio. E o Supabase
   * concede SELECT de tabela ao papel `anon` por padrão, então a consulta
   * até roda.
   *
   * Portanto o que condena é LINHA VINDO. Exceção e zero linhas são os dois
   * resultados seguros. A primeira versão destas três asserções exigia
   * exceção, e acusaria falha num sistema perfeitamente fechado — eu peguei
   * isso lendo, porque o banco estava fora e eu não pude rodar.
   */
  set local role anon;
  perform set_config('request.jwt.claims', '', true);

  begin
    select count(*) into v_n from inventario_links;
    v_erro := 'sem erro, leu ' || v_n || ' linha(s)';
  exception when others then v_n := 0; v_erro := 'recusou com ' || sqlstate;
  end;
  reset role;
  insert into prova values ('1. anon alcança inventario_links?', v_erro, v_n = 0);

  set local role anon;
  begin
    select count(*) into v_n from inventario_itens;
    v_erro := 'sem erro, leu ' || v_n || ' linha(s)';
  exception when others then v_n := 0; v_erro := 'recusou com ' || sqlstate;
  end;
  reset role;
  insert into prova values ('2. anon alcança inventario_itens?', v_erro, v_n = 0);

  set local role anon;
  begin
    select count(*) into v_n from clientes;
    v_erro := 'sem erro, leu ' || v_n || ' linha(s)';
  exception when others then v_n := 0; v_erro := 'recusou com ' || sqlstate;
  end;
  reset role;
  insert into prova values ('3. anon alcança clientes?', v_erro, v_n = 0);

  -- -------------------------------------- o anônimo não libera link nenhum
  set local role anon;
  begin
    perform inventario_liberar(v_cli_a, 365);
    v_erro := 'PASSOU — RUIM';
  exception when others then v_erro := sqlstate;
  end;
  reset role;
  select expira_em into v_exp1 from inventario_links where cliente_id = v_cli_a;
  insert into prova values ('4. anon chama inventario_liberar', v_erro,
    v_erro <> 'PASSOU — RUIM' and v_exp1 < now() + interval '30 days');

  -- ------------------------------------------------ token inválido/expirado
  set local role anon;
  begin
    perform inventario_abrir('nao-existe-este-token');
    v_erro := 'PASSOU — RUIM';
  exception when others then v_erro := sqlerrm;
  end;
  reset role;
  insert into prova values ('5. token inexistente é recusado', v_erro,
    v_erro like '%inválido%');

  update inventario_links set expira_em = now() - interval '1 day'
   where cliente_id = v_cli_a;

  set local role anon;
  begin
    perform inventario_abrir(v_tok_a);
    v_erro := 'PASSOU — RUIM';
  exception when others then v_erro := sqlerrm;
  end;
  reset role;
  insert into prova values ('6. token expirado é recusado, com recado útil', v_erro,
    v_erro like '%expirou%' and v_erro like '%liberar de novo%');

  -- ------------------------------- liberar de novo ESTENDE o mesmo token
  v_r := inventario_liberar(v_cli_a, 7);
  v_tok_a2 := v_r ->> 'token';
  select expira_em into v_exp2 from inventario_links where cliente_id = v_cli_a;
  insert into prova values ('7. liberar de novo mantém o MESMO token',
    case when v_tok_a2 = v_tok_a then 'mesmo token' else 'TOKEN TROCADO — RUIM' end,
    v_tok_a2 = v_tok_a and v_exp2 > now() and (v_r ->> 'novo') = 'false');

  -- ------------------------------------- abrir devolve só nome e itens
  set local role anon;
  v_r := inventario_abrir(v_tok_a);
  reset role;

  select string_agg(k, ',' order by k) into v_chaves from jsonb_object_keys(v_r) k;
  insert into prova values ('8. abrir devolve apenas 4 campos', v_chaves,
    v_chaves = 'cliente_nome,expira_em,finalizado_em,itens');

  insert into prova values ('9. nada de CPF, telefone, e-mail ou endereço no retorno',
    'conferido no texto do JSON',
    v_r::text not like '%111.111.111-11%'
      and v_r::text not like '%90000-1111%'
      and v_r::text not like '%a@zz.test%'
      and v_r::text not like '%Rua Secreta%');

  insert into prova values ('10. o nome vem, que é o que a página mostra',
    v_r ->> 'cliente_nome', (v_r ->> 'cliente_nome') = 'ZZ INV CLIENTE A');

  -- --------------------------------- salvar grava, e só no cliente do token
  set local role anon;
  v_r := inventario_salvar(v_tok_a, jsonb_build_array(
    jsonb_build_object('ambiente','Sala','item','Sofá de 3 lugares','quantidade',1,'valor_unitario',2500),
    jsonb_build_object('ambiente','Cozinha','item','Geladeira','quantidade',1,'valor_unitario',4000),
    -- Linha sem nome: tem de ser ignorada, não gravada vazia.
    jsonb_build_object('ambiente','Sala','item','   ','quantidade',1,'valor_unitario',0)
  ));
  reset role;

  select count(*) into v_n from inventario_itens where cliente_id = v_cli_a;
  insert into prova values ('11. salvou 2 itens e ignorou a linha vazia',
    (v_r ->> 'itens') || ' gravados, ' || v_n || ' no banco',
    (v_r ->> 'itens') = '2' and v_n = 2);

  select count(*) into v_n from inventario_itens where cliente_id = v_cli_b;
  insert into prova values ('12. o inventário do cliente B ficou INTACTO',
    v_n || ' item(ns) de B', v_n = 1);

  -- --------------------------------------------- substituir, não acumular
  set local role anon;
  perform inventario_salvar(v_tok_a, jsonb_build_array(
    jsonb_build_object('ambiente','Sala','item','Sofá de 3 lugares','quantidade',2,'valor_unitario',2500)
  ));
  reset role;
  select count(*) into v_n from inventario_itens where cliente_id = v_cli_a;
  insert into prova values ('13. salvar substitui a lista, não acumula',
    v_n || ' item(ns)', v_n = 1);

  -- ------------------------------- finalizar marca e NÃO fecha o link
  set local role anon;
  v_r := inventario_finalizar(v_tok_a);
  reset role;
  select finalizado_em into v_fin from inventario_links where cliente_id = v_cli_a;
  insert into prova values ('14. finalizar marca a data', coalesce(v_fin::text,'nulo'),
    v_fin is not null);

  set local role anon;
  begin
    perform inventario_salvar(v_tok_a, jsonb_build_array(
      jsonb_build_object('ambiente','Quarto','item','Cama box','quantidade',1,'valor_unitario',1800)
    ));
    v_erro := 'NENHUM';
  exception when others then v_erro := sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  select count(*) into v_n from inventario_itens where cliente_id = v_cli_a;
  select finalizado_em into v_fin from inventario_links where cliente_id = v_cli_a;
  insert into prova values ('15. depois de finalizar AINDA dá para preencher',
    v_erro || ', ' || v_n || ' item(ns), finalizado segue marcado',
    v_erro = 'NENHUM' and v_n = 1 and v_fin is not null);

  -- ------------------------------- token de B não mexe no inventário de A
  set local role anon;
  perform inventario_salvar(v_tok_b, jsonb_build_array(
    jsonb_build_object('ambiente','Sala','item','Rack do B','quantidade',1,'valor_unitario',900)
  ));
  reset role;
  /*
   * Compara o NOME do item, não a contagem.
   *
   * A e B têm um item cada, então contar daria 1 nos dois casos e o teste
   * passaria mesmo se o Rack do B tivesse substituído a cama do A. Contagem
   * igual não é conteúdo igual — já me enganei exatamente assim no teste de
   * exclusão de cliente.
   */
  select string_agg(item, ', ' order by item) into v_chaves
    from inventario_itens where cliente_id = v_cli_a;
  insert into prova values ('16. token de B não alcança o inventário de A',
    'A tem: ' || coalesce(v_chaves, '(nada)'),
    v_chaves = 'Cama box');

  -- --------------------------------------------------------------- limpeza
  delete from clientes where id in (v_cli_a, v_cli_b);
  select count(*) into v_n from inventario_links where cliente_id in (v_cli_a, v_cli_b);
  insert into prova values ('17. apagar o cliente leva link e itens',
    v_n || ' link(s) sobrando', v_n = 0);
end $$;

select caso, resultado, passou from prova order by caso;

-- Uma linha final que diz sim ou não, para não depender de ler 18 linhas.
select
  count(*) filter (where not passou) as falhas,
  case when count(*) filter (where not passou) = 0
       then 'PORTA FECHADA — todos os casos passaram'
       else 'ATENÇÃO: há caso falhando' end as veredito
from prova;

rollback;
