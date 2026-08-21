-- A empresa fala "coleta" e "entrega", não "embarque" e "desembarque".
-- O vocabulário do banco acompanha o da casa: renomear o valor do enum
-- preserva as linhas existentes, ao contrário de criar um tipo novo.
--
-- Não há conflito com tipo_parada, que já usa coleta/entrega/mista: são
-- enums distintos, e agora os dois falam a mesma língua.
alter type tipo_movimento rename value 'embarque' to 'coleta';
alter type tipo_movimento rename value 'desembarque' to 'entrega';
