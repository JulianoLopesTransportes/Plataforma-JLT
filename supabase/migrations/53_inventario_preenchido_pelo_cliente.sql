-- O cliente passa a poder preencher o próprio inventário por um link.
--
-- Esta é a PRIMEIRA porta da plataforma sem login, e ela escreve no banco.
-- Todo o desenho abaixo existe por causa disso.
--
-- A regra que organiza tudo: o visitante anônimo NÃO recebe acesso a tabela
-- nenhuma. Ele recebe permissão de executar três funções, e cada uma valida
-- o token e tranca o que faz no cliente daquele token. Se eu errar uma rota
-- na aplicação, não há porta aberta atrás — porque não existe tabela
-- liberada para `anon`.

-- ==========================================================================
-- 1. As tabelas
-- ==========================================================================

/*
 * `cliente_id` é a CHAVE PRIMÁRIA, não um campo qualquer: um link por
 * cliente.
 *
 * É o que faz "liberar de novo" ESTENDER o mesmo token em vez de gerar
 * outro. O Juliano foi explícito: o cliente volta e preenche, e o link
 * dele já está no WhatsApp. Token novo obrigaria a mandar outro link.
 */
create table if not exists inventario_links (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  token text not null unique,
  expira_em timestamptz not null,
  /*
   * Quando o cliente disse "terminei". NÃO fecha o link — decisão dele —
   * então o cliente pode continuar acrescentando depois.
   *
   * Por isso `atualizado_em` existe ao lado: com os dois, a ficha mostra
   * "finalizado em 27/11, alterado em 28/11" e o atendente sabe que o PDF
   * que ele imprimiu está velho. Zerar o finalizado a cada edição
   * esconderia justamente isso.
   */
  finalizado_em timestamptz,
  criado_por uuid references perfis(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists inventario_itens (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  ambiente text not null default '',
  item text not null,
  quantidade numeric not null default 1 check (quantidade > 0),
  /*
   * Valor POR ITEM, decisão do Juliano em 24/11/2026.
   *
   * A cláusula 7.1 do contrato calcula a indenização "sobre o valor
   * individual do bem" — com um total só, aquela cláusula não teria como
   * ser aplicada.
   */
  valor_unitario numeric not null default 0 check (valor_unitario >= 0),
  unique (cliente_id, ambiente, item)
);

create index if not exists inventario_itens_cliente_idx on inventario_itens(cliente_id);

-- ==========================================================================
-- 2. RLS: nada para o anônimo, nem aqui nem em lugar nenhum
-- ==========================================================================

alter table inventario_links enable row level security;
alter table inventario_itens enable row level security;

-- Quem vê clientes, vê. Quem edita clientes, edita. `anon` não entra em
-- nenhuma das duas policies, de propósito.
create policy inventario_links_sel on inventario_links
  for select using (pode_ver('clientes'));
create policy inventario_links_esc on inventario_links
  for all using (pode_editar('clientes')) with check (pode_editar('clientes'));

create policy inventario_itens_sel on inventario_itens
  for select using (pode_ver('clientes'));
create policy inventario_itens_esc on inventario_itens
  for all using (pode_editar('clientes')) with check (pode_editar('clientes'));

-- ==========================================================================
-- 3. O token
-- ==========================================================================

/*
 * Dois uuid v4 colados, sem os hífens: 64 caracteres hexadecimais, 256
 * bits de aleatoriedade.
 *
 * Não uso `gen_random_bytes` para não depender de onde o pgcrypto está
 * instalado neste projeto. `gen_random_uuid()` é nativo do Postgres 13+ e
 * usa a mesma fonte de aleatoriedade do sistema.
 *
 * 256 bits é o que torna o link imadivinhável — é a defesa real aqui, já
 * que a função de abrir é pública por natureza.
 */
create or replace function public.inventario_novo_token()
returns text
language sql
volatile
set search_path to 'public', 'pg_temp'
as $$
  select replace(gen_random_uuid()::text, '-', '') ||
         replace(gen_random_uuid()::text, '-', '')
$$;

revoke execute on function public.inventario_novo_token() from public, anon, authenticated;

-- ==========================================================================
-- 4. O lado da EQUIPE: gerar o link e liberar de novo
-- ==========================================================================

/*
 * Um gesto só para as duas coisas.
 *
 * Primeira chamada cria o link. As seguintes ESTENDEM o prazo do mesmo
 * token — que é exatamente o "posso liberar para ele" do Juliano.
 *
 * SECURITY INVOKER de propósito: quem decide se esta pessoa pode é o RLS
 * de `inventario_links`, que exige `pode_editar('clientes')`. A função não
 * precisa de poder extra, e `anon` não tem policy nenhuma ali — então
 * visitante anônimo que chamar isto não escreve nada.
 */
create or replace function public.inventario_liberar(
  p_cliente_id uuid,
  p_dias integer default 7
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_token text;
  v_expira timestamptz := now() + make_interval(days => greatest(p_dias, 1));
  v_novo boolean;
begin
  if not exists (select 1 from clientes where id = p_cliente_id) then
    raise exception 'Cliente não encontrado.' using errcode = 'foreign_key_violation';
  end if;

  select token into v_token from inventario_links where cliente_id = p_cliente_id;
  v_novo := v_token is null;

  if v_novo then
    v_token := inventario_novo_token();
    insert into inventario_links (cliente_id, token, expira_em, criado_por)
    values (p_cliente_id, v_token, v_expira, auth.uid());
  else
    update inventario_links
       set expira_em = v_expira, atualizado_em = now()
     where cliente_id = p_cliente_id;
  end if;

  -- Zero linhas escritas significa RLS negando. Melhor estourar aqui que
  -- devolver um token que não existe no banco.
  if not exists (select 1 from inventario_links where cliente_id = p_cliente_id) then
    raise exception 'Seu nível não permite liberar o inventário deste cliente.'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object('token', v_token, 'expira_em', v_expira, 'novo', v_novo);
end;
$$;

revoke execute on function public.inventario_liberar(uuid, integer) from public, anon;
grant execute on function public.inventario_liberar(uuid, integer) to authenticated;

-- ==========================================================================
-- 5. O lado do CLIENTE: as três funções públicas
-- ==========================================================================

/*
 * Valida o token e devolve o cliente dele. Usada pelas três funções
 * abaixo, para a regra de validade existir num lugar só.
 */
create or replace function public.inventario_cliente_do_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_link inventario_links;
begin
  select * into v_link from inventario_links where token = p_token;

  if v_link.cliente_id is null then
    raise exception 'Link inválido.' using errcode = 'no_data_found';
  end if;

  /*
   * Mensagem diferente para expirado, e isso é escolha.
   *
   * Distinguir "não existe" de "expirou" conta a um adivinhador que o
   * token existe. Com 256 bits de token, adivinhar não é um caminho — e o
   * cliente de verdade PRECISA saber a diferença: expirado ele resolve
   * pedindo liberação, inválido significa que copiou o link errado.
   */
  if v_link.expira_em < now() then
    raise exception 'Este link expirou. Peça à Juliano Lopes Transportes para liberar de novo.'
      using errcode = 'no_data_found';
  end if;

  return v_link.cliente_id;
end;
$$;

revoke execute on function public.inventario_cliente_do_token(text)
  from public, anon, authenticated;

/*
 * ABRIR — o que a página pública mostra.
 *
 * Devolve SÓ o nome e os itens. Nada de CPF, telefone, endereço, valor de
 * orçamento ou qualquer outro campo do cadastro.
 *
 * Isso é possível porque o PDF é gerado do lado da equipe, na ficha, onde
 * esses dados já estão. Consequência: um token vazado expõe o nome de um
 * cliente e a lista de móveis dele — não o cadastro.
 */
create or replace function public.inventario_abrir(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cliente uuid := inventario_cliente_do_token(p_token);
  v_link inventario_links;
begin
  select * into v_link from inventario_links where cliente_id = v_cliente;

  return jsonb_build_object(
    'cliente_nome', (select nome from clientes where id = v_cliente),
    'expira_em', v_link.expira_em,
    'finalizado_em', v_link.finalizado_em,
    'itens', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'ambiente', i.ambiente,
                   'item', i.item,
                   'quantidade', i.quantidade,
                   'valor_unitario', i.valor_unitario
                 )
                 order by i.ambiente, i.item
               )
        from inventario_itens i
        where i.cliente_id = v_cliente
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.inventario_abrir(text) from public;
grant execute on function public.inventario_abrir(text) to anon, authenticated;

/*
 * SALVAR — substitui a lista inteira.
 *
 * Substitui em vez de casar item a item porque a tela manda o estado
 * completo do formulário, e casar exigiria identidade que ela não tem.
 * Mesmo desenho da edição de rota.
 *
 * O `where cliente_id = v_cliente` em TODA operação é o que impede o
 * token de um cliente tocar no inventário de outro.
 */
create or replace function public.inventario_salvar(p_token text, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cliente uuid := inventario_cliente_do_token(p_token);
  v_item jsonb;
  v_gravados integer := 0;
begin
  delete from inventario_itens where cliente_id = v_cliente;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    -- Item sem nome é linha que o cliente começou e não preencheu: ignora
    -- em silêncio, em vez de gravar uma linha vazia no documento dele.
    if coalesce(trim(v_item ->> 'item'), '') = '' then
      continue;
    end if;

    insert into inventario_itens (cliente_id, ambiente, item, quantidade, valor_unitario)
    values (
      v_cliente,
      coalesce(trim(v_item ->> 'ambiente'), ''),
      trim(v_item ->> 'item'),
      greatest(coalesce((v_item ->> 'quantidade')::numeric, 1), 0.01),
      greatest(coalesce((v_item ->> 'valor_unitario')::numeric, 0), 0)
    )
    on conflict (cliente_id, ambiente, item) do update
      set quantidade = excluded.quantidade,
          valor_unitario = excluded.valor_unitario;

    v_gravados := v_gravados + 1;
  end loop;

  update inventario_links set atualizado_em = now() where cliente_id = v_cliente;

  return jsonb_build_object('itens', v_gravados);
end;
$$;

revoke execute on function public.inventario_salvar(text, jsonb) from public;
grant execute on function public.inventario_salvar(text, jsonb) to anon, authenticated;

/*
 * FINALIZAR — marca que o cliente considera pronto. NÃO fecha o link.
 *
 * Grava a hora a cada chamada: o que interessa ao atendente é "quando ele
 * confirmou por último", lido ao lado de `atualizado_em`.
 */
create or replace function public.inventario_finalizar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cliente uuid := inventario_cliente_do_token(p_token);
begin
  update inventario_links
     set finalizado_em = now(), atualizado_em = now()
   where cliente_id = v_cliente;

  return jsonb_build_object(
    'finalizado_em', (select finalizado_em from inventario_links where cliente_id = v_cliente)
  );
end;
$$;

revoke execute on function public.inventario_finalizar(text) from public;
grant execute on function public.inventario_finalizar(text) to anon, authenticated;
