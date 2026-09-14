-- O Comercial pode orçar, mas continua sem ver custo.
--
-- O problema: `adicionais` e `faixas_volume` guardam CUSTO interno, e o RLS
-- delas exige `ver_custos`. Para o Comercial as duas voltam VAZIAS — a
-- lista de serviços adicionais some e a calculadora fica sem faixa para
-- calcular preço nenhum. Ele abre a tela e não consegue fazer nada.
--
-- Liberar `ver_custos` resolveria em uma linha e abriria custo e margem
-- para ele em toda a plataforma. A saída é o mesmo recorte por COLUNA que
-- `orcamentos_visao` já faz: mostrar o nome, esconder o dinheiro.
--
-- ATENÇÃO a uma diferença deliberada em relação a orcamentos_visao: aquela
-- usa security_invoker=true e respeita o RLS da tabela de baixo. Estas NÃO
-- podem — é justamente o RLS de baixo que estamos contornando. Rodam com
-- os direitos do dono, e por isso carregam a própria guarda no WHERE.
--
-- NOTA: a versão final destas visões e da função está nas migrations 34 e
-- 35, que corrigem duas coisas que passaram aqui — o filtro de `ativo` e o
-- vazamento da faixa de margem.
create or replace view adicionais_visao as
select
  a.id, a.nome, a.tipo, a.unidade,
  case when pode_fazer('ver_custos') then a.valor else null end as valor
from adicionais a
where pode_ver('orcamentos');

create or replace view faixas_volume_visao as
select
  f.id, f.ate,
  case when pode_fazer('ver_custos') then f.valor_base else null end as valor_base
from faixas_volume f
where pode_ver('orcamentos');

revoke all on adicionais_visao from anon;
revoke all on faixas_volume_visao from anon;
grant select on adicionais_visao to authenticated;
grant select on faixas_volume_visao to authenticated;
