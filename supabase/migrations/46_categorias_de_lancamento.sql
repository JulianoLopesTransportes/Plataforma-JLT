-- Categorias de lançamento deixam de ser texto livre e viram dado editável.
--
-- Até aqui `lancamentos.categoria` era text sem amarra, e a lista oferecida
-- na tela saía de um `select distinct categoria` dos próprios lançamentos:
-- categoria só passava a existir depois que alguém a digitava. O resultado
-- estava no banco do Juliano — "Almoço" e "Café" para a mesma coisa,
-- "Combustivel" sem acento ao lado de "Diesel". Quatro categorias para o
-- que são duas, e o relatório por categoria somando errado.

-- 1. A tabela.
--
-- `nome` é a CHAVE, não um id separado. Isso é o que permite o
-- `on update cascade` lá embaixo: renomear a categoria arrasta o histórico
-- inteiro junto, sem migração de dado a cada rename. O preço é conhecido e
-- foi aceito pelo Juliano: relatório tirado antes e depois do rename mostra
-- nomes diferentes para o mesmo gasto.
--
-- `aplica_a` existe porque as seis categorias dele são todas de GASTO. Sem
-- isso o formulário de ganho ofereceria "Combustível" e "Imposto".
create table if not exists categorias_lancamento (
  nome text primary key,
  aplica_a text not null default 'ambos' check (aplica_a in ('gasto', 'ganho', 'ambos')),
  -- Desativar é como se tira uma categoria de circulação: ela sai do
  -- seletor e o histórico continua legível. Apagar é o que o
  -- `on delete restrict` recusa quando há lançamento usando.
  ativo boolean not null default true,
  -- A ordem do seletor é a que o Juliano ditou, não alfabética.
  ordem integer not null default 100
);

alter table categorias_lancamento enable row level security;

create policy categorias_lancamento_sel on categorias_lancamento
  for select using (pode_ver('financeiro'));

create policy categorias_lancamento_escrita on categorias_lancamento
  for all using (pode_editar('financeiro')) with check (pode_editar('financeiro'));

-- 2. As seis do Juliano, na ordem em que ele as escreveu.
insert into categorias_lancamento (nome, aplica_a, ordem) values
  ('Refeição',        'gasto', 10),
  ('Combustível',     'gasto', 20),
  ('Manutenção',      'gasto', 30),
  ('Imposto',         'gasto', 40),
  ('Comissão',        'gasto', 50),
  ('Ajuda de custo',  'gasto', 60)
on conflict (nome) do nothing;

-- 3. Junta o que já estava lançado.
--
-- Decisão do Juliano: Almoço e Café são Refeição; Combustivel e Diesel são
-- Combustível. Nenhum lançamento é apagado — só reclassificado.
update lancamentos set categoria = 'Refeição'    where categoria in ('Almoço', 'Café');
update lancamentos set categoria = 'Combustível' where categoria in ('Combustivel', 'Diesel');

-- 4. Varre o resto para dentro da tabela, DESATIVADO.
--
-- A FK do passo 5 falha se sobrar um lançamento com categoria que não está
-- na tabela. O passo 3 cobre o que existe hoje, mas esta migration não pode
-- depender de eu ter adivinhado todo o conteúdo do banco: qualquer
-- categoria restante entra como inativa, preservando o lançamento e saindo
-- do seletor. É conserto que o Juliano vê na tela, não dado perdido.
insert into categorias_lancamento (nome, aplica_a, ativo, ordem)
select distinct l.categoria, 'ambos', false, 900
from lancamentos l
where l.categoria is not null
  and l.categoria <> ''
  and not exists (select 1 from categorias_lancamento c where c.nome = l.categoria)
on conflict (nome) do nothing;

-- 5. A amarra.
--
-- on update cascade  — rename propaga para o histórico.
-- on delete restrict — categoria em uso não pode ser apagada; desative.
alter table lancamentos
  drop constraint if exists lancamentos_categoria_fk;

alter table lancamentos
  add constraint lancamentos_categoria_fk
  foreign key (categoria) references categorias_lancamento(nome)
  on update cascade on delete restrict;

-- O seletor e o filtro varrem por aqui.
create index if not exists lancamentos_categoria_idx on lancamentos(categoria);
