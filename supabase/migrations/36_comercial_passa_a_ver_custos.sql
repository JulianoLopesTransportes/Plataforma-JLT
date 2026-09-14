-- O Comercial passa a VER os valores, e continua sem poder EDITAR.
--
-- Decisão do Juliano em 14/09/2026, revendo a regra do briefing original
-- ("Comercial não vê custo interno, sem margem"). A operação mudou: quem
-- fala com o cliente precisa enxergar o valor das coisas para negociar.
--
-- O que esta linha abre, e é bom estar escrito:
--   - valor de cada serviço adicional e de cada faixa de volume
--   - a composição do preço na calculadora: custo total e margem aplicada
--   - custo_base e margem_percentual de todo orçamento, via orcamentos_visao
--     — inclusive na aba Orçamentos da ficha do cliente
--   - a coluna de custo em relatorio_operacoes()
--
-- O que NÃO abre: escrita. As policies de `adicionais`, `faixas_volume` e
-- `parametros_precificacao` exigem `editar_parametros_precificacao`, que é
-- capacidade separada e continua restrita a admin e financeiro. O painel
-- de precificação também só renderiza com ela.
--
-- As visões e `preco_do_orcamento()` das migrations 33 a 35 continuam de
-- pé e não viram código morto: elas são o mecanismo de QUALQUER nível sem
-- `ver_custos` — inclusive um que o Juliano crie amanhã.
insert into permissoes_capacidade (capacidade, nivel)
values ('ver_custos', 'comercial')
on conflict do nothing;
