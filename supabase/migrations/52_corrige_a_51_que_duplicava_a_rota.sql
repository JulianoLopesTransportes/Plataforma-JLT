-- CONSERTA UM BUG QUE EU CRIEI NA MIGRATION 51, pego no teste antes de ir
-- para a tela.
--
-- `atualizar_rota_completa` nasceu SECURITY INVOKER. O raciocínio parecia
-- certo: "o RLS das tabelas é quem decide se a pessoa pode editar, a função
-- não precisa de poder extra". Mas ela SUBSTITUI os filhos, e substituir
-- começa com um DELETE.
--
-- As policies são:
--
--   paradas_del   → pode_editar('rotas') AND pode_fazer('excluir')
--   mudancas_del  → pode_editar('rotas') AND pode_fazer('excluir')
--
-- e `excluir` é capacidade só do admin. Então, para qualquer outro nível, o
-- DELETE afetava ZERO linhas — sem erro, porque RLS não levanta exceção no
-- delete, só não apaga — e o preenchimento em seguida acrescentava as
-- cidades novas EM CIMA das antigas.
--
-- O teste mediu: rota com 2 cargas e 2 cidades, editada para 1 carga e 3
-- cidades, terminou com 3 cargas e 5 cidades. Como admin teria passado,
-- que é o tipo de bug mais traiçoeiro — funciona para quem testa e corrompe
-- o dado de todo mundo.
--
-- O CONSERTO é a função rodar como dona, com a permissão checada na
-- primeira linha. A semântica sustenta isso: trocar as cidades de uma rota é
-- EDITAR a rota, não exercer o direito de excluir registros. A capacidade
-- `excluir` existe para o gesto de destruir algo que o usuário escolheu
-- destruir — aqui nada do usuário é destruído, o conjunto é reescrito.
--
-- É o mesmo desenho de criar_orcamento e revisar_orcamento: DEFINER com
-- `if not pode_editar(...) then raise` logo no começo.
create or replace function public.atualizar_rota_completa(p_rota_id uuid, p_rota jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_paradas_antes int;
  v_cargas_antes int;
  v_paradas_depois int;
  v_cargas_depois int;
  v_resumo text[] := '{}';
begin
  -- A checagem que substitui o RLS que o DEFINER passa por cima.
  if not pode_editar('rotas') then
    raise exception 'Seu nível não permite alterar rotas.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from rotas where id = p_rota_id) then
    raise exception 'Rota não encontrada.' using errcode = 'no_data_found';
  end if;

  select count(*) into v_paradas_antes from paradas where rota_id = p_rota_id;
  select count(*) into v_cargas_antes from mudancas where rota_id = p_rota_id;

  update rotas set
    nome = coalesce(p_rota ->> 'nome', nome),
    status = coalesce((p_rota ->> 'status')::status_rota, status),
    veiculo_id = nullif(p_rota ->> 'veiculo_id', '')::uuid,
    motorista_id = nullif(p_rota ->> 'motorista_id', '')::uuid,
    origem = coalesce(p_rota ->> 'origem', origem),
    destino = coalesce(p_rota ->> 'destino', destino),
    data_saida = nullif(p_rota ->> 'data_saida', '')::date,
    data_prevista_retorno = nullif(p_rota ->> 'data_prevista_retorno', '')::date
  where id = p_rota_id;

  delete from paradas where rota_id = p_rota_id;
  delete from mudancas where rota_id = p_rota_id;

  perform preenche_filhos_da_rota(p_rota_id, p_rota);

  select count(*) into v_paradas_depois from paradas where rota_id = p_rota_id;
  select count(*) into v_cargas_depois from mudancas where rota_id = p_rota_id;

  if v_cargas_antes <> v_cargas_depois then
    v_resumo := v_resumo || ('cargas: ' || v_cargas_antes || ' -> ' || v_cargas_depois);
  end if;
  if v_paradas_antes <> v_paradas_depois then
    v_resumo := v_resumo || ('cidades: ' || v_paradas_antes || ' -> ' || v_paradas_depois);
  end if;
  if array_length(v_resumo, 1) is null then
    v_resumo := v_resumo || 'cidades e cargas regravadas';
  end if;

  insert into rota_historico (rota_id, descricao)
  values (p_rota_id, 'Rota editada - ' || array_to_string(v_resumo, '; '));
end;
$$;

revoke execute on function public.atualizar_rota_completa(uuid, jsonb) from public, anon;
grant execute on function public.atualizar_rota_completa(uuid, jsonb) to authenticated;
