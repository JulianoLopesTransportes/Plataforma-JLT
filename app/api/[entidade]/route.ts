/**
 * ROTAS DE API — STUB
 *
 * Ocupa o lugar que o briefing reservava ao servidor Express: expor
 * endpoints HTTP que devolvem dados fictícios. Com Next.js, Route Handlers
 * fazem isso sem servidor separado, sem porta extra e sem mais uma
 * dependência.
 *
 * Estes endpoints AINDA NÃO SÃO CONSUMIDOS pela interface — hoje lib/api
 * lê os mocks direto, o que é mais rápido e funciona no build estático.
 * Eles existem para dois fins:
 *
 *   1. dar um contrato HTTP concreto para conferir agora
 *      (ex.: /api/clientes, /api/rotas?status=planejada);
 *   2. marcar exatamente onde o Supabase entra na Fase B — cada handler
 *      troca a leitura do JSON por uma consulta ao Postgres, e lib/api
 *      passa a chamar `buscar()` em vez de `lerMock()`.
 *
 * NÃO HÁ AUTENTICAÇÃO NEM AUTORIZAÇÃO AQUI. Qualquer um que alcance a URL
 * lê os dados. Isso é aceitável enquanto o conteúdo é fictício e precisa
 * ser resolvido antes de qualquer dado real entrar: a mesma matriz de
 * lib/permissoes.ts deve virar policies de RLS no banco.
 */

import { NextResponse } from 'next/server';

import clientes from '@/mock/clientes.json';
import veiculos from '@/mock/veiculos.json';
import motoristas from '@/mock/motoristas.json';
import lancamentos from '@/mock/lancamentos.json';
import compromissos from '@/mock/compromissos.json';
import rotas from '@/mock/rotas.json';
import orcamentos from '@/mock/orcamentos.json';
import parametros from '@/mock/parametros-precificacao.json';

/** Entidades expostas. A chave é o segmento da URL. */
const ENTIDADES: Record<string, unknown> = {
  clientes,
  veiculos,
  motoristas,
  lancamentos,
  compromissos,
  rotas,
  orcamentos,
  'parametros-precificacao': parametros,
};

export async function GET(
  requisicao: Request,
  { params }: { params: Promise<{ entidade: string }> },
) {
  const { entidade } = await params;
  const dados = ENTIDADES[entidade];

  if (dados === undefined) {
    return NextResponse.json(
      {
        erro: 'Entidade não encontrada',
        disponiveis: Object.keys(ENTIDADES),
      },
      { status: 404 },
    );
  }

  // Filtros simples por querystring, para o contrato ficar realista.
  // TODO: substituir por WHERE no Postgres quando o Supabase entrar.
  const { searchParams } = new URL(requisicao.url);
  const status = searchParams.get('status');
  const id = searchParams.get('id');

  if (!Array.isArray(dados)) {
    return NextResponse.json(dados);
  }

  let resultado = dados as Record<string, unknown>[];

  if (id) resultado = resultado.filter((r) => r.id === id);
  if (status) resultado = resultado.filter((r) => r.status === status);

  return NextResponse.json({
    total: resultado.length,
    dados: resultado,
  });
}

/**
 * Escrita ainda não existe: sem banco, não há onde gravar.
 * Responder 501 é mais honesto que aceitar e descartar em silêncio.
 */
export async function POST() {
  return NextResponse.json(
    {
      erro: 'Escrita não implementada nesta fase',
      detalhe:
        'A plataforma ainda não tem persistência. Este endpoint passa a gravar quando o Supabase entrar (Fase B).',
    },
    { status: 501 },
  );
}
