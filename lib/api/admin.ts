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
import type { Nivel } from '../permissoes';

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
export type AdicionalDb = {
  id: string;
  nome: string;
  tipo: 'fixo' | 'percentual';
  valor: number;
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
      cliente.from('adicionais').select('id, nome, tipo, valor, ativo').order('nome'),
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
        tipo: a.tipo as 'fixo' | 'percentual',
        valor: a.valor,
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
    tipo: 'fixo' | 'percentual';
    valor: number;
  }): Promise<void> {
    const cliente = supabase();
    const payload = { nome: adicional.nome, tipo: adicional.tipo, valor: adicional.valor };

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
