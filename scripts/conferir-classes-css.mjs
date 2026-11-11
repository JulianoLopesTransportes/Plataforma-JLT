/**
 * Confere que toda classe de CSS Module usada no código existe no .css.
 *
 * POR QUE: o TypeScript não pega isso. CSS Module é tipado com índice
 * livre (`{ [k: string]: string }`), então `estilos.classe_que_nao_existe`
 * compila e vira `undefined` em tempo de execução. O elemento sai sem a
 * classe, sem erro, sem aviso — foi assim que as bolinhas do calendário
 * sumiram em 27/08/2026, quando um tipo de compromisso foi renomeado.
 *
 * Os Records de classe resolvem a outra ponta (valor novo sem classe não
 * compila). Este script resolve esta: classe renomeada no .css.
 *
 * Uso: node scripts/conferir-classes-css.mjs
 * Sai com código 1 se achar referência órfã.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const PASTAS = ['app', 'components'];

/** Varre .tsx/.ts recursivamente, ignorando node_modules. */
function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '.next') continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, acc);
    else if (/\.tsx?$/.test(caminho)) acc.push(caminho);
  }
  return acc;
}

/** As classes declaradas num .module.css. */
function classesDo(css) {
  const texto = readFileSync(css, 'utf8');
  const encontradas = new Set();
  // .nomeDaClasse — para de ler no primeiro caractere que não é de nome.
  for (const m of texto.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) encontradas.add(m[1]);
  return encontradas;
}

let orfas = 0;
let conferidas = 0;

for (const pasta of PASTAS) {
  for (const arquivo of arquivos(join(RAIZ, pasta))) {
    const fonte = readFileSync(arquivo, 'utf8');

    // import estilos from './x.module.css'
    for (const imp of fonte.matchAll(
      /import\s+(\w+)\s+from\s+['"](\.[^'"]*\.module\.css)['"]/g,
    )) {
      const [, variavel, relativo] = imp;
      const css = resolve(dirname(arquivo), relativo);
      let declaradas;
      try {
        declaradas = classesDo(css);
      } catch {
        console.log(`FALHA  ${arquivo}: não consegui ler ${relativo}`);
        orfas++;
        continue;
      }

      // variavel.nome — só acesso por ponto; o acesso por colchete com
      // texto montado é justamente o que este projeto deixou de usar.
      const usadas = new Set();
      const re = new RegExp(`\\b${variavel}\\.([_a-zA-Z][\\w]*)`, 'g');
      for (const u of fonte.matchAll(re)) usadas.add(u[1]);

      for (const classe of usadas) {
        conferidas++;
        if (!declaradas.has(classe)) {
          console.log(`ORFA   ${arquivo.replace(RAIZ, '.')} → ${variavel}.${classe}`);
          console.log(`       não existe em ${relativo}`);
          orfas++;
        }
      }
    }
  }
}

console.log(
  orfas === 0
    ? `\nOK — ${conferidas} referências de classe conferidas, nenhuma órfã.`
    : `\n${orfas} referência(s) órfã(s) de ${conferidas} conferidas.`,
);
process.exit(orfas === 0 ? 0 : 1);
