/**
 * MIDDLEWARE — guarda de rota NO SERVIDOR.
 *
 * Isto é o que a Fase A não tinha. Lá a sessão vivia em sessionStorage e a
 * guarda rodava no navegador: impedia navegação acidental, não acesso
 * mal-intencionado. Agora a sessão é um cookie assinado, validado aqui
 * antes de qualquer página renderizar.
 *
 * A checagem de MÓDULO por nível continua acontecendo em duas camadas
 * depois desta: no layout da plataforma (para a experiência) e no RLS do
 * Postgres (para valer de verdade, mesmo contra a API REST direta).
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Rotas que não exigem sessão. */
const PUBLICAS = ['/', '/entrar', '/definir-senha'];

export async function middleware(requisicao: NextRequest) {
  let resposta = NextResponse.next({ request: requisicao });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  /*
   * Sem configuração do Supabase, deixa passar em vez de estourar.
   *
   * Se lançasse aqui, TODA requisição viraria 500 e o site sairia do ar —
   * um deploy com a variável faltando derrubaria a plataforma inteira.
   * Deixar passar não abre brecha: sem Supabase não há sessão nem dado
   * nenhum para proteger, e a própria tela avisa que falta configurar.
   */
  if (!url || !chave) {
    return resposta;
  }

  const cliente = createServerClient(
    url,
    chave,
    {
      cookies: {
        getAll() {
          return requisicao.cookies.getAll();
        },
        setAll(cookiesParaGravar) {
          for (const { name, value } of cookiesParaGravar) {
            requisicao.cookies.set(name, value);
          }
          resposta = NextResponse.next({ request: requisicao });
          for (const { name, value, options } of cookiesParaGravar) {
            resposta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalida o token no servidor do Supabase. Não usar getSession()
  // aqui: ela lê o cookie sem verificar, o que um cookie forjado passaria.
  const {
    data: { user },
  } = await cliente.auth.getUser();

  const caminho = requisicao.nextUrl.pathname;
  const ehPublica = PUBLICAS.includes(caminho);

  // Sem sessão em rota protegida: manda para o login, guardando o destino.
  if (!user && !ehPublica) {
    const url = requisicao.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('destino', caminho);
    return NextResponse.redirect(url);
  }

  // Com sessão na tela de login: já entra direto.
  if (user && caminho === '/') {
    const url = requisicao.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return resposta;
}

export const config = {
  matcher: [
    /*
     * Tudo, menos:
     *  - _next/static e _next/image (build)
     *  - favicon, imagens e a logo
     *  - as rotas de API, que fazem a própria checagem
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)',
  ],
};
