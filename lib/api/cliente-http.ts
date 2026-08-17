/**
 * INFRAESTRUTURA DA CAMADA DE DADOS
 *
 * Esta é a ÚNICA porta de saída para dados em toda a plataforma. Nenhum
 * componente lê JSON, faz fetch ou toca no banco diretamente — tudo passa
 * pelos módulos de lib/api/, que por sua vez usam as funções daqui.
 *
 * Hoje: lê os JSON de /mock com um atraso artificial, simulando rede.
 * Amanhã: as funções de lib/api/ trocam `lerMock` por `buscar` (HTTP) ou
 * por uma chamada ao supabase-js. A assinatura pública de cada função de
 * api NÃO muda, e por isso nenhum componente precisa ser tocado.
 */

/** Atraso artificial, em ms. Deixa visível o estado de carregamento na UI. */
const ATRASO_MS = 220;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lê um arquivo de /mock. Funciona tanto no servidor (Server Component)
 * quanto no cliente, porque os JSON são importados estaticamente pelos
 * módulos de api — este helper apenas adiciona o atraso e devolve uma
 * cópia profunda.
 *
 * A cópia é importante: sem ela, um componente que ordenasse a lista in
 * place estaria mutando o "banco" para todos os outros.
 */
export async function lerMock<T>(dados: T): Promise<T> {
  await esperar(ATRASO_MS);
  return estruturaClonada(dados);
}

/** Clone profundo, com fallback para ambientes sem structuredClone. */
function estruturaClonada<T>(valor: T): T {
  if (typeof structuredClone === 'function') return structuredClone(valor);
  return JSON.parse(JSON.stringify(valor)) as T;
}

/**
 * Cliente HTTP para quando as rotas reais existirem.
 * Ainda não é usado pelos módulos de api — está aqui pronto para a troca.
 */
export async function buscar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(caminho, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!resposta.ok) {
    throw new ErroDeApi(resposta.status, `Falha ao consultar ${caminho}`);
  }

  return (await resposta.json()) as T;
}

export class ErroDeApi extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDeApi';
  }
}

/* ==========================================================================
   Helpers de filtro — compartilhados pelas funções de listagem
   ========================================================================== */

/** Normaliza texto para busca: sem acento, minúsculo. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** O registro casa com o termo de busca em algum dos campos indicados? */
export function casaBusca<T>(registro: T, termo: string | undefined, campos: (keyof T)[]): boolean {
  if (!termo) return true;
  const alvo = normalizar(termo);
  return campos.some((campo) => {
    const valor = registro[campo];
    return typeof valor === 'string' && normalizar(valor).includes(alvo);
  });
}
