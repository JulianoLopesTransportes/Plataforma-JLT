/**
 * REGRAS DE SENHA
 *
 * Validadas no navegador para dar retorno imediato. O Supabase Auth aplica
 * o próprio mínimo no servidor — isto aqui é usabilidade, não a defesa.
 */

export const REGRAS_SENHA = [
  { id: 'tamanho', rotulo: 'Ao menos 7 caracteres', testa: (s: string) => s.length >= 7 },
  { id: 'maiuscula', rotulo: 'Ao menos uma letra maiúscula', testa: (s: string) => /[A-ZÀ-Þ]/.test(s) },
  { id: 'minuscula', rotulo: 'Ao menos uma letra minúscula', testa: (s: string) => /[a-zà-ÿ]/.test(s) },
  {
    id: 'especial',
    rotulo: 'Ao menos um caractere especial',
    // Tudo que não é letra nem número conta como especial, inclusive espaço.
    testa: (s: string) => /[^\p{L}\p{N}]/u.test(s),
  },
] as const;

export type EstadoRegra = { id: string; rotulo: string; ok: boolean };

/** Situação de cada regra, para a lista de conferência da tela. */
export function conferirSenha(senha: string): EstadoRegra[] {
  return REGRAS_SENHA.map((r) => ({ id: r.id, rotulo: r.rotulo, ok: r.testa(senha) }));
}

export function senhaValida(senha: string): boolean {
  return REGRAS_SENHA.every((r) => r.testa(senha));
}

/* ==========================================================================
   Nome de usuário
   ========================================================================== */

/**
 * Aceita letra, número, ponto, hífen e sublinhado, de 3 a 20 caracteres.
 * Sem espaço nem acento: é identificador, não nome de exibição.
 */
export function usuarioValido(usuario: string): boolean {
  return /^[a-zA-Z0-9._-]{3,20}$/.test(usuario);
}

export const REGRA_USUARIO =
  'De 3 a 20 caracteres, sem espaços ou acentos. Aceita letras, números, ponto, hífen e sublinhado.';

/** Sugere um nome de usuário a partir do nome completo. */
export function sugerirUsuario(nomeCompleto: string): string {
  const limpo = nomeCompleto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  const partes = limpo.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0].slice(0, 20);

  return `${partes[0]}.${partes[partes.length - 1]}`.slice(0, 20);
}
