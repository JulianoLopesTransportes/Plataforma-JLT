/**
 * PRECIFICAÇÃO — regras de negócio portadas de 06-orcamentos-calculadora.
 *
 * Aqui não há DOM nem React: é aritmética pura, testável isoladamente. A
 * calculadora da UI apenas chama estas funções.
 *
 * As decisões abaixo vieram do módulo original e foram preservadas de
 * propósito, com o raciocínio que as justifica.
 */

import type { FaixaVolume, Adicional } from '../tipos';

/* ==========================================================================
   Faixa de volume
   ========================================================================== */

/**
 * Encontra a faixa cujo teto cobre o volume informado.
 * As faixas são percorridas em ordem crescente de teto; a última funciona
 * como faixa aberta ("acima de").
 */
export function faixaParaVolume(faixas: FaixaVolume[], volumeM3: number): FaixaVolume | null {
  const ordenadas = [...faixas].sort((a, b) => a.ate - b.ate);
  return ordenadas.find((f) => volumeM3 <= f.ate) ?? ordenadas[ordenadas.length - 1] ?? null;
}

/** Rótulo legível da faixa, para aparecer na linha do orçamento. */
export function rotuloFaixa(faixas: FaixaVolume[], faixa: FaixaVolume): string {
  const ordenadas = [...faixas].sort((a, b) => a.ate - b.ate);
  const indice = ordenadas.findIndex((f) => f.id === faixa.id);
  const piso = indice > 0 ? ordenadas[indice - 1].ate : 0;
  const ehUltima = indice === ordenadas.length - 1;
  return ehUltima ? `acima de ${piso} m³` : `${piso}–${faixa.ate} m³`;
}

/* ==========================================================================
   Margem
   ========================================================================== */

/**
 * MARGEM DE LUCRO, NÃO MARKUP.
 *
 *   margem = (preço − custo) / preço   →   preço = custo / (1 − margem)
 *
 * É diferente de markup, que seria custo × (1 + margem) e daria um número
 * menor para a mesma taxa. A distinção importa: a 40%, markup devolve
 * 1,40× o custo e margem devolve 1,67×.
 *
 * MARGEM NEGATIVA É PERMITIDA e é usada de propósito para fechar abaixo do
 * custo. A fórmula lida com isso sem caso especial: a −40% ela devolve
 * custo / 1,4, ou seja ~71% do custo.
 *
 * O teto é que precisa de trava: perto de 100% a divisão tende ao infinito.
 */
export const MARGEM_TETO = 95;
export const MARGEM_PISO = -95;

export function precoComMargem(custo: number, margemPercentual: number): number {
  const limitada = Math.max(MARGEM_PISO, Math.min(margemPercentual, MARGEM_TETO));
  return custo / (1 - limitada / 100);
}

/**
 * Quanto a margem acrescenta ao custo, em BRL.
 * Negativo quando a margem é negativa — é o desconto embutido.
 */
export function valorDaMargem(custo: number, margemPercentual: number): number {
  return precoComMargem(custo, margemPercentual) - custo;
}

/* ==========================================================================
   Fator oportunidade
   ========================================================================== */

/** Escala do controle na tela: 0 a 10, de meio em meio. */
export const FATOR_MIN = 0;
export const FATOR_MAX = 10;
export const FATOR_PASSO = 0.5;

/**
 * FATOR OPORTUNIDADE — a escala que o operador enxerga.
 *
 * Vai de 0 a 10, de 0,5 em 0,5, e é deliberadamente o inverso da margem:
 *
 *    fator 0   →  margem máxima   (preço cheio, nenhuma concessão)
 *    fator 10  →  margem mínima   (preço mais agressivo, pode ser negativa)
 *
 * A ideia é que quem monta o orçamento raciocine em "quanto esta
 * oportunidade merece de esforço", e não em percentual de margem — que é
 * dado interno e nem todo nível pode ver.
 */
export function margemDoFator(fator: number, margemMin: number, margemMax: number): number {
  const f = Math.max(FATOR_MIN, Math.min(fator, FATOR_MAX));
  const margem = margemMax - ((margemMax - margemMin) / FATOR_MAX) * f;
  // Uma casa decimal: o passo de 0,5 no fator gera frações na margem.
  return Math.round(margem * 10) / 10;
}

/** Caminho inverso: qual fator corresponde a uma margem já escolhida. */
export function fatorDaMargem(margem: number, margemMin: number, margemMax: number): number {
  if (margemMax === margemMin) return 0;
  const bruto = ((margemMax - margem) / (margemMax - margemMin)) * FATOR_MAX;
  // Encaixa no passo de 0,5 para o controle não parar entre marcas.
  const encaixado = Math.round(bruto / FATOR_PASSO) * FATOR_PASSO;
  return Math.max(FATOR_MIN, Math.min(encaixado, FATOR_MAX));
}

/** Rótulo do fator para exibir ao lado do controle. */
export function descreverFator(fator: number): string {
  if (fator <= 1) return 'Preço cheio';
  if (fator <= 3) return 'Pouca concessão';
  if (fator <= 5) return 'Equilibrado';
  if (fator <= 7) return 'Competitivo';
  if (fator <= 9) return 'Agressivo';
  return 'Máxima concessão';
}

/* ==========================================================================
   Arredondamento comercial
   ========================================================================== */

/**
 * Arredonda para um número "redondo" quando isso custa pouco.
 *
 * Testa múltiplos de 100, 50 e 10, nesta ordem, e aceita o primeiro que
 * fique a no máximo R$ 8 ou 0,3% do valor — o que for maior. Assim
 * R$ 8.943 vira R$ 8.950, mas R$ 8.700 não vira R$ 9.000: o objetivo é
 * tirar os centavos de cálculo, não alterar o preço.
 */
export function arredondarAtrativo(valor: number): number {
  for (const base of [100, 50, 10]) {
    const candidato = Math.round(valor / base) * base;
    if (Math.abs(candidato - valor) <= Math.max(8, valor * 0.003)) {
      return candidato;
    }
  }
  return Math.round(valor / 10) * 10;
}

/* ==========================================================================
   Cálculo completo
   ========================================================================== */

export type LinhaOrcamento = {
  rotulo: string;
  valor: number;
};

export type ResultadoOrcamento = {
  /** Composição do custo, linha a linha. Dado interno — some para Comercial. */
  linhas: LinhaOrcamento[];
  /** Custo total antes da margem. Dado interno. */
  custoTotal: number;
  margemPercentual: number;
  /** Quanto a margem acrescenta, em BRL. Dado interno. */
  valorMargem: number;
  /** Preço calculado, com centavos. */
  precoFinal: number;
  /** Preço sugerido para apresentar ao cliente. */
  precoRedondo: number;
  parcelamento: Parcelamento;
};

export type Parcelamento = {
  sinal: number;
  primeiraParcela: number;
  segundaParcela: number;
};

/**
 * Parcelamento padrão da empresa:
 *   sinal      — 10% do preço, com piso de R$ 500, na assinatura
 *   1ª parcela — metade do saldo, no carregamento
 *   2ª parcela — o restante, antes do descarregamento
 */
export function calcularParcelamento(precoFinal: number): Parcelamento {
  const sinal = Math.max(precoFinal * 0.1, 500);
  const saldo = precoFinal - sinal;
  const primeiraParcela = saldo * 0.5;
  return {
    sinal,
    primeiraParcela,
    segundaParcela: saldo - primeiraParcela,
  };
}

export type EntradaOrcamento = {
  volumeM3: number;
  distanciaKm: number;
  custoPorKm: number;
  margemPercentual: number;
  faixas: FaixaVolume[];
  adicionais: Adicional[];
  /** ids de adicionais marcados; para os percentuais, a quantidade aplicada. */
  adicionaisSelecionados: { id: string; quantidade: number }[];
};

/**
 * Monta o orçamento completo.
 *
 * Ordem do cálculo, herdada do módulo original:
 *   1. preço base da faixa de volume
 *   2. + distância × custo por km
 *   3. + adicionais (fixos pelo valor; percentuais pelo valor × quantidade)
 *   4. aplica a margem sobre o subtotal
 */
export function calcularOrcamento(entrada: EntradaOrcamento): ResultadoOrcamento | null {
  if (entrada.volumeM3 <= 0) return null;

  const faixa = faixaParaVolume(entrada.faixas, entrada.volumeM3);
  if (!faixa) return null;

  const linhas: LinhaOrcamento[] = [
    {
      rotulo: `Preço base (${rotuloFaixa(entrada.faixas, faixa)})`,
      valor: faixa.valorBase,
    },
  ];

  if (entrada.distanciaKm > 0) {
    linhas.push({
      rotulo: `Distância (${entrada.distanciaKm} km)`,
      valor: entrada.distanciaKm * entrada.custoPorKm,
    });
  }

  for (const selecao of entrada.adicionaisSelecionados) {
    const adicional = entrada.adicionais.find((a) => a.id === selecao.id);
    if (!adicional) continue;

    const quantidade = selecao.quantidade || 1;

    if (adicional.tipo === 'fixo') {
      linhas.push({ rotulo: adicional.nome, valor: adicional.valor });
    } else if (adicional.tipo === 'por_unidade') {
      // Ex.: "Caixas embaladas (12 caixas)".
      const unidade = adicional.unidade || 'un';
      linhas.push({
        rotulo: `${adicional.nome} (${quantidade} ${unidade}${quantidade > 1 ? 's' : ''})`,
        valor: adicional.valor * quantidade,
      });
    } else {
      // Percentual incide sobre o preço base da faixa, não sobre o total —
      // caso contrário a ordem dos adicionais mudaria o resultado.
      linhas.push({
        rotulo: `${adicional.nome} (${adicional.valor}%${quantidade > 1 ? ` × ${quantidade}` : ''})`,
        valor: (faixa.valorBase * adicional.valor * quantidade) / 100,
      });
    }
  }

  const custoTotal = linhas.reduce((soma, l) => soma + l.valor, 0);
  const precoFinal = precoComMargem(custoTotal, entrada.margemPercentual);

  return {
    linhas,
    custoTotal,
    margemPercentual: entrada.margemPercentual,
    valorMargem: precoFinal - custoTotal,
    precoFinal,
    precoRedondo: arredondarAtrativo(precoFinal),
    parcelamento: calcularParcelamento(precoFinal),
  };
}
