-- CONSERTA UMA REGRESSÃO QUE EU CAUSEI NA MIGRATION 30.
--
-- A 30 revogou EXECUTE de `proximo_codigo_cliente()` para authenticated,
-- no raciocínio de que "quem chama é o gatilho, e gatilho não passa por
-- GRANT". Esse raciocínio é falso.
--
-- `preenche_codigo_cliente()` é SECURITY INVOKER: roda com os privilégios
-- de quem faz o INSERT. A chamada que ela faz para `proximo_codigo_cliente()`
-- é uma chamada de função comum, e passa por GRANT como qualquer outra.
-- Resultado: TODO insert em clientes passou a falhar, para todo mundo,
-- inclusive o administrador:
--
--   42501: permission denied for function proximo_codigo_cliente
--
-- O conserto NÃO é devolver o grant — isso reabriria a porta que a 30
-- fechou, onde qualquer autenticado chamaria a função por /rest/v1/rpc e
-- queimaria números do contador.
--
-- O conserto é o gatilho passar a rodar como o DONO. Aí ele alcança o
-- contador por ser postgres, e o contador continua inalcançável pela API
-- para todos os papéis. A função é minúscula e faz uma coisa só, e chamá-la
-- fora de um gatilho falha de imediato ("can only be called as trigger"),
-- então SECURITY DEFINER aqui não abre superfície nova.
create or replace function public.preenche_codigo_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := proximo_codigo_cliente();
  end if;
  return new;
end;
$$;
