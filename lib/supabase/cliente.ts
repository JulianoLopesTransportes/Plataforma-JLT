/**
 * CLIENTE SUPABASE — navegador.
 *
 * A chave publishable aqui é pública por natureza: ela viaja para o
 * navegador de qualquer visitante. O que protege os dados NÃO é o segredo
 * da chave, é o Row Level Security no Postgres — que aplica a mesma matriz
 * de lib/permissoes.ts. Ver supabase/README.md.
 */

import { createBrowserClient } from '@supabase/ssr';

/** As variáveis estão configuradas? A tela de entrada consulta isto. */
export function supabaseConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function criarClienteNavegador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !chave) {
    // Mensagem explícita em vez do erro genérico do SDK: se cair aqui em
    // produção, é variável de ambiente faltando na Vercel.
    throw new Error(
      'Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return createBrowserClient(url, chave);
}

/**
 * Instância única para uso nos componentes cliente.
 * createBrowserClient já é idempotente, mas manter uma referência evita
 * recriar o cliente a cada render.
 */
let instancia: ReturnType<typeof criarClienteNavegador> | null = null;

export function supabase() {
  if (!instancia) instancia = criarClienteNavegador();
  return instancia;
}
