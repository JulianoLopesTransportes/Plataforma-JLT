-- Fecha a etapa 1 do refino: tira a função de preço errada e indexa as
-- chaves estrangeiras que a aplicação realmente percorre.

-- 1. `calcular_preco()` cai.
--
-- Ela é da migration 04 e calcula ERRADO para o modelo de hoje: ignora
-- adicional por unidade e por quantidade, e não arredonda. O README já
-- dizia "não usar" — mas dizer não impede, e ela continuava chamável por
-- /rest/v1/rpc por qualquer autenticado.
--
-- No levantamento eu a classifiquei como morta. Estava errado: havia um
-- wrapper vivo em lib/api/admin.ts chamando-a. Nenhuma tela chamava o
-- wrapper, então os dois saem juntos — o wrapper neste mesmo commit.
--
-- Quem faz esse trabalho hoje é `preco_do_orcamento()`, da migration 35,
-- que recebe o FATOR da régua em vez da margem. A diferença não é estilo:
-- a faixa mínima/máxima da régua também é custo, e mandar margem já
-- calculada pela tela fazia o Comercial cotar diferente do admin no mesmo
-- ponto da régua.
drop function if exists public.calcular_preco(numeric, numeric, uuid[], numeric);

-- 2. Índices nas FKs que a aplicação percorre.
--
-- O linter aponta 21 FKs sem índice. Não são 21 que valem: índice em FK
-- cujo PAI tem quatro linhas (`niveis`) nunca vai ser escolhido pelo
-- planejador, e passa a ser peso morto na escrita. Então vão os que a
-- aplicação realmente usa, e ficam de fora os de coluna de auditoria
-- (`criado_por`, `autor`, `enviado_por`) e os de tabela de domínio minúscula.
--
-- NÃO estou derrubando os 16 índices que o linter chama de "sem uso". Eles
-- estão sem uso porque as tabelas têm dezenas de linhas e o Postgres varre
-- direto — não porque as consultas não existam. Derrubá-los seria otimizar
-- contra um banco frio e recriá-los quando a operação crescer.

-- Anexos: lidos em TODA abertura de ficha, via select aninhado.
create index if not exists veiculo_anexos_veiculo_idx on veiculo_anexos(veiculo_id);
create index if not exists motorista_anexos_motorista_idx on motorista_anexos(motorista_id);

-- Agenda filtra por veículo, motorista e rota.
create index if not exists compromissos_veiculo_idx on compromissos(veiculo_id);
create index if not exists compromissos_motorista_idx on compromissos(motorista_id);
create index if not exists compromissos_rota_idx on compromissos(rota_id);

-- Gastos e Ganhos filtra pelos três vínculos. O de veículo já existia.
create index if not exists lancamentos_cliente_idx on lancamentos(cliente_id);
create index if not exists lancamentos_motorista_idx on lancamentos(motorista_id);
create index if not exists lancamentos_rota_idx on lancamentos(rota_id);

-- Rotas e Relatórios filtram por veículo e motorista.
create index if not exists rotas_veiculo_fk_idx on rotas(veiculo_id);
create index if not exists rotas_motorista_fk_idx on rotas(motorista_id);

-- Percorridas ao ler uma rota e ao ler um orçamento.
create index if not exists mudancas_cliente_idx on mudancas(cliente_id);
create index if not exists orcamento_adicionais_adicional_idx on orcamento_adicionais(adicional_id);
