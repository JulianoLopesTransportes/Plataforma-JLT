-- Marca o compromisso que nasceu do fechamento de um cliente.
--
-- Sem esta coluna não há como saber QUAL compromisso mover quando a data
-- prevista do cliente muda: um cliente pode ter vários compromissos na
-- agenda, criados à mão, e nenhum deles deve se mexer sozinho.
alter table compromissos
  add column if not exists automatico boolean not null default false;

comment on column compromissos.automatico is
  'Nasceu do cliente entrar em "Fechada". É o único que a data prevista do cliente move, e o único que move a data prevista de volta.';

-- No máximo um automático por cliente.
--
-- Índice parcial, e não constraint: a regra vale só para os automáticos.
-- Os compromissos feitos à mão continuam livres — o mesmo cliente pode ter
-- quantos quiser, que é o caso de coleta e entrega em dias diferentes.
create unique index if not exists compromissos_automatico_por_cliente
  on compromissos (cliente_id)
  where automatico;
