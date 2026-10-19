-- Em migration própria porque ADD VALUE não pode ser usado na mesma
-- transação em que é criado — mesma razão da 27.
--
-- BEFORE 'Finalizada' importa: a ordem do enum é a ordem do funil, e é
-- ela que `proximoStatus()` segue para saber qual é a etapa seguinte.
alter type status_cliente add value if not exists 'Fechada' before 'Finalizada';
