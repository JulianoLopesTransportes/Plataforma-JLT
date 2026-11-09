-- Duas SAÍDAS no funil de clientes, além dos quatro degraus que já existem.
--
--   Sem resposta — procurou, não voltou. Pode voltar a andar depois.
--   Perdida      — não vai seguir com a JLT. Fim de linha.
--
-- Não são degraus: ninguém "avança para Perdida". O botão de avançar segue
-- o funil linear (Novo → Em andamento → Fechada → Finalizada), e estas duas
-- se escolhem no seletor. Quem sustenta essa distinção é `FUNIL_CLIENTE` em
-- lib/tipos.ts — antes desta mudança `proximoStatus()` andava por ÍNDICE do
-- array de status, e acrescentar valores no fim faria um cliente Finalizada
-- exibir "Avançar para Sem resposta".
--
-- AFTER 'Finalizada' nos dois para a ordem do enum bater com a ordem do
-- array no app: funil primeiro, saídas agrupadas no fim.
--
-- Enum não perde valor no Postgres. Se um destes dois se mostrar errado, o
-- caminho é o da migration 20 — virar tabela —, não um DROP que não existe.
alter type status_cliente add value if not exists 'Sem resposta' after 'Finalizada';
alter type status_cliente add value if not exists 'Perdida' after 'Sem resposta';
