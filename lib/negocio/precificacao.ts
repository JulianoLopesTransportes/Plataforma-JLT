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
 * Por isso a margem máxima precisa ficar bem abaixo de 100%: a fórmula
 * tende ao infinito quando a margem se aproxima de 1.
 */
export function precoComMargem(custo: number, margemPercentual: number): number {
  const margem = Math.min(margemPercentual, 99) / 100;
  return custo / (1 - margem);
}

/** Quanto da margem, em BRL, está embutido no preço. */
export function valorDaMargem(custo: number, margemPercentual: number): number {
  return precoComMargem(custo, margemPercentual) - custo;
}

/**
 * Margem sugerida a partir de uma escala 0–10, onde 0 é a margem máxima e
 * 10 a mínima. Serve ao controle deslizante "quanto quero ser agressivo
 * neste orçamento" da tela original.
 */
export function margemSugerida(escala: number, margemMin: number, margemMax: number): number {
  return Math.round(margemMax - ((margemMax - margemMin) / 10) * escala);
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

    if (adicional.tipo === 'fixo') {
      linhas.push({ rotulo: adicional.nome, valor: adicional.valor });
    } else {
      // Percentual incide sobre o preço base da faixa, não sobre o total —
      // caso contrário a ordem dos adicionais mudaria o resultado.
      const quantidade = selecao.quantidade || 1;
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
