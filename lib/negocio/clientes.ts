/**
 * REGRAS DE CLIENTE — portadas de 01-cadastro-clientes.
 */

import { FUNIL_CLIENTE, type StatusCliente } from '../tipos';
import type { TomBadge } from '@/components/ui';

/**
 * Classificação do porte da mudança pelo volume em m³.
 * Os seis degraus vêm do módulo original e refletem como a operação
 * dimensiona equipe e veículo.
 */
export function classificarVolume(volumeM3: number | null): string {
  if (volumeM3 === null || Number.isNaN(volumeM3)) return '—';
  if (volumeM3 <= 2.5) return 'Pequeno';
  if (volumeM3 <= 10) return 'Médio-pequeno';
  if (volumeM3 <= 25) return 'Médio';
  if (volumeM3 <= 45) return 'Grande';
  if (volumeM3 <= 60) return 'Extra grande';
  return 'Fora do padrão (carga especial)';
}

/** "32 m³ — Grande" */
export function descreverVolume(volumeM3: number | null): string {
  if (volumeM3 === null) return '—';
  return `${volumeM3} m³ — ${classificarVolume(volumeM3)}`;
}

/**
 * Próximo degrau do funil, ou `null` quando não há para onde avançar.
 *
 * Devolve null em dois casos: o cliente está no último degrau
 * ("Finalizada"), ou está numa SAÍDA ("Sem resposta", "Perdida"), que não
 * faz parte do caminho linear. Daí sair de uma saída ser escolha explícita
 * no seletor, e não um "avançar".
 *
 * Caminha por FUNIL_CLIENTE, não por STATUS_CLIENTE. Andar por índice do
 * array completo era o que fazia um cliente Finalizada oferecer "Avançar
 * para Sem resposta" quando os dois status novos entraram.
 */
export function proximoStatus(atual: StatusCliente): StatusCliente | null {
  const indice = FUNIL_CLIENTE.indexOf(atual as (typeof FUNIL_CLIENTE)[number]);
  if (indice < 0 || indice === FUNIL_CLIENTE.length - 1) return null;
  return FUNIL_CLIENTE[indice + 1];
}

/** Não há para onde avançar — fim do funil, ou cliente numa saída. */
export function statusFinal(status: StatusCliente): boolean {
  return proximoStatus(status) === null;
}

/**
 * Cor do badge de status.
 *
 * O Record é obrigatório de propósito: status novo sem cor definida não
 * compila, em vez de cair num `undefined` que a tela desenha sem estilo.
 *
 * A paleta é a que o Juliano escolheu, e ela junta três status no vermelho
 * — Fechada, Sem resposta e Perdida. Eu apontei que isso põe "ganhei o
 * contrato" e "perdi o cliente" na mesma cor; ele decidiu assim. Na lista,
 * quem distingue é o texto, não a cor.
 */
export function tomDoStatus(status: StatusCliente): TomBadge {
  const mapa: Record<StatusCliente, TomBadge> = {
    Novo: 'info',
    'Em andamento': 'warning',
    Fechada: 'danger',
    Finalizada: 'branco',
    'Sem resposta': 'danger',
    Perdida: 'danger',
  };
  return mapa[status];
}
