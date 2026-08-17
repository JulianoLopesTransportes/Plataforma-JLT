/**
 * REGRAS DE CLIENTE — portadas de 01-cadastro-clientes.
 */

import { STATUS_CLIENTE, type StatusCliente } from '../tipos';
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
 * Próximo status no funil. O último status não avança — o funil termina
 * em Concluído e não volta ao início sozinho.
 */
export function proximoStatus(atual: StatusCliente): StatusCliente {
  const indice = STATUS_CLIENTE.indexOf(atual);
  return STATUS_CLIENTE[Math.min(indice + 1, STATUS_CLIENTE.length - 1)];
}

/** O status já está no fim do funil? */
export function statusFinal(status: StatusCliente): boolean {
  return status === STATUS_CLIENTE[STATUS_CLIENTE.length - 1];
}

/** Cor do badge de status. */
export function tomDoStatus(status: StatusCliente): TomBadge {
  const mapa: Record<StatusCliente, TomBadge> = {
    Novo: 'info',
    'Em andamento': 'warning',
    Concluído: 'success',
  };
  return mapa[status];
}
