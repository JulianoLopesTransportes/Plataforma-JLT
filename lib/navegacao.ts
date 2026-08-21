/**
 * ESTRUTURA DA NAVEGAÇÃO
 *
 * Define os itens da sidebar e seus agrupamentos. A sidebar é montada a
 * partir daqui e filtrada pela matriz de permissões — um item cujo módulo é
 * 'none' para o nível da sessão simplesmente não é renderizado.
 *
 * Para acrescentar um módulo à plataforma: registre-o em permissoes.ts
 * (ModuloId + linha da matriz) e adicione a entrada aqui.
 */

import type { ModuloId } from './permissoes';

export type ItemNavegacao = {
  modulo: ModuloId;
  rotulo: string;
  href: string;
  /** Chave do ícone em components/layout/Icone.tsx */
  icone: string;
};

export type GrupoNavegacao = {
  rotulo: string;
  itens: ItemNavegacao[];
};

export const NAVEGACAO: GrupoNavegacao[] = [
  {
    rotulo: 'Operação',
    itens: [
      { modulo: 'dashboard', rotulo: 'Dashboard', href: '/dashboard', icone: 'dashboard' },
      { modulo: 'clientes', rotulo: 'Clientes', href: '/clientes', icone: 'clientes' },
      { modulo: 'documentos', rotulo: 'Documentos', href: '/documentos', icone: 'documentos' },
      { modulo: 'agenda', rotulo: 'Agenda', href: '/agenda', icone: 'agenda' },
      { modulo: 'rotas', rotulo: 'Rotas', href: '/rotas', icone: 'rotas' },
    ],
  },
  {
    rotulo: 'Frota',
    itens: [{ modulo: 'frota', rotulo: 'Veículos e Motoristas', href: '/frota', icone: 'veiculo' }],
  },
  {
    rotulo: 'Financeiro',
    itens: [
      { modulo: 'orcamentos', rotulo: 'Orçamentos', href: '/orcamentos', icone: 'orcamento' },
      { modulo: 'financeiro', rotulo: 'Gastos e Ganhos', href: '/financeiro', icone: 'financeiro' },
      { modulo: 'relatorios', rotulo: 'Relatórios', href: '/relatorios', icone: 'relatorios' },
    ],
  },
  {
    rotulo: 'Sistema',
    itens: [
      { modulo: 'usuarios', rotulo: 'Usuários', href: '/usuarios', icone: 'usuarios' },
    ],
  },
];

/** Todos os itens em lista plana — usado pelo breadcrumb e pela guarda de rota. */
export const ITENS_PLANOS: ItemNavegacao[] = NAVEGACAO.flatMap((g) => g.itens);

/** Rótulo legível de um módulo, para o breadcrumb e o título da página. */
export function rotuloDoModulo(modulo: ModuloId): string {
  return ITENS_PLANOS.find((i) => i.modulo === modulo)?.rotulo ?? modulo;
}
