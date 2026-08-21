-- Relação de itens da mudança, escrita à mão ou importada de um .txt.
-- Texto livre, um item por linha: é assim que a Ordem de Serviço imprime.
-- Não é o mesmo que o inventário do módulo Documentos, que tem valor
-- declarado por bem e catálogo por ambiente. Aqui é a lista crua que o
-- cliente manda antes da mudança.
alter table clientes
  add column if not exists itens text not null default '';

comment on column clientes.itens is
  'Relação de itens da mudança, um por linha. Sai impressa na Ordem de Serviço.';
