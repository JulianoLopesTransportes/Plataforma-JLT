-- Apagar o cliente leva junto o compromisso automático dele.
--
-- A FK de compromissos.cliente_id é ON DELETE SET NULL, e para os
-- compromissos feitos À MÃO isso está certo: eles têm título e observações
-- próprios e valem como registro mesmo sem o cadastro — "Coleta do
-- Gabriel" continua tendo sentido.
--
-- Para o AUTOMÁTICO não: ele existe só porque o cliente fechou, leva o nome
-- dele no título e passaria a ocupar o calendário sem ninguém por trás.
-- Pior, com cliente_id nulo ele escapa do índice único (NULL não conflita),
-- e os órfãos se acumulariam sem limite.
--
-- BEFORE DELETE, para rodar enquanto cliente_id ainda aponta para a linha.
create or replace function public.remover_agendamento_do_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  delete from compromissos where cliente_id = old.id and automatico;
  return old;
end;
$$;

create trigger clientes_remove_agendamento
  before delete on clientes
  for each row execute function remover_agendamento_do_cliente();
