/**
 * ============================================================================
 *  ATENÇÃO — ISTO É UM MOCK DE AUTENTICAÇÃO. NÃO É SEGURANÇA REAL.
 * ============================================================================
 *
 *  Nesta fase do projeto NÃO existe:
 *    - senha (qualquer valor é aceito, inclusive vazio)
 *    - hash, salt ou verificação de credencial
 *    - JWT, cookie de sessão assinado ou validação no servidor
 *
 *  A "sessão" é um objeto em sessionStorage que o próprio navegador pode
 *  editar. Qualquer pessoa com o DevTools aberto vira admin em dois cliques.
 *  Isso é intencional e serve a um único propósito: permitir trocar de
 *  perfil rapidamente para conferir como cada nível enxerga a plataforma.
 *
 *  A guarda de rota também é client-side, pelo mesmo motivo — ela impede
 *  navegação acidental, não acesso mal-intencionado.
 *
 *  QUANDO O SUPABASE ENTRAR (Fase B), substituir por:
 *    - Supabase Auth (e-mail/senha ou SSO) para emitir a sessão
 *    - middleware.ts validando a sessão no servidor, antes de renderizar
 *    - Row Level Security no Postgres espelhando MATRIZ_PERMISSOES
 *  A matriz em permissoes.ts continua valendo: ela vira a fonte das policies.
 * ============================================================================
 */

import type { Nivel } from './permissoes';

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  nivel: Nivel;
  cargo: string;
};

const CHAVE_SESSAO = 'jlt.sessao';

/**
 * Usuários de teste — um por nível, para conferir cada visão.
 * Login aceita qualquer senha (ver aviso no topo do arquivo).
 */
export const USUARIOS_TESTE: Usuario[] = [
  {
    id: 'u1',
    nome: 'Juliano Lopes',
    email: 'admin@julianoltransportes.com.br',
    nivel: 'admin',
    cargo: 'Diretor',
  },
  {
    id: 'u2',
    nome: 'Renata Prado',
    email: 'financeiro@julianoltransportes.com.br',
    nivel: 'financeiro',
    cargo: 'Analista financeira',
  },
  {
    id: 'u3',
    nome: 'Marcos Vieira',
    email: 'operacional@julianoltransportes.com.br',
    nivel: 'operacional',
    cargo: 'Coordenador de operações',
  },
  {
    id: 'u4',
    nome: 'Aline Duarte',
    email: 'comercial@julianoltransportes.com.br',
    nivel: 'comercial',
    cargo: 'Consultora comercial',
  },
];

/** Abre sessão para o usuário informado. Nenhuma credencial é verificada. */
export function entrar(usuario: Usuario): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(usuario));
}

/** Encerra a sessão. */
export function sair(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(CHAVE_SESSAO);
}

/**
 * Lê a sessão ativa. Retorna null no servidor (sessionStorage não existe lá)
 * e null se o conteúdo estiver corrompido ou apontar para um usuário que
 * não existe mais.
 */
export function sessaoAtual(): Usuario | null {
  if (typeof window === 'undefined') return null;

  const bruto = sessionStorage.getItem(CHAVE_SESSAO);
  if (!bruto) return null;

  try {
    const usuario = JSON.parse(bruto) as Usuario;
    // Confere contra a lista conhecida: impede um nível inventado à mão
    // de passar despercebido e quebrar a matriz mais adiante.
    return USUARIOS_TESTE.some((u) => u.id === usuario.id) ? usuario : null;
  } catch {
    return null;
  }
}

/** Busca um usuário de teste pelo e-mail (usado pela tela de login). */
export function usuarioPorEmail(email: string): Usuario | undefined {
  const alvo = email.trim().toLowerCase();
  return USUARIOS_TESTE.find((u) => u.email.toLowerCase() === alvo);
}

/** Iniciais do nome, para o avatar do header. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
