/**
 * MATRIZ DE PERMISSÕES — fonte única de verdade sobre quem acessa o quê.
 *
 * Regra do projeto: NENHUMA verificação de permissão espalhada pelo código.
 * Todo controle de acesso — sidebar, guarda de rota, botão desabilitado,
 * coluna escondida em relatório — sai daqui através das funções abaixo.
 *
 * Se você precisar escrever `if (nivel === 'admin')` em um componente,
 * está errado: acrescente a regra nesta matriz e consulte-a.
 */

/** Os quatro níveis da pirâmide, do maior escopo para o menor. */
export type Nivel = 'admin' | 'financeiro' | 'operacional' | 'comercial';

/**
 * Acesso a um módulo:
 *  'crud' — lê e escreve (criar, editar, excluir)
 *  'r'    — apenas leitura
 *  'none' — sem acesso; nem aparece na sidebar, e a URL direta é bloqueada
 */
export type Acesso = 'crud' | 'r' | 'none';

/** Chave de cada módulo. Corresponde ao segmento da URL: /clientes, /rotas... */
export type ModuloId =
  | 'dashboard'
  | 'clientes'
  | 'orcamentos'
  | 'documentos'
  | 'agenda'
  | 'rotas'
  | 'frota'
  | 'financeiro'
  | 'relatorios'
  | 'usuarios'
  | 'guia-visual';

type MatrizModulo = Record<Nivel, Acesso>;

/**
 * A MATRIZ.
 *
 * Leitura da pirâmide (seção 5 do briefing):
 *  - Admin        — tudo; único que gerencia usuários e configurações.
 *  - Financeiro   — faturamento, custos e relatórios financeiros; leitura em
 *                   operacional e comercial.
 *  - Operacional  — frota, motoristas, viagens, cargas; leitura no comercial;
 *                   sem qualquer acesso a dado financeiro.
 *  - Comercial    — clientes, cotações, propostas; sem custo interno,
 *                   sem margem, sem folha.
 */
export const MATRIZ_PERMISSOES: Record<ModuloId, MatrizModulo> = {
  dashboard: { admin: 'crud', financeiro: 'r', operacional: 'r', comercial: 'r' },
  clientes: { admin: 'crud', financeiro: 'r', operacional: 'r', comercial: 'crud' },
  orcamentos: { admin: 'crud', financeiro: 'crud', operacional: 'none', comercial: 'crud' },
  documentos: { admin: 'crud', financeiro: 'r', operacional: 'r', comercial: 'crud' },
  agenda: { admin: 'crud', financeiro: 'r', operacional: 'crud', comercial: 'r' },
  rotas: { admin: 'crud', financeiro: 'r', operacional: 'crud', comercial: 'r' },
  frota: { admin: 'crud', financeiro: 'r', operacional: 'crud', comercial: 'none' },
  financeiro: { admin: 'crud', financeiro: 'crud', operacional: 'none', comercial: 'none' },
  relatorios: { admin: 'crud', financeiro: 'r', operacional: 'r', comercial: 'r' },
  usuarios: { admin: 'crud', financeiro: 'none', operacional: 'none', comercial: 'none' },
  'guia-visual': { admin: 'r', financeiro: 'r', operacional: 'r', comercial: 'r' },
};

/**
 * CAPACIDADES TRANSVERSAIS
 *
 * Permissões que não são "um módulo inteiro", e sim um recorte dentro dele.
 * Existem porque a pirâmide corta alguns módulos ao meio: Comercial usa a
 * calculadora de orçamento, mas não pode ver o custo interno que a alimenta.
 */
export type Capacidade =
  /** Ver custo interno, margem e markup. O que o Comercial não pode enxergar. */
  | 'ver_custos'
  /** Ver faturamento e receita. O que o Operacional não pode enxergar. */
  | 'ver_faturamento'
  /** Editar os parâmetros de precificação (faixas de volume, margem-alvo). */
  | 'editar_parametros_precificacao'
  /** Exportar dados em CSV. */
  | 'exportar'
  /** Aprovar orçamento/proposta. */
  | 'aprovar'
  /** Excluir registros em definitivo. */
  | 'excluir';

const CAPACIDADES: Record<Capacidade, Nivel[]> = {
  ver_custos: ['admin', 'financeiro', 'operacional'],
  ver_faturamento: ['admin', 'financeiro', 'comercial'],
  editar_parametros_precificacao: ['admin', 'financeiro'],
  exportar: ['admin', 'financeiro', 'operacional', 'comercial'],
  aprovar: ['admin', 'financeiro'],
  excluir: ['admin'],
};

/** Rótulo legível de cada nível, para exibir no header e na tela de login. */
export const ROTULO_NIVEL: Record<Nivel, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  comercial: 'Comercial',
};

/* ==========================================================================
   Funções de consulta — a única forma legítima de perguntar sobre permissão
   ========================================================================== */

/** Qual o acesso deste nível a este módulo. */
export function acessoAoModulo(nivel: Nivel, modulo: ModuloId): Acesso {
  return MATRIZ_PERMISSOES[modulo]?.[nivel] ?? 'none';
}

/** O módulo aparece na sidebar e pode ser aberto? */
export function podeVer(nivel: Nivel, modulo: ModuloId): boolean {
  return acessoAoModulo(nivel, modulo) !== 'none';
}

/** O nível pode criar, editar ou excluir dentro deste módulo? */
export function podeEditar(nivel: Nivel, modulo: ModuloId): boolean {
  return acessoAoModulo(nivel, modulo) === 'crud';
}

/** O nível tem esta capacidade transversal? */
export function podeFazer(nivel: Nivel, capacidade: Capacidade): boolean {
  return CAPACIDADES[capacidade].includes(nivel);
}

/**
 * Traduz o primeiro segmento de um pathname em um ModuloId conhecido.
 * Retorna null para rotas que não são módulos (ex.: a tela de login).
 */
export function moduloDaRota(pathname: string): ModuloId | null {
  const segmento = pathname.split('/').filter(Boolean)[0];
  if (!segmento) return null;
  return segmento in MATRIZ_PERMISSOES ? (segmento as ModuloId) : null;
}
