-- A tela de Orçamentos ganha persistência: até aqui ela calculava e
-- esquecia, e a tabela `orcamentos` nunca recebeu uma linha pela
-- plataforma.

-- 1. O nome do adicional é gravado JUNTO, não só o id.
--
-- Duas razões, e a primeira só apareceu ao ler o RLS: a tabela
-- `adicionais` é legível apenas por quem tem `ver_custos`, e o Comercial
-- não tem. Sem o nome aqui, a ficha do cliente mostraria "3 adicionais"
-- sem dizer quais, justamente para quem mais usa a tela.
--
-- A segunda: um adicional renomeado ou excluído depois não pode reescrever
-- o passado. O orçamento tem de continuar dizendo o que foi aplicado NA
-- ÉPOCA. É a mesma razão pela qual `mudancas` guarda `cliente_nome`.
--
-- O nome não é dado de custo: "Içamento" não revela preço nenhum.
alter table orcamento_adicionais
  add column if not exists nome text not null default '';

comment on column orcamento_adicionais.nome is
  'Nome do adicional na época do orçamento. Denormalizado porque adicionais só é legível por quem tem ver_custos, e porque renomear não pode reescrever o passado.';

-- 2. A gravação.
--
-- Passa por função, e não por dois inserts do navegador, porque orçamento
-- e adicionais são tabelas encadeadas: sem transação, uma falha no meio
-- deixaria o orçamento sem a composição que justifica o preço.
--
-- SECURITY DEFINER por causa do mesmo recorte acima — precisa ler
-- `adicionais.nome` para quem não alcança a tabela. Por isso checa a
-- permissão explicitamente na primeira linha, como criar_nivel().
create or replace function public.criar_orcamento(p_orcamento jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_cliente_id uuid;
  v_item jsonb;
begin
  if not pode_editar('orcamentos') then
    raise exception 'Seu nível não permite criar orçamentos.'
      using errcode = 'insufficient_privilege';
  end if;

  v_cliente_id := nullif(p_orcamento ->> 'cliente_id', '')::uuid;

  -- A coluna aceita nulo — orçamento avulso é possível no schema — mas
  -- ESTA função é a que vincula a um cliente. Sem cliente ela não tem o
  -- que fazer, e gravar um órfão silenciosamente seria pior que recusar.
  if v_cliente_id is null then
    raise exception 'Escolha um cliente antes de vincular o orçamento.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from clientes where id = v_cliente_id) then
    raise exception 'Cliente não encontrado.'
      using errcode = 'foreign_key_violation';
  end if;

  insert into orcamentos (
    cliente_id, cliente_nome, status, data,
    volume_m3, distancia_km, custo_base, margem_percentual,
    valor_final, observacoes, criado_por
  )
  values (
    v_cliente_id,
    (select nome from clientes where id = v_cliente_id),
    'rascunho',
    current_date,
    coalesce((p_orcamento ->> 'volume_m3')::numeric, 0),
    coalesce((p_orcamento ->> 'distancia_km')::numeric, 0),
    coalesce((p_orcamento ->> 'custo_base')::numeric, 0),
    coalesce((p_orcamento ->> 'margem_percentual')::numeric, 0),
    coalesce((p_orcamento ->> 'valor_final')::numeric, 0),
    coalesce(p_orcamento ->> 'observacoes', ''),
    auth.uid()
  )
  returning id into v_id;

  -- Os adicionais, com o nome resolvido aqui dentro.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_orcamento -> 'adicionais', '[]'::jsonb))
  loop
    insert into orcamento_adicionais (orcamento_id, adicional_id, quantidade, nome)
    select
      v_id,
      a.id,
      coalesce((v_item ->> 'quantidade')::numeric, 1),
      a.nome
    from adicionais a
    where a.id = (v_item ->> 'adicional_id')::uuid
    on conflict (orcamento_id, adicional_id) do nothing;
  end loop;

  return v_id;
end;
$$;

-- Toda função nasce com EXECUTE para PUBLIC, e anon herda dali. Revogar
-- só de anon não teria efeito — foi o erro que a migration 24 consertou.
revoke execute on function public.criar_orcamento(jsonb) from public, anon;
grant execute on function public.criar_orcamento(jsonb) to authenticated;
