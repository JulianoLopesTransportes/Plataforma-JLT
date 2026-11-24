/**
 * O BANCO É O MESMO QUE O REPOSITÓRIO?
 *
 * Por que isto existe
 * -------------------
 * As migrations são aplicadas no projeto remoto colando o SQL, e colar é
 * um passo onde o texto pode mudar sem ninguém ver. Aconteceu: doze
 * funções chegaram ao banco sem acento e sem comentário. Uma delas,
 * `registra_mudanca_na_rota`, grava no histórico da rota o que a equipe lê
 * — o banco dizia "veiculo alterado", "saida: 2026-11-30 -> 2026-12-02",
 * e o repositório dizia "veículo alterado", "saída: … → …".
 *
 * Nada acusava. O build passava, o TypeScript passava, os testes de
 * segurança passavam: todos olham o repositório, e o problema estava
 * SÓ no banco.
 *
 * Como usar
 * ---------
 *   npm run conferir-sql
 *
 * Ele não conversa com o banco — imprime UMA consulta. Rode a consulta no
 * projeto (SQL Editor do Supabase, psql, o que for). Ela levanta exceção
 * se alguma função divergir, e lista quais.
 *
 * A lista de md5 é gerada dos arquivos a cada execução, nunca guardada:
 * lista guardada envelhece e passa a mentir, que é o mesmo defeito que
 * este script existe para pegar.
 *
 * O que ele NÃO cobre: as funções das migrations 01 a 12, cujos arquivos
 * .sql nunca entraram no repositório (ver supabase/README.md). Sem
 * arquivo não há com o que comparar. A consulta as ignora explicitamente,
 * em vez de acusar falsa divergência.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(RAIZ, 'supabase', 'migrations');

/**
 * Corta o arquivo nos cabeçalhos de função antes de procurar o corpo.
 *
 * Sem o corte, um `[\s\S]*?` atravessa de uma função para a seguinte e
 * casa o nome de uma com o corpo da outra — e o resultado PARECE certo.
 */
function corpos(texto) {
  const cabecalho = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_]+)\s*\(/g;
  const marcos = [];
  let m;
  while ((m = cabecalho.exec(texto))) marcos.push({ nome: m[1], de: m.index });

  const achados = [];
  for (let i = 0; i < marcos.length; i++) {
    const fim = i + 1 < marcos.length ? marcos[i + 1].de : texto.length;
    const trecho = texto.slice(marcos[i].de, fim);

    const abre = trecho.indexOf('as $$');
    if (abre === -1) continue;
    const inicio = abre + 'as $$'.length;
    const fecha = trecho.lastIndexOf('$$;');
    if (fecha <= inicio) continue;

    achados.push({ nome: marcos[i].nome, corpo: trecho.slice(inicio, fecha) });
  }
  return achados;
}

const esperado = new Map();

for (const arquivo of readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))) {
  const texto = readFileSync(join(MIGRATIONS, arquivo), 'utf8').replace(/\r\n/g, '\n');
  // A última definição é a que vale — migration posterior substitui.
  for (const { nome, corpo } of corpos(texto)) {
    esperado.set(nome, createHash('md5').update(corpo, 'utf8').digest('hex'));
  }
}

const linhas = [...esperado]
  .sort()
  .map(([nome, md5]) => `    ('${nome}', '${md5}')`)
  .join(',\n');

console.log(`-- Gerado por npm run conferir-sql a partir de supabase/migrations.
-- ${esperado.size} funções conferidas. Rode no projeto remoto.
do $conferencia$
declare
  v_divergentes text;
begin
  with esperado(nome, md5_arquivo) as (values
${linhas}
  )
  select string_agg(e.nome, ', ' order by e.nome) into v_divergentes
  from esperado e
  left join pg_proc p
    on p.proname = e.nome
   and p.pronamespace = 'public'::regnamespace
  where p.oid is null or md5(p.prosrc) <> e.md5_arquivo;

  if v_divergentes is not null then
    raise exception 'Banco diferente do repositório em: %', v_divergentes;
  end if;

  raise notice 'OK — as % funções do repositório estão idênticas no banco.', ${esperado.size};
end;
$conferencia$;`);
