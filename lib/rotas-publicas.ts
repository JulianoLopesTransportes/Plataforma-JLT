/**
 * As rotas que não exigem sessão — FONTE ÚNICA.
 *
 * Existia uma lista dentro do middleware.ts e uma guarda independente no
 * SessaoProvider, e as duas tinham de concordar. Quando eu abri a rota
 * pública do inventário, descobri que precisava mexer nas DUAS: o
 * middleware redirecionava para o login no servidor, e o provedor
 * redirecionava de novo no navegador.
 *
 * Duas listas que precisam concordar divergem. Esta é a única.
 */

/** Caminhos exatos. */
const EXATAS = ['/', '/entrar', '/definir-senha'];

/**
 * Prefixos. O inventário tem o token no caminho, então não dá para casar
 * exato: `/inventario/<64 caracteres>`.
 *
 * Abrir um prefixo é decisão de segurança, e esta é segura por construção:
 * tudo sob `/inventario` só conversa com três funções do banco que exigem
 * token válido, e o visitante anônimo não tem policy em tabela nenhuma.
 * Sem token válido a página não mostra nada além da mensagem de erro.
 */
const PREFIXOS = ['/inventario'];

export function ehRotaPublica(caminho: string): boolean {
  if (EXATAS.includes(caminho)) return true;
  return PREFIXOS.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}
