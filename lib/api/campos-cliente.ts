/**
 * Conversão dos campos de cliente da tela para as colunas do banco.
 *
 * Arquivo próprio, e não um pedaço de api/index.ts, por dois motivos:
 * faz uma coisa só, e é testável sem arrastar Supabase nem os JSON de
 * mock que aquele módulo importa. Era onde um bug silencioso morava.
 */

import type { Cliente, CamposCliente } from '../tipos';


/**
 * De campo do app para coluna do banco.
 *
 * `Record<keyof CamposCliente, string>` é o ponto inteiro deste mapa: o
 * TypeScript EXIGE uma entrada para cada campo editável, então esquecer de
 * mapear um campo novo não compila.
 *
 * Antes isto era uma sequência de `if (mudancas.x !== undefined)` escrita à
 * mão, que o compilador não tinha como conferir. `origem`, `origemDetalhe` e
 * `tipo` nunca entraram nela: desde o primeiro commit da camada de dados, a
 * tela avisava que havia salvado e o UPDATE saía sem esses campos. O
 * Postgres não tem o que reclamar de um UPDATE que não os menciona, então
 * não vinha erro nenhum — a falha era silenciosa dos dois lados.
 */
const COLUNA_CLIENTE: Record<keyof CamposCliente, string> = {
  tipo: 'tipo',
  nome: 'nome',
  documento: 'documento',
  telefone: 'telefone',
  email: 'email',
  status: 'status',
  origem: 'origem',
  origemDetalhe: 'origem_detalhe',
  enderecoColeta: 'endereco_coleta',
  enderecoEntrega: 'endereco_entrega',
  volumeM3: 'volume_m3',
  dataPrevista: 'data_prevista',
  observacoes: 'observacoes',
  itens: 'itens',
  responsavelId: 'responsavel_id',
};

/**
 * Colunas que o banco quer como NULL quando a tela manda string vazia.
 *
 * `data_prevista` é date: '' não é data, e o Postgres recusaria. As de texto
 * aceitam '' e devem continuar gravando '', senão "apagar a observação"
 * viraria uma coisa diferente de "nunca escrevi observação".
 */
const VAZIO_VIRA_NULL = new Set<keyof CamposCliente>(['dataPrevista']);

/**
 * Converte os campos mexidos na tela nas colunas do UPDATE.
 *
 * Campo ausente de `mudancas` fica fora do objeto, e por isso fora do
 * UPDATE: é o que permite salvar só o telefone sem reescrever o resto. Vale
 * especialmente para `responsavel_id`, porque a trava
 * `clientes_protege_responsavel` é um `before update of responsavel_id` e
 * rodaria à toa em cada salvamento de telefone.
 *
 * Exportada para ser testável sem banco — é onde o bug morava.
 */
export function camposDeCliente(mudancas: Partial<Cliente>): Record<string, unknown> {
  const campos: Record<string, unknown> = {};

  for (const chave of Object.keys(COLUNA_CLIENTE) as (keyof CamposCliente)[]) {
    const valor = mudancas[chave];
    if (valor === undefined) continue;
    campos[COLUNA_CLIENTE[chave]] = VAZIO_VIRA_NULL.has(chave) && !valor ? null : valor;
  }

  return campos;
}
