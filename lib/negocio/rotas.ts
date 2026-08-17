/**
 * ROTAS — motor de ocupação e alertas, portado de referencia/07-rotas_1.html
 *
 * Sem DOM: recebe a rota, devolve números e avisos. É a parte do sistema
 * que mais carrega conhecimento de operação, então os porquês estão escritos.
 *
 * Uma diferença de modelagem em relação ao original: lá uma parada tinha um
 * `tipo` (coleta ou entrega) e uma lista única de mudanças. Aqui a parada
 * tem `embarcam` e `desembarcam` separados, o que permite representar uma
 * parada mista — descarregar uma mudança e carregar outra no mesmo ponto —
 * que o modelo antigo não conseguia expressar.
 */

import { diasEntre, formatarData } from '../utils/formato';
import type { Rota, Parada, Veiculo } from '../tipos';

/** Descanso mínimo de referência entre jornadas, em horas. */
export const MARGEM_DESCANSO_HORAS = 11;

/** A partir de quantos dias parados um intervalo vira alerta de ociosidade. */
export const LIMITE_DIAS_OCIOSO = 6;

/** Percentual de ocupação a partir do qual avisamos que está apertado. */
export const LIMIAR_LOTACAO_ALERTA = 90;

/* ==========================================================================
   Ocupação
   ========================================================================== */

export type OcupacaoParada = {
  parada: Parada;
  /** Volume dentro do caminhão DEPOIS desta parada, em m³. */
  ocupacaoApos: number;
  /** Percentual da capacidade do veículo. null quando não há veículo. */
  percentual: number | null;
  /** Ids das mudanças que seguem viagem a partir daqui. */
  aBordo: string[];
};

/** Paradas em ordem cronológica. */
export function paradasOrdenadas(rota: Rota): Parada[] {
  return [...rota.paradas].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Percorre a rota parada a parada somando o que embarca e subtraindo o que
 * desembarca. É isto que responde "o caminhão cabe?" em cada trecho — a
 * ocupação de pico raramente está na primeira nem na última parada.
 */
export function calcularOcupacao(rota: Rota, capacidadeM3: number | null): OcupacaoParada[] {
  const ordenadas = paradasOrdenadas(rota);
  const volumeDe = (id: string) => rota.mudancas.find((m) => m.id === id)?.volumeM3 ?? 0;

  let acumulado = 0;
  const aBordo = new Set<string>();

  return ordenadas.map((parada) => {
    for (const id of parada.embarcam) {
      acumulado += volumeDe(id);
      aBordo.add(id);
    }
    for (const id of parada.desembarcam) {
      acumulado -= volumeDe(id);
      aBordo.delete(id);
    }

    // Nunca negativo: um desembarque sem embarque correspondente é erro de
    // cadastro, e um número negativo na tela só confundiria.
    const ocupacao = Math.max(0, acumulado);

    return {
      parada,
      ocupacaoApos: ocupacao,
      percentual: capacidadeM3 && capacidadeM3 > 0 ? (ocupacao / capacidadeM3) * 100 : null,
      aBordo: [...aBordo],
    };
  });
}

/** Maior ocupação atingida em qualquer trecho da rota. */
export function ocupacaoDePico(ocupacoes: OcupacaoParada[]): number {
  return ocupacoes.reduce((maior, o) => Math.max(maior, o.ocupacaoApos), 0);
}

/** Volume total transportado na rota (soma de todas as mudanças). */
export function volumeTotal(rota: Rota): number {
  return rota.mudancas.reduce((soma, m) => soma + m.volumeM3, 0);
}

/* ==========================================================================
   Alertas
   ========================================================================== */

export type NivelAlerta = 'danger' | 'warning' | 'info';

export type Alerta = {
  nivel: NivelAlerta;
  texto: string;
};

/** Duas cidades são a mesma? Comparação tolerante a acento e caixa. */
function mesmaCidade(a: string, b: string): boolean {
  const normalizar = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  return normalizar(a) === normalizar(b);
}

/**
 * Varre a rota procurando três famílias de problema:
 *
 *  1. LOTAÇÃO — o caminhão estoura ou chega perto da capacidade em algum
 *     trecho. Checado por trecho, não pelo total, porque o total pode caber
 *     e mesmo assim haver um pico no meio do caminho.
 *
 *  2. VIABILIDADE E FADIGA — o intervalo entre duas paradas em cidades
 *     diferentes precisa comportar o deslocamento e ainda sobrar descanso
 *     para o motorista.
 *
 *  3. OCIOSIDADE — intervalos longos demais entre paradas significam
 *     caminhão e carga parados, o que custa dinheiro.
 */
export function detectarAlertas(rota: Rota, veiculo: Veiculo | null): Alerta[] {
  const alertas: Alerta[] = [];
  const capacidade = veiculo?.capacidadeM3 ?? null;
  const ocupacoes = calcularOcupacao(rota, capacidade);
  const ordenadas = paradasOrdenadas(rota);

  // --- 1. Lotação ---
  if (capacidade === null) {
    alertas.push({
      nivel: 'info',
      texto:
        'Nenhum veículo atribuído a esta rota — sem capacidade definida, não é possível conferir a lotação.',
    });
  } else {
    for (const { parada, ocupacaoApos, percentual } of ocupacoes) {
      if (percentual === null) continue;

      if (percentual > 100) {
        alertas.push({
          nivel: 'danger',
          texto: `Lotação estourada em ${parada.cidade} (${formatarData(parada.data)}): ${ocupacaoApos.toFixed(1)} m³ para capacidade de ${capacidade} m³.`,
        });
      } else if (percentual >= LIMIAR_LOTACAO_ALERTA) {
        alertas.push({
          nivel: 'warning',
          texto: `Lotação próxima do limite em ${parada.cidade} (${formatarData(parada.data)}): ${percentual.toFixed(0)}% ocupado.`,
        });
      }
    }
  }

  // --- 2 e 3. Tempo entre paradas ---
  for (let i = 1; i < ordenadas.length; i++) {
    const anterior = ordenadas[i - 1];
    const atual = ordenadas[i];
    const dias = diasEntre(anterior.data, atual.data);

    if (!mesmaCidade(anterior.cidade, atual.cidade) && dias === 0) {
      alertas.push({
        nivel: 'warning',
        texto: `${anterior.cidade} → ${atual.cidade} na mesma data — confira se o deslocamento cabe no mesmo dia, considerando ${MARGEM_DESCANSO_HORAS}h de descanso obrigatório.`,
      });
    }

    if (dias >= LIMITE_DIAS_OCIOSO) {
      alertas.push({
        nivel: 'info',
        texto: `Intervalo de ${dias} dias entre ${anterior.cidade} (${formatarData(anterior.data)}) e ${atual.cidade} (${formatarData(atual.data)}) — caminhão e carga parados por um bom tempo, vale revisar.`,
      });
    }
  }

  // --- Consistência do cadastro ---
  const embarcadas = new Set(ordenadas.flatMap((p) => p.embarcam));
  const desembarcadas = new Set(ordenadas.flatMap((p) => p.desembarcam));

  for (const mudanca of rota.mudancas) {
    if (!embarcadas.has(mudanca.id)) {
      alertas.push({
        nivel: 'danger',
        texto: `A carga de ${mudanca.clienteNome} não embarca em nenhuma parada — falta a parada de coleta.`,
      });
    } else if (!desembarcadas.has(mudanca.id)) {
      alertas.push({
        nivel: 'warning',
        texto: `A carga de ${mudanca.clienteNome} embarca mas não desembarca — falta a parada de entrega.`,
      });
    }
  }

  return alertas;
}

/* ==========================================================================
   Kanban
   ========================================================================== */

export const COLUNAS_KANBAN = [
  { status: 'planejada', titulo: 'Planejada' },
  { status: 'carregando', titulo: 'Carregando' },
  { status: 'em_transito', titulo: 'Em trânsito' },
  { status: 'concluida', titulo: 'Concluída' },
] as const;

export const ROTULO_STATUS_ROTA: Record<Rota['status'], string> = {
  planejada: 'Planejada',
  carregando: 'Carregando',
  em_transito: 'Em trânsito',
  concluida: 'Concluída',
};
