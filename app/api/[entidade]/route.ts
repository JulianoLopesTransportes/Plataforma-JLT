/**
 * API HTTP — endpoints autenticados.
 *
 * Substituiu o stub que servia os JSON de /mock sem autenticação nenhuma.
 * Aquilo era aceitável enquanto o conteúdo era fictício; com dado real no
 * banco, virou um vazamento à espera de acontecer.
 *
 * Agora cada requisição usa a sessão do próprio usuário (cookie), e a
 * consulta passa pelo RLS como qualquer outra: o Postgres devolve apenas o
 * que o nível daquela pessoa pode ver. Não há chave de serviço aqui, e
 * nenhuma verificação de permissão é reimplementada — seria uma segunda
 * fonte de verdade fadada a divergir da matriz.
 *
 * Estes endpoints existem para integração externa e conferência. A
 * interface não os usa: ela fala com o Supabase direto por lib/api.
 */

import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/servidor';

/**
 * Entidades expostas e o que cada uma seleciona.
 *
 * `orcamentos` aponta para a VIEW, nunca para a tabela: é ela que mascara
 * custo e margem para quem não tem a capacidade ver_custos.
 */
const ENTIDADES: Record<string, { tabela: string; select: string; ordem?: string }> = {
  clientes: {
    tabela: 'clientes',
    select: '*, cliente_anexos(*), cliente_historico(*)',
    ordem: 'criado_em',
  },
  veiculos: { tabela: 'veiculos', select: '*, veiculo_anexos(*)', ordem: 'placa' },
  motoristas: { tabela: 'motoristas', select: '*, motorista_anexos(*)', ordem: 'nome' },
  lancamentos: { tabela: 'lancamentos', select: '*', ordem: 'data' },
  compromissos: { tabela: 'compromissos', select: '*', ordem: 'data' },
  rotas: {
    tabela: 'rotas',
    select: '*, mudancas(*), paradas(*, parada_movimentos(*))',
    ordem: 'data_saida',
  },
  orcamentos: { tabela: 'orcamentos_visao', select: '*', ordem: 'data' },
  'faixas-volume': { tabela: 'faixas_volume', select: '*', ordem: 'ate' },
  adicionais: { tabela: 'adicionais', select: '*', ordem: 'nome' },
  'parametros-precificacao': { tabela: 'parametros_precificacao', select: '*' },
};

export async function GET(
  requisicao: Request,
  { params }: { params: Promise<{ entidade: string }> },
) {
  const { entidade } = await params;
  const config = ENTIDADES[entidade];

  if (!config) {
    return NextResponse.json(
      { erro: 'Entidade não encontrada', disponiveis: Object.keys(ENTIDADES) },
      { status: 404 },
    );
  }

  const cliente = await criarClienteServidor();

  // getUser() revalida o token no servidor do Supabase; getSession() apenas
  // lê o cookie, o que um cookie forjado passaria.
  const {
    data: { user },
  } = await cliente.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { erro: 'Não autenticado', detalhe: 'Esta API exige sessão ativa na plataforma.' },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(requisicao.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');
  const de = searchParams.get('de');
  const ate = searchParams.get('ate');
  const limite = Math.min(Number(searchParams.get('limite')) || 100, 500);

  let consulta = cliente.from(config.tabela).select(config.select).limit(limite);

  if (id) consulta = consulta.eq('id', id);
  if (status) consulta = consulta.eq('status', status);
  if (de && config.ordem) consulta = consulta.gte(config.ordem, de);
  if (ate && config.ordem) consulta = consulta.lte(config.ordem, ate);
  if (config.ordem) consulta = consulta.order(config.ordem, { ascending: false });

  const { data, error } = await consulta;

  if (error) {
    // 42501 é recusa do RLS: a pessoa está autenticada, mas o nível dela
    // não alcança esta entidade.
    const proibido = error.code === '42501';
    return NextResponse.json(
      {
        erro: proibido ? 'Sem permissão para esta entidade' : 'Falha na consulta',
        detalhe: error.message,
      },
      { status: proibido ? 403 : 500 },
    );
  }

  return NextResponse.json({ total: data?.length ?? 0, dados: data ?? [] });
}

/**
 * Escrita não é exposta por aqui.
 *
 * Criar registro exige regras que a interface aplica (histórico do cliente,
 * vínculos de rota, recálculo de orçamento). Um POST genérico contornaria
 * isso e gravaria dado incompleto. Quando houver necessidade real de
 * integração, cada entidade ganha seu endpoint com as regras próprias.
 */
export async function POST() {
  return NextResponse.json(
    {
      erro: 'Escrita não disponível nesta API',
      detalhe:
        'Use a plataforma para criar registros. Endpoints de escrita serão criados por entidade, com as regras de negócio de cada uma.',
    },
    { status: 405 },
  );
}
