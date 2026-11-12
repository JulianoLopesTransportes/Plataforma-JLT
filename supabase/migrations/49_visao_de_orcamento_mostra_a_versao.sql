-- A view de orçamento passa a expor a cadeia de versões.
--
-- A 48 acrescentou raiz_id, versao, vigente e fator na TABELA. A view
-- `orcamentos_visao` lista colunas uma por uma, então não ganhou nada — e é
-- ela que a aplicação lê, nunca a tabela crua. Sem este passo, a ficha do
-- cliente não conseguiria nem filtrar a versão vigente nem reabrir a
-- calculadora no ponto certo da régua.
--
-- É a contrapartida de mascarar por coluna: toda coluna nova tem de ser
-- admitida aqui de propósito. O preço de ser explícito.

-- O QUE CONTINUA MASCARADO, e por quê:
--
--   custo_base e margem_percentual seguem NULOS para quem não tem
--   `ver_custos`. São o custo e a margem — o recorte original do briefing.
--
-- O QUE PASSA LIMPO, e por quê:
--
--   `fator` é o ponto da régua 0–10 que o próprio operador escolheu e viu
--   na tela dele. Devolvê-lo não conta nada que ele já não soubesse.
--
--   Transformar fator em margem exigiria a faixa mínima/máxima, que vive em
--   `parametros_precificacao` — tabela que o RLS fecha para quem não tem
--   `ver_custos`. Então o fator sozinho não reconstrói a margem.
--
--   raiz_id, versao e vigente são estrutura, não dinheiro.
create or replace view public.orcamentos_visao with (security_invoker = true) as
select
  id,
  cliente_id,
  cliente_nome,
  status,
  data,
  volume_m3,
  distancia_km,
  case when pode_fazer('ver_custos') then custo_base else null::numeric end as custo_base,
  case
    when pode_fazer('ver_custos') then margem_percentual
    else null::numeric
  end as margem_percentual,
  valor_final,
  observacoes,
  criado_em,
  raiz_id,
  versao,
  vigente,
  fator
from orcamentos o;

-- A 24 ensinou: recriar objeto devolve o privilégio padrão.
revoke all on public.orcamentos_visao from public, anon;
grant select on public.orcamentos_visao to authenticated;
