-- Anexos deixam de ser uma pilha só e passam a ter gaveta: contrato,
-- orçamento, documento pessoal, e assim por diante.
--
-- Nas TRÊS tabelas, não só na de cliente. lib/api/anexos.ts é um módulo
-- único que atende os três donos; deixar uma tabela sem a coluna
-- obrigaria a um `if` por dono lá dentro, e o seletor aparece só onde faz
-- sentido — hoje, no cliente.
--
-- text com CHECK, e não enum: a lição da migration 20 é que o Postgres
-- não remove valor de enum. Categoria é lista que vai mudar com o uso, e
-- com CHECK basta um ALTER para acrescentar ou tirar uma.
--
-- Default 'outro': nenhum anexo fica sem gaveta, e os que já existem
-- entram lá sem exigir decisão retroativa sobre arquivo que ninguém
-- lembra mais.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['cliente_anexos', 'veiculo_anexos', 'motorista_anexos']
  loop
    execute format(
      'alter table %I add column if not exists categoria text not null default ''outro''',
      v_tabela
    );

    execute format(
      'alter table %I drop constraint if exists %I',
      v_tabela, v_tabela || '_categoria_ck'
    );

    execute format(
      'alter table %I add constraint %I check (categoria in (
         ''contrato'', ''orcamento'', ''documento_pessoal'',
         ''comprovante_endereco'', ''inventario'', ''foto'', ''outro''
       ))',
      v_tabela, v_tabela || '_categoria_ck'
    );

    execute format(
      'comment on column %I.categoria is %L',
      v_tabela,
      'Gaveta do anexo. Fica só aqui, nunca no caminho do Storage: recategorizar vira UPDATE em vez de copiar-e-apagar o arquivo.'
    );
  end loop;
end $$;
