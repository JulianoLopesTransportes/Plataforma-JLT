-- A rota passa a ser montada cidade a cidade, e numa mesma cidade pode-se
-- coletar de dois clientes em ruas diferentes. O endereço, que antes era
-- um só por parada, passa a acompanhar cada movimento.
--
-- A coluna paradas.endereco continua existindo: as rotas já gravadas a
-- usam, e a linha do tempo cai nela quando o movimento não tem endereço
-- próprio. O que muda é que o formulário deixa de escrevê-la.
alter table parada_movimentos
  add column if not exists endereco text not null default '';

comment on column parada_movimentos.endereco is
  'Endereço desta coleta ou entrega, puxado do cadastro do cliente. Vazio cai no endereço da parada.';

-- A ordem das cidades vira dado de verdade: agora o usuário monta uma
-- sequência e pode reordená-la, então a posição não é mais dedutível da
-- data (duas cidades podem cair no mesmo dia).
comment on column paradas.ordem is
  'Posição da cidade na sequência da rota, a partir de 0. Desempata paradas de mesma data.';
