/**
 * CLIENTE SUPABASE — servidor (Server Components e Route Handlers).
 *
 * Diferente do cliente de navegador, este lê a sessão dos cookies da
 * requisição. É o que permite validar o acesso ANTES de renderizar, em vez
 * de depender de uma checagem no navegador — a falha que a Fase A tinha e
 * que está documentada no topo do antigo lib/auth.ts.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesParaGravar) {
          try {
            for (const { name, value, options } of cookiesParaGravar) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component não pode gravar cookie. Sem problema: o
            // middleware já renovou a sessão antes de chegar aqui.
          }
        },
      },
    },
  );
}

/**
 * Sessão do usuário no servidor, já com o perfil e o nível.
 * Retorna null quando não há sessão válida ou o perfil está inativo.
 */
export async function sessaoDoServidor() {
  const cliente = await criarClienteServidor();

  const {
    data: { user },
  } = await cliente.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await cliente
    .from('perfis')
    .select('id, nome, email, cargo, nivel, ativo')
    .eq('id', user.id)
    .single();

  if (!perfil || !perfil.ativo) return null;

  return perfil;
}
