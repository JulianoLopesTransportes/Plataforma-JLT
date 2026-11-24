-- `inventario_liberar` não conseguia gerar link NENHUM.
--
-- A migration 53 deixou a função como SECURITY INVOKER de propósito: quem
-- decidiria se a pessoa pode seria o RLS de `inventario_links`. O
-- raciocínio estava certo e o efeito estava errado, porque a função chama
-- `inventario_novo_token()` — e a mesma migration revogou o EXECUTE dessa
-- outra de `public`, `anon` E `authenticated`.
--
-- Sob INVOKER valem as permissões de quem chamou. Resultado para qualquer
-- atendente logado:
--
--   ERROR: permission denied for function inventario_novo_token
--
-- Nenhum link seria gerado, nunca, por ninguém. É a mesma armadilha da
-- migration 30, que revogou o gerador de código do cliente e derrubou
-- todo cadastro — e da 51, que era DEFINER de menos no lugar errado.
--
-- Por que não apareceu nos 19 testes da 53: todos exercitaram a porta
-- PÚBLICA (abrir, salvar, finalizar, que são DEFINER e não dependem de
-- quem chama). Este caminho, o da equipe, só é exercido por alguém
-- logado que NÃO é dono do banco, e o MCP roda como postgres, que
-- atravessa qualquer revoke.
--
-- Correção: DEFINER com a checagem escrita à mão, o mesmo desenho da 52.
-- A pergunta "pode?" passa a ser feita ANTES de qualquer escrita, em vez
-- de deduzida de "o insert não afetou linha nenhuma".
--
-- Provado antes de aplicar, numa transação desfeita, com três casos:
--   1. comercial gera um token de 64 caracteres, `novo` = true;
--   2. liberar de novo devolve o MESMO token com prazo maior — se o token
--      mudasse, o link que já está no WhatsApp do cliente morreria;
--   3. quem não tem pode_editar('clientes') é recusado com
--      insufficient_privilege.

create or replace function public.inventario_liberar(
  p_cliente_id uuid,
  p_dias integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_token text;
  v_expira timestamptz := now() + make_interval(days => greatest(p_dias, 1));
  v_novo boolean;
begin
  -- A checagem que substitui o RLS que o DEFINER passa por cima.
  if not pode_editar('clientes') then
    raise exception 'Seu nível não permite liberar o inventário deste cliente.'
      using errcode = 'insufficient_privilege';
  end if;

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
    -- Estender mantém o token: um link por cliente, para "liberar de
    -- novo" não obrigar a mandar outro endereço.
    update inventario_links
       set expira_em = v_expira, atualizado_em = now()
     where cliente_id = p_cliente_id;
  end if;

  return jsonb_build_object('token', v_token, 'expira_em', v_expira, 'novo', v_novo);
end;
$$;

-- `anon` continua fora: esta é a única das quatro que exige login.
revoke execute on function public.inventario_liberar(uuid, integer) from public, anon;
grant execute on function public.inventario_liberar(uuid, integer) to authenticated;
