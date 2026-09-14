-- Acerto da 33: a visão expunha adicional inativo.
--
-- A tela sempre filtrou por `ativo` no SELECT da tabela, e ao trocar para a
-- visão esse filtro se perderia — um serviço que a empresa desativou
-- voltaria a aparecer na calculadora. O filtro vai para dentro da visão,
-- que é onde ele não depende de alguém lembrar de escrevê-lo.
create or replace view adicionais_visao as
select
  a.id, a.nome, a.tipo, a.unidade,
  case when pode_fazer('ver_custos') then a.valor else null end as valor
from adicionais a
where pode_ver('orcamentos')
  and a.ativo;

revoke all on adicionais_visao from anon;
grant select on adicionais_visao to authenticated;
