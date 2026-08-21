/**
 * MATRIZ DE PERMISSÕES — fonte única de verdade sobre quem acessa o quê.
 *
 * Regra do projeto: NENHUMA verificação de permissão espalhada pelo código.
 * Todo controle de acesso — sidebar, guarda de rota, botão desabilitado,
 * coluna escondida em relatório — sai daqui através das funções abaixo.
 *
 * Se você precisar escrever `if (nivel === 'admin')` em um componente,
 * está errado: acrescente a regra nesta matriz e consulte-a.
 *
 * ---
 *
 * A MATRIZ AGORA VEM DO BANCO. A constante lá embaixo deixou de ser a lei
 * e virou o padrão de fábrica: vale antes da hidratação e quando não há
 * Supabase configurado (modo mock). Quem manda é a tabela
 * `permissoes_modulo`, que o admin edita em Usuários → Matriz.
 *
 * As funções continuam SÍNCRONAS, com a assinatura de sempre, porque são
 * chamadas em treze arquivos e durante a renderização. Elas leem um
 * armazém de módulo que o SessaoProvider preenche ANTES de renderizar os
 * filhos, junto com o perfil. Nenhum ponto de chamada precisou mudar.
 *
 * A alternativa — virar hook `usePermissoes()` — mudaria os treze
 * arquivos e ainda deixaria `moduloDaRota()` de fora, que não é componente
 * e não pode usar hook.
 */

/**
 * Identificador de um nível.
 *
 * Era união literal ('admin' | 'financeiro' | …) enquanto os níveis eram
 * um enum do Postgres. Com níveis criáveis pela plataforma, o conjunto não
 * é mais conhecido em tempo de compilação.
 */
export type Nivel = string;

/** Os quatro que existem desde o começo e o código cita pelo nome. */
export const NIVEIS_DE_SISTEMA = ['admin', 'financeiro', 'operacional', 'comercial'] as const;

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
  | 'usuarios';

/**
 * Os módulos são fixos: cada um tem uma pasta em app/ e uma entrada em
 * navegacao.ts. Ao contrário dos níveis, não dá para criar um pela tela —
 * não haveria tela para ele abrir.
 */
export const MODULOS: ModuloId[] = [
  'dashboard', 'clientes', 'orcamentos', 'documentos', 'agenda',
  'rotas', 'frota', 'financeiro', 'relatorios', 'usuarios',
];

type MatrizModulo = Record<Nivel, Acesso>;

/**
 * A SEMENTE.
 *
 * Foi a matriz do briefing e hoje é o padrão de fábrica — o que vale antes
 * do banco responder, e o que vale para sempre em modo mock. Também é o
 * que a migration 02 gravou em `permissoes_modulo`, então banco e código
 * nascem iguais.
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
export const MATRIZ_PADRAO: Record<ModuloId, MatrizModulo> = {
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
};

/**
 * CAPACIDADES TRANSVERSAIS
 *
 * Permissões que não são "um módulo inteiro", e sim um recorte dentro dele.
 * Existem porque a pirâmide corta alguns módulos ao meio: Comercial usa a
 * calculadora de orçamento, mas não pode ver o custo interno que a alimenta.
 *
 * Não há tela para editá-las — decisão do Juliano. Mas elas TAMBÉM passaram
 * a ser lidas do banco, e não por capricho: um nível criado depois do
 * deploy não existe nesta constante, e `podeFazer()` responderia false para
 * tudo. Um nível assim não exportaria CSV, não veria custo, não excluiria
 * nada, e não haveria onde conceder. Por isso `criar_nivel()` copia as
 * capacidades de um nível-modelo.
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

export const CAPACIDADES_PADRAO: Record<Capacidade, Nivel[]> = {
  ver_custos: ['admin', 'financeiro', 'operacional'],
  ver_faturamento: ['admin', 'financeiro', 'comercial'],
  editar_parametros_precificacao: ['admin', 'financeiro'],
  exportar: ['admin', 'financeiro', 'operacional', 'comercial'],
  aprovar: ['admin', 'financeiro'],
  excluir: ['admin'],
};

/** Rótulo de fábrica de cada nível. Os criados trazem o seu do banco. */
export const ROTULO_PADRAO: Record<string, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  comercial: 'Comercial',
};

/* ==========================================================================
   O armazém — preenchido uma vez, no boot, pelo SessaoProvider
   ========================================================================== */

export type NivelDefinido = {
  id: Nivel;
  rotulo: string;
  ordem: number;
  /** Um dos quatro originais: não pode ser excluído. */
  sistema: boolean;
};

export type Permissoes = {
  niveis: NivelDefinido[];
  matriz: Record<ModuloId, MatrizModulo>;
  capacidades: Record<Capacidade, Nivel[]>;
};

/** O que vale enquanto o banco não respondeu — e para sempre, sem banco. */
export function permissoesPadrao(): Permissoes {
  return {
    niveis: NIVEIS_DE_SISTEMA.map((id, i) => ({
      id,
      rotulo: ROTULO_PADRAO[id],
      ordem: i + 1,
      sistema: true,
    })),
    matriz: MATRIZ_PADRAO,
    capacidades: CAPACIDADES_PADRAO,
  };
}

/*
 * Variável de módulo, não React state, justamente para as funções abaixo
 * continuarem síncronas e utilizáveis fora de componente.
 *
 * Trocá-la NÃO redesenha ninguém sozinho — quem provoca o redesenho é o
 * SessaoProvider, que guarda uma versão em estado e a incrementa após
 * hidratar. Os dois andam juntos e é por isso que o provider é o único
 * lugar que chama `hidratarPermissoes`.
 */
let atual: Permissoes = permissoesPadrao();

export function hidratarPermissoes(novas: Permissoes): void {
  atual = novas;
}

export function permissoesAtuais(): Permissoes {
  return atual;
}

/* ==========================================================================
   Funções de consulta — a única forma legítima de perguntar sobre permissão
   ========================================================================== */

/** Qual o acesso deste nível a este módulo. */
export function acessoAoModulo(nivel: Nivel, modulo: ModuloId): Acesso {
  return atual.matriz[modulo]?.[nivel] ?? 'none';
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
  return atual.capacidades[capacidade]?.includes(nivel) ?? false;
}

/** Como este nível se chama na tela. Um nível desconhecido mostra o id. */
export function rotuloDoNivel(nivel: Nivel): string {
  return atual.niveis.find((n) => n.id === nivel)?.rotulo ?? ROTULO_PADRAO[nivel] ?? nivel;
}

/** Todos os níveis existentes, na ordem em que aparecem na matriz. */
export function niveisDisponiveis(): NivelDefinido[] {
  return [...atual.niveis].sort((a, b) => a.ordem - b.ordem);
}

/**
 * Traduz o primeiro segmento de um pathname em um ModuloId conhecido.
 * Retorna null para rotas que não são módulos (ex.: a tela de login).
 */
export function moduloDaRota(pathname: string): ModuloId | null {
  const segmento = pathname.split('/').filter(Boolean)[0];
  if (!segmento) return null;
  return (MODULOS as string[]).includes(segmento) ? (segmento as ModuloId) : null;
}
