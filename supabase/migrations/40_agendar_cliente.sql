-- Põe na agenda o cliente que fechou, ou move o que já está lá.
--
-- POR QUE UMA FUNÇÃO, e não o upsert do PostgREST: o índice que garante
-- um automático por cliente é PARCIAL — (cliente_id) where automatico —, e
-- a inferência do ON CONFLICT só casa com índice parcial se a cláusula
-- WHERE for repetida. O PostgREST monta apenas `on conflict (cliente_id)`,
-- sem o WHERE, e o Postgres recusa:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--
-- Tornar o índice total resolveria a sintaxe e quebraria o uso: o mesmo
-- cliente precisa poder ter vários compromissos feitos à mão — coleta e
-- entrega caem em dias diferentes.
--
-- A função também LÊ o cliente daqui de dentro, em vez de receber os
-- campos do navegador: a data e os endereços que vão para a agenda são os
-- que estão gravados, não os que a tela achava que estavam.
create or replace function public.agendar_cliente(p_cliente_id uuid)
returns uuid
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_c clientes;
  v_id uuid;
begin
  select * into v_c from clientes where id = p_cliente_id;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'foreign_key_violation';
  end if;

  -- Sem data não há o que agendar. Não é erro: o cliente pode fechar antes
  -- de a data estar definida, e o compromisso nasce quando ela entrar.
  if v_c.data_prevista is null then
    return null;
  end if;

  insert into compromissos (
    automatico, cliente_id, tipo, titulo, data, dia_inteiro, horario,
    endereco_coleta, endereco_entrega
  )
  values (
    true, v_c.id, 'coleta_mudanca', v_c.nome, v_c.data_prevista,
    -- Dia inteiro: o horário se acerta depois, com a equipe. O
    -- compromisso nasce "por alto" de propósito.
    true, null,
    v_c.endereco_coleta, v_c.endereco_entrega
  )
  on conflict (cliente_id) where automatico do update
    set data = excluded.data,
        titulo = excluded.titulo,
        endereco_coleta = excluded.endereco_coleta,
        endereco_entrega = excluded.endereco_entrega
  returning id into v_id;

  return v_id;
end;
$$;

-- SECURITY INVOKER de propósito: quem agenda precisa poder escrever na
-- agenda por direito próprio. O RLS de `compromissos` continua decidindo,
-- e a função não vira uma porta lateral para quem não pode editar agenda.
revoke execute on function public.agendar_cliente(uuid) from public, anon;
grant execute on function public.agendar_cliente(uuid) to authenticated;
