/**
 * API — administração: usuários e parâmetros de precificação.
 *
 * Estas funções falam com o Supabase de verdade, não com mocks. Toda
 * chamada aqui passa pelo RLS: se o usuário não puder fazer a operação, o
 * banco recusa — não é a interface que decide.
 *
 * Como o controle de acesso funciona na prática:
 *   - `niveis_pre_atribuidos` é a lista de convidados. Só o admin escreve
 *     nela (policy exige pode_editar('usuarios')).
 *   - Acrescentar alguém ali é o que autoriza a pessoa a criar acesso.
 *   - Alterar o nível ali dispara um gatilho que sincroniza `perfis`, então
 *     a mudança vale imediatamente para quem já entrou.
 *   - Remover da lista desativa o perfil, sem apagar o registro — a autoria
 *     em histórico e lançamentos é preservada.
 */

import { supabase } from '../supabase/cliente';
import { MODULOS } from '../permissoes';
import type {
  Nivel,
  ModuloId,
  Acesso,
  Capacidade,
  Permissoes,
} from '../permissoes';

/* ==========================================================================
   Usuários
   ========================================================================== */

export type UsuarioAdmin = {
  email: string;
  nome: string;
  cargo: string;
  nivel: Nivel;
  /** true quando a pessoa já criou o acesso e tem perfil ativo. */
  ativo: boolean;
  /** false enquanto ela ainda não criou o acesso. */
  acessoCriado: boolean;
  criadoEm: string;
};

export const usuarios = {
  /**
   * Lista os autorizados, cruzando a lista de convidados com quem já criou
   * acesso de fato. Quem está na lista mas nunca entrou aparece como
   * "aguardando primeiro acesso" — informação que o admin precisa ver.
   */
  async listar(): Promise<UsuarioAdmin[]> {
    const cliente = supabase();

    const [{ data: autorizados, error: erroLista }, { data: perfis }] = await Promise.all([
      cliente
        .from('niveis_pre_atribuidos')
        .select('email, nome, cargo, nivel, criado_em')
        .order('criado_em'),
      cliente.from('perfis').select('email, ativo'),
    ]);

    if (erroLista) throw new Error(erroLista.message);

    const porEmail = new Map((perfis ?? []).map((p) => [p.email.toLowerCase(), p.ativo]));

    return (autorizados ?? []).map((a) => {
      const ativo = porEmail.get(a.email.toLowerCase());
      return {
        email: a.email,
        nome: a.nome,
        cargo: a.cargo,
        nivel: a.nivel as Nivel,
        acessoCriado: ativo !== undefined,
        ativo: ativo ?? false,
        criadoEm: a.criado_em,
      };
    });
  },

  /** Autoriza um novo e-mail. A pessoa então cria a própria senha na tela de entrada. */
  async autorizar(dados: {
    email: string;
    nome: string;
    cargo: string;
    nivel: Nivel;
  }): Promise<void> {
    const { error } = await supabase().from('niveis_pre_atribuidos').insert({
      email: dados.email.trim().toLowerCase(),
      nome: dados.nome.trim(),
      cargo: dados.cargo.trim(),
      nivel: dados.nivel,
    });

    if (error) {
      if (error.code === '23505') throw new Error('Este e-mail já está autorizado.');
      if (error.code === '42501') throw new Error('Seu nível não permite gerenciar usuários.');
      throw new Error(error.message);
    }
  },

  /**
   * Altera nível, nome ou cargo. O gatilho no banco propaga para `perfis`,
   * então vale na hora para quem já tem acesso.
   */
  async atualizar(
    email: string,
    dados: { nome?: string; cargo?: string; nivel?: Nivel },
  ): Promise<void> {
    const { error } = await supabase()
      .from('niveis_pre_atribuidos')
      .update(dados)
      .eq('email', email.toLowerCase());

    if (error) {
      if (error.code === '42501') throw new Error('Seu nível não permite gerenciar usuários.');
      throw new Error(error.message);
    }
  },

  /** Revoga o acesso: sai da lista e o perfil é desativado pelo gatilho. */
  async revogar(email: string): Promise<void> {
    const { error } = await supabase()
      .from('niveis_pre_atribuidos')
      .delete()
      .eq('email', email.toLowerCase());

    if (error) {
      if (error.code === '42501') throw new Error('Seu nível não permite revogar acessos.');
      throw new Error(error.message);
    }
  },
};

/* ==========================================================================
   Parâmetros de precificação
   ========================================================================== */

export type FaixaVolumeDb = { id: string; ate: number; valorBase: number };
export type TipoAdicionalDb = 'fixo' | 'percentual' | 'por_unidade';

export type AdicionalDb = {
  id: string;
  nome: string;
  tipo: TipoAdicionalDb;
  valor: number;
  /** Nome da unidade quando tipo = por_unidade. Vazio nos demais. */
  unidade: string;
  ativo: boolean;
};
export type ParametrosGerais = {
  custoPorKm: number;
  margemMinima: number;
  margemMaxima: number;
};

export const precificacao = {
  /**
   * Lê os parâmetros. Exige a capacidade `ver_custos` — o RLS devolve vazio
   * para o Comercial, que obtém preço por `calcularPreco()`.
   */
  async ler(): Promise<{
    faixas: FaixaVolumeDb[];
    adicionais: AdicionalDb[];
    gerais: ParametrosGerais | null;
  }> {
    const cliente = supabase();

    const [{ data: faixas }, { data: adicionais }, { data: gerais }] = await Promise.all([
      cliente.from('faixas_volume').select('id, ate, valor_base').order('ate'),
      cliente.from('adicionais').select('id, nome, tipo, valor, unidade, ativo').order('nome'),
      cliente
        .from('parametros_precificacao')
        .select('custo_por_km, margem_minima, margem_maxima')
        .maybeSingle(),
    ]);

    return {
      faixas: (faixas ?? []).map((f) => ({ id: f.id, ate: f.ate, valorBase: f.valor_base })),
      adicionais: (adicionais ?? []).map((a) => ({
        id: a.id,
        nome: a.nome,
        tipo: a.tipo as TipoAdicionalDb,
        valor: a.valor,
        unidade: a.unidade ?? '',
        ativo: a.ativo,
      })),
      gerais: gerais
        ? {
            custoPorKm: gerais.custo_por_km,
            margemMinima: gerais.margem_minima,
            margemMaxima: gerais.margem_maxima,
          }
        : null,
    };
  },

  async salvarGerais(dados: ParametrosGerais): Promise<void> {
    if (dados.margemMaxima <= dados.margemMinima) {
      throw new Error('A margem máxima precisa ser maior que a mínima.');
    }
    if (dados.margemMaxima >= 100) {
      // preço = custo / (1 - margem) tende ao infinito perto de 100%.
      throw new Error('A margem máxima precisa ficar abaixo de 100%.');
    }
    if (dados.margemMinima <= -100) {
      throw new Error('A margem mínima precisa ficar acima de −100%.');
    }

    const { error } = await supabase()
      .from('parametros_precificacao')
      .update({
        custo_por_km: dados.custoPorKm,
        margem_minima: dados.margemMinima,
        margem_maxima: dados.margemMaxima,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', true);

    if (error) throw new Error(traduzir(error.code, error.message));
  },

  async salvarFaixa(faixa: { id?: string; ate: number; valorBase: number }): Promise<void> {
    const cliente = supabase();
    const payload = { ate: faixa.ate, valor_base: faixa.valorBase };

    const { error } = faixa.id
      ? await cliente.from('faixas_volume').update(payload).eq('id', faixa.id)
      : await cliente.from('faixas_volume').insert(payload);

    if (error) throw new Error(traduzir(error.code, error.message));
  },

  async excluirFaixa(id: string): Promise<void> {
    const { error } = await supabase().from('faixas_volume').delete().eq('id', id);
    if (error) throw new Error(traduzir(error.code, error.message));
  },

  async salvarAdicional(adicional: {
    id?: string;
    nome: string;
    tipo: TipoAdicionalDb;
    valor: number;
    unidade?: string;
  }): Promise<void> {
    const cliente = supabase();
    const payload = {
      nome: adicional.nome,
      tipo: adicional.tipo,
      valor: adicional.valor,
      // A unidade só faz sentido no tipo por_unidade; nos outros fica vazia
      // para não deixar resíduo de uma troca de tipo.
      unidade: adicional.tipo === 'por_unidade' ? (adicional.unidade ?? '') : '',
    };

    const { error } = adicional.id
      ? await cliente.from('adicionais').update(payload).eq('id', adicional.id)
      : await cliente.from('adicionais').insert(payload);

    if (error) throw new Error(traduzir(error.code, error.message));
  },

  async excluirAdicional(id: string): Promise<void> {
    const { error } = await supabase().from('adicionais').delete().eq('id', id);
    if (error) throw new Error(traduzir(error.code, error.message));
  },

  /**
   * Preço pelo banco, para quem não pode ver a composição do custo.
   * Ver a função calcular_preco na migration 04.
   */
  async calcularPreco(entrada: {
    volumeM3: number;
    distanciaKm: number;
    adicionais: string[];
    margem?: number;
  }): Promise<number | null> {
    const { data, error } = await supabase().rpc('calcular_preco', {
      p_volume_m3: entrada.volumeM3,
      p_distancia_km: entrada.distanciaKm,
      p_adicionais: entrada.adicionais,
      p_margem: entrada.margem ?? null,
    });

    if (error) throw new Error(error.message);
    return data;
  },
};

function traduzir(codigo: string | undefined, mensagem: string): string {
  if (codigo === '42501') return 'Seu nível não permite alterar os parâmetros de precificação.';
  if (codigo === '23505') return 'Já existe uma faixa com esse teto de volume.';
  return mensagem;
}

/* ==========================================================================
   Matriz de permissões
   ========================================================================== */

/**
 * Lê a matriz inteira do banco.
 *
 * Roda no boot, antes de a plataforma desenhar — ver SessaoProvider. É de
 * propósito uma consulta só por tabela, e não uma por nível: são três
 * tabelas pequenas (dezenas de linhas), e o custo de trazê-las inteiras é
 * menor que o de encadear consultas antes da primeira tela aparecer.
 *
 * Falha aqui NÃO derruba a plataforma: quem chama cai na semente
 * compilada. Banco fora do ar com sidebar vazia seria pior do que sidebar
 * com o padrão de fábrica.
 */
export async function lerPermissoes(): Promise<Permissoes> {
  const cliente = supabase();

  const [{ data: niveis, error: e1 }, { data: matriz, error: e2 }, { data: caps, error: e3 }] =
    await Promise.all([
      cliente.from('niveis').select('id, rotulo, ordem, sistema').order('ordem'),
      cliente.from('permissoes_modulo').select('modulo, nivel, acesso'),
      cliente.from('permissoes_capacidade').select('capacidade, nivel'),
    ]);

  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);

  // Começa de 'none' em tudo: um par (módulo, nível) sem linha no banco é
  // ausência de permissão, não permissão herdada de lugar nenhum.
  const porModulo = {} as Permissoes['matriz'];
  for (const modulo of MODULOS) {
    porModulo[modulo] = {};
    for (const n of niveis ?? []) porModulo[modulo][n.id] = 'none';
  }
  for (const linha of matriz ?? []) {
    if (porModulo[linha.modulo as ModuloId]) {
      porModulo[linha.modulo as ModuloId][linha.nivel] = linha.acesso as Acesso;
    }
  }

  const porCapacidade = {} as Permissoes['capacidades'];
  for (const linha of caps ?? []) {
    const c = linha.capacidade as Capacidade;
    (porCapacidade[c] ??= []).push(linha.nivel);
  }

  return {
    niveis: (niveis ?? []).map((n) => ({
      id: n.id,
      rotulo: n.rotulo,
      ordem: n.ordem,
      sistema: n.sistema,
    })),
    matriz: porModulo,
    capacidades: porCapacidade,
  };
}

export const permissoes = {
  /**
   * Grava a matriz de módulos inteira, de uma vez.
   *
   * Um upsert só, não uma chamada por célula: a matriz é uma peça, e
   * gravar célula a célula deixaria estados intermediários incoerentes no
   * ar caso a rede caísse no meio. A trava do banco que exige uma porta
   * para Usuários é uma constraint ADIADA justamente para tolerar os
   * estados inválidos que existem durante este upsert.
   *
   * A linha do admin nunca é enviada: o banco a recusaria, e mandá-la só
   * produziria erro para uma edição que a tela nem permite.
   */
  async gravarMatriz(
    matriz: Record<ModuloId, Record<Nivel, Acesso>>,
  ): Promise<void> {
    const linhas: { modulo: string; nivel: string; acesso: string }[] = [];

    for (const modulo of MODULOS) {
      for (const [nivel, acesso] of Object.entries(matriz[modulo] ?? {})) {
        if (nivel === 'admin') continue;
        linhas.push({ modulo, nivel, acesso });
      }
    }

    const { error } = await supabase()
      .from('permissoes_modulo')
      .upsert(linhas, { onConflict: 'modulo,nivel' });

    if (error) throw new Error(traduzirPermissao(error.code, error.message));
  },

  /**
   * Cria um nível copiando outro.
   *
   * Passa pela função `criar_nivel` no Postgres em vez de inserts daqui:
   * o nível, a matriz e as capacidades precisam nascer juntos, e nível sem
   * matriz é pior que nível nenhum — o RLS negaria tudo em silêncio.
   */
  async criarNivel(id: string, rotulo: string, modelo: Nivel): Promise<string> {
    const { data, error } = await supabase().rpc('criar_nivel', {
      p_id: id,
      p_rotulo: rotulo,
      p_modelo: modelo,
    });

    if (error) throw new Error(traduzirPermissao(error.code, error.message));
    return data as string;
  },

  async renomearNivel(id: Nivel, rotulo: string): Promise<void> {
    const { error } = await supabase().from('niveis').update({ rotulo }).eq('id', id);
    if (error) throw new Error(traduzirPermissao(error.code, error.message));
  },

  async excluirNivel(id: Nivel): Promise<void> {
    const { error } = await supabase().from('niveis').delete().eq('id', id);
    if (error) throw new Error(traduzirPermissao(error.code, error.message));
  },
};

/**
 * Traduz o que o banco recusou.
 *
 * As travas do subsistema de permissão são triggers que levantam mensagem
 * já escrita em português e voltada ao usuário — nesses casos a mensagem
 * do banco é melhor do que qualquer coisa que a tela inventasse, e passa
 * direto. O que se traduz é o código seco do Postgres.
 */
function traduzirPermissao(codigo: string | undefined, mensagem: string): string {
  if (codigo === '42501') return 'Seu nível não permite alterar a matriz de permissões.';
  if (codigo === '23503') {
    return 'Este nível está em uso por alguém — mude a pessoa de nível antes de excluí-lo.';
  }
  if (codigo === '23505') return 'Já existe um nível com esse identificador.';
  return mensagem;
}
