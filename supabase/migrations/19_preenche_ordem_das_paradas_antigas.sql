-- As paradas gravadas antes da 17 têm ordem nula: a versão anterior de
-- criar_rota_completa não preenchia a coluna. Preenche pela data, que era
-- exatamente o critério que a tela usava para ordená-las.
with numeradas as (
  select id, row_number() over (partition by rota_id order by data, id) - 1 as pos
  from paradas
  where ordem is null
)
update paradas p
set ordem = n.pos
from numeradas n
where p.id = n.id;

-- Daqui em diante toda parada nasce com posição.
alter table paradas
  alter column ordem set default 0;
