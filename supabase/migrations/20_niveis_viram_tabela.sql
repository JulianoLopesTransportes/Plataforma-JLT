-- Níveis deixam de ser enum e viram dado.
--
-- Motivo: o Postgres não remove valor de enum. Com níveis criáveis pela
-- plataforma, um "Ajudante" cadastrado por engano ficaria no tipo para
-- sempre — e o tipo é usado em quatro tabelas e dentro do RLS. Tabela
-- com FK permite criar, renomear e excluir de verdade.
create table if not exists niveis (
  id text primary key,
  rotulo text not null,
  ordem int not null default 100,
  -- Os quatro originais. Não podem ser excluídos: o código assume que
  -- existem (a semente de lib/permissoes.ts, o fallback do provisionamento
  -- de perfil) e sumir com eles quebraria mais do que a tela.
  sistema boolean not null default false,
  criado_em timestamptz not null default now()
);

insert into niveis (id, rotulo, ordem, sistema) values
  ('admin',       'Administrador', 1, true),
  ('financeiro',  'Financeiro',    2, true),
  ('operacional', 'Operacional',   3, true),
  ('comercial',   'Comercial',     4, true)
on conflict (id) do nothing;

alter table niveis enable row level security;

-- Todo mundo lê os níveis: a tela precisa do rótulo para exibir o cargo
-- de qualquer pessoa. Escrever, só quem edita usuários.
create policy niveis_leitura on niveis for select using (true);
create policy niveis_escrita on niveis for all
  using (pode_editar('usuarios')) with check (pode_editar('usuarios'));
