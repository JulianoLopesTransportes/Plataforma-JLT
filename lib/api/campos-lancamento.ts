/**
 * Conversão dos campos de lançamento da tela para as colunas do banco.
 *
 * Mesmo desenho de campos-cliente.ts, e pelo mesmo motivo: lá a conversão
 * era uma sequência de `if (mudancas.x !== undefined)` escrita à mão, o
 * compilador não tinha como conferir, e três campos ficaram de fora desde o
 * primeiro commit — a tela avisava que havia salvado e o UPDATE saía sem
 * eles. `financeiro.atualizar()` nasce já com a trava.
 */

import type { Lancamento, CamposLancamento } from '../tipos';

/**
 * De campo do app para coluna do banco.
 *
 * `Record<keyof CamposLancamento, string>` obriga uma entrada por campo
 * editável: acrescentar campo em Lancamento sem mapear a coluna aqui não
 * compila.
 */
const COLUNA_LANCAMENTO: Record<keyof CamposLancamento, string> = {
  tipo: 'tipo',
  data: 'data',
  valor: 'valor',
  categoria: 'categoria',
  descricao: 'descricao',
  veiculoId: 'veiculo_id',
  motoristaId: 'motorista_id',
  clienteId: 'cliente_id',
};

/**
 * Campos que o banco quer como NULL quando a tela manda string vazia.
 *
 * Os três vínculos são uuid: '' não é uuid e o Postgres recusaria. `data` é
 * date e NÃO entra aqui — lançamento sem data não existe, a coluna é NOT
 * NULL, e mandar null daria um erro honesto em vez de gravar meia verdade.
 */
const VAZIO_VIRA_NULL = new Set<keyof CamposLancamento>([
  'veiculoId',
  'motoristaId',
  'clienteId',
]);

/**
 * Converte os campos mexidos na tela nas colunas do UPDATE.
 *
 * Campo ausente fica fora do objeto, e por isso fora do UPDATE: é o que
 * permite corrigir só o valor sem reescrever o resto do lançamento.
 */
export function camposDeLancamento(mudancas: Partial<Lancamento>): Record<string, unknown> {
  const campos: Record<string, unknown> = {};

  for (const chave of Object.keys(COLUNA_LANCAMENTO) as (keyof CamposLancamento)[]) {
    const valor = mudancas[chave];
    if (valor === undefined) continue;
    campos[COLUNA_LANCAMENTO[chave]] = VAZIO_VIRA_NULL.has(chave) && !valor ? null : valor;
  }

  return campos;
}
