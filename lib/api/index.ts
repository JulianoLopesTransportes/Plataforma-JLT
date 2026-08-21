/**
 * API — a única porta de saída para dados da plataforma.
 *
 * FASE DE TRANSIÇÃO. Cada função tem dois caminhos:
 *
 *   - Supabase configurado  → consulta o banco de verdade
 *   - Supabase ausente      → lê os JSON de /mock, como na Fase A
 *
 * A escolha é automática, por variável de ambiente. Isso existe para que a
 * plataforma continue de pé enquanto as variáveis não entram no ambiente
 * de produção: no dia em que entrarem, ela passa a ler o banco sozinha,
 * sem alteração de código e sem nenhum componente ser tocado.
 *
 * É exatamente para isso que esta camada foi criada lá na Fase A. A
 * assinatura pública de cada função não mudou uma vírgula.
 *
 * Quando a migração estiver completa e os dados reais estiverem no banco,
 * o caminho de mock pode ser removido junto com a pasta /mock.
 */

import { supabase, supabaseConfigurado } from '../supabase/cliente';
import { lerMock, casaBusca } from './cliente-http';
import { dentroDoPeriodo } from '../utils/formato';
import {
  paraCliente,
  paraVeiculo,
  paraMotorista,
  paraLancamento,
  paraCompromisso,
  paraRota,
  paraOrcamento,
} from './conversao';
import type {
  Cliente,
  Veiculo,
  Motorista,
  Lancamento,
  Compromisso,
  Rota,
  Orcamento,
  FaixaVolume,
  Adicional,
  Filtros,
} from '../tipos';

import clientesJson from '@/mock/clientes.json';
import veiculosJson from '@/mock/veiculos.json';
import motoristasJson from '@/mock/motoristas.json';
import lancamentosJson from '@/mock/lancamentos.json';
import compromissosJson from '@/mock/compromissos.json';
import rotasJson from '@/mock/rotas.json';
import orcamentosJson from '@/mock/orcamentos.json';
import parametrosJson from '@/mock/parametros-precificacao.json';

/** true quando estamos falando com o banco de verdade. */
export function usandoBanco(): boolean {
  return supabaseConfigurado();
}

/** Erro de consulta com mensagem legível. */
function verificar<T>(resposta: { data: T | null; error: { message: string } | null }): T {
  if (resposta.error) throw new Error(resposta.error.message);
  return (resposta.data ?? []) as T;
}

/* ==========================================================================
   Clientes
   ========================================================================== */

const clientes = {
  /** TODO(removível): o ramo de mock some quando a migração terminar. */
  async listar(filtros: Filtros = {}): Promise<Cliente[]> {
    if (!usandoBanco()) {
      const dados = (await lerMock(clientesJson)) as Cliente[];
      return dados.filter(
        (c) =>
          casaBusca(c, filtros.busca, ['nome', 'documento', 'email', 'telefone']) &&
          (!filtros.status || c.status === filtros.status) &&
          (!filtros.de && !filtros.ate
            ? true
            : dentroDoPeriodo(c.dataPrevista, filtros.de, filtros.ate)),
      );
    }

    let consulta = supabase()
      .from('clientes')
      .select('*, cliente_anexos(*), cliente_historico(*)')
      .order('criado_em', { ascending: false });

    if (filtros.status) consulta = consulta.eq('status', filtros.status);
    if (filtros.de) consulta = consulta.gte('data_prevista', filtros.de);
    if (filtros.ate) consulta = consulta.lte('data_prevista', filtros.ate);
    if (filtros.busca) {
      // ilike já é insensível a caixa; o front ainda filtra por acento.
      consulta = consulta.or(
        `nome.ilike.%${filtros.busca}%,documento.ilike.%${filtros.busca}%,email.ilike.%${filtros.busca}%`,
      );
    }

    return verificar(await consulta).map(paraCliente);
  },

  async obter(id: string): Promise<Cliente | null> {
    if (!usandoBanco()) {
      const dados = (await lerMock(clientesJson)) as Cliente[];
      return dados.find((c) => c.id === id) ?? null;
    }

    const { data, error } = await supabase()
      .from('clientes')
      .select('*, cliente_anexos(*), cliente_historico(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? paraCliente(data) : null;
  },

  async criar(cliente: Omit<Cliente, 'id' | 'criadoEm' | 'anexos' | 'historico'>): Promise<Cliente> {
    if (!usandoBanco()) {
      throw new Error('Cadastro exige o banco de dados configurado.');
    }

    const { data, error } = await supabase()
      .from('clientes')
      .insert({
        tipo: cliente.tipo,
        nome: cliente.nome,
        documento: cliente.documento,
        telefone: cliente.telefone,
        email: cliente.email,
        status: cliente.status,
        origem: cliente.origem,
        origem_detalhe: cliente.origemDetalhe ?? '',
        endereco_coleta: cliente.enderecoColeta,
        endereco_entrega: cliente.enderecoEntrega,
        volume_m3: cliente.volumeM3,
        data_prevista: cliente.dataPrevista || null,
        observacoes: cliente.observacoes,
        itens: cliente.itens,
      })
      .select('*, cliente_anexos(*), cliente_historico(*)')
      .single();

    if (error) throw new Error(traduzir(error));
    return paraCliente(data);
  },

  async atualizar(id: string, mudancas: Partial<Cliente>): Promise<void> {
    if (!usandoBanco()) throw new Error('Edição exige o banco de dados configurado.');

    const campos: Record<string, unknown> = {};
    if (mudancas.nome !== undefined) campos.nome = mudancas.nome;
    if (mudancas.status !== undefined) campos.status = mudancas.status;
    if (mudancas.telefone !== undefined) campos.telefone = mudancas.telefone;
    if (mudancas.email !== undefined) campos.email = mudancas.email;
    if (mudancas.documento !== undefined) campos.documento = mudancas.documento;
    if (mudancas.volumeM3 !== undefined) campos.volume_m3 = mudancas.volumeM3;
    if (mudancas.dataPrevista !== undefined) campos.data_prevista = mudancas.dataPrevista || null;
    if (mudancas.enderecoColeta !== undefined) campos.endereco_coleta = mudancas.enderecoColeta;
    if (mudancas.enderecoEntrega !== undefined) campos.endereco_entrega = mudancas.enderecoEntrega;
    if (mudancas.observacoes !== undefined) campos.observacoes = mudancas.observacoes;
    if (mudancas.itens !== undefined) campos.itens = mudancas.itens;

    const { error } = await supabase().from('clientes').update(campos).eq('id', id);
    if (error) throw new Error(traduzir(error));
  },

  async excluir(id: string): Promise<void> {
    if (!usandoBanco()) throw new Error('Exclusão exige o banco de dados configurado.');
    const { error } = await supabase().from('clientes').delete().eq('id', id);
    if (error) throw new Error(traduzir(error));
  },

  /** Registra um evento no histórico do cliente. */
  async registrarHistorico(clienteId: string, autorNome: string, descricao: string): Promise<void> {
    if (!usandoBanco()) return;
    const { error } = await supabase().from('cliente_historico').insert({
      cliente_id: clienteId,
      autor_nome: autorNome,
      descricao,
    });
    if (error) throw new Error(traduzir(error));
  },
};

/* ==========================================================================
   Frota
   ========================================================================== */

const veiculos = {
  async listar(filtros: Filtros = {}): Promise<Veiculo[]> {
    if (!usandoBanco()) {
      const dados = (await lerMock(veiculosJson)) as Veiculo[];
      return dados.filter(
        (v) =>
          casaBusca(v, filtros.busca, ['placa', 'modelo', 'marca']) &&
          (!filtros.status || v.status === filtros.status),
      );
    }

    let consulta = supabase()
      .from('veiculos')
      .select('*, veiculo_anexos(*)')
      .order('placa');

    if (filtros.status) consulta = consulta.eq('status', filtros.status);

    return verificar(await consulta).map(paraVeiculo);
  },

  async obter(id: string): Promise<Veiculo | null> {
    if (!usandoBanco()) {
      const dados = (await lerMock(veiculosJson)) as Veiculo[];
      return dados.find((v) => v.id === id) ?? null;
    }

    const { data, error } = await supabase()
      .from('veiculos')
      .select('*, veiculo_anexos(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? paraVeiculo(data) : null;
  },

  async criar(veiculo: Omit<Veiculo, 'id' | 'anexos'>): Promise<Veiculo> {
    if (!usandoBanco()) throw new Error('Cadastro exige o banco de dados configurado.');

    const { data, error } = await supabase()
      .from('veiculos')
      .insert(paraLinhaVeiculo(veiculo))
      .select('*, veiculo_anexos(*)')
      .single();

    if (error) throw new Error(traduzir(error));
    return paraVeiculo(data);
  },

  async atualizar(id: string, mudancas: Partial<Veiculo>): Promise<void> {
    if (!usandoBanco()) throw new Error('Edição exige o banco de dados configurado.');
    const { error } = await supabase()
      .from('veiculos')
      .update(paraLinhaVeiculo(mudancas))
      .eq('id', id);
    if (error) throw new Error(traduzir(error));
  },

  async excluir(id: string): Promise<void> {
    if (!usandoBanco()) throw new Error('Exclusão exige o banco de dados configurado.');
    const { error } = await supabase().from('veiculos').delete().eq('id', id);
    if (error) throw new Error(traduzir(error));
  },
};

/** Converte o veículo do formato do front para o do banco. */
function paraLinhaVeiculo(v: Partial<Veiculo>): Record<string, unknown> {
  const linha: Record<string, unknown> = {};
  if (v.placa !== undefined) linha.placa = v.placa.toUpperCase();
  if (v.modelo !== undefined) linha.modelo = v.modelo;
  if (v.marca !== undefined) linha.marca = v.marca;
  if (v.ano !== undefined) linha.ano = v.ano || null;
  if (v.capacidadeM3 !== undefined) linha.capacidade_m3 = v.capacidadeM3;
  if (v.capacidadeKg !== undefined) linha.capacidade_kg = v.capacidadeKg;
  if (v.status !== undefined) linha.status = v.status;
  if (v.proximaManutencao !== undefined) linha.proxima_manutencao = v.proximaManutencao || null;
  if (v.observacoes !== undefined) linha.observacoes = v.observacoes;
  return linha;
}

const motoristas = {
  async listar(filtros: Filtros = {}): Promise<Motorista[]> {
    if (!usandoBanco()) {
      const dados = (await lerMock(motoristasJson)) as Motorista[];
      return dados.filter(
        (m) =>
          casaBusca(m, filtros.busca, ['nome', 'cpf', 'cnh', 'telefone']) &&
          (!filtros.status || m.status === filtros.status) &&
          (!filtros.veiculoId || m.veiculoId === filtros.veiculoId),
      );
    }

    let consulta = supabase()
      .from('motoristas')
      .select('*, motorista_anexos(*)')
      .order('nome');

    if (filtros.status) consulta = consulta.eq('status', filtros.status);
    if (filtros.veiculoId) consulta = consulta.eq('veiculo_id', filtros.veiculoId);

    return verificar(await consulta).map(paraMotorista);
  },

  async obter(id: string): Promise<Motorista | null> {
    if (!usandoBanco()) {
      const dados = (await lerMock(motoristasJson)) as Motorista[];
      return dados.find((m) => m.id === id) ?? null;
    }

    const { data, error } = await supabase()
      .from('motoristas')
      .select('*, motorista_anexos(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? paraMotorista(data) : null;
  },

  async criar(motorista: Omit<Motorista, 'id' | 'anexos'>): Promise<Motorista> {
    if (!usandoBanco()) throw new Error('Cadastro exige o banco de dados configurado.');

    const { data, error } = await supabase()
      .from('motoristas')
      .insert(paraLinhaMotorista(motorista))
      .select('*, motorista_anexos(*)')
      .single();

    if (error) throw new Error(traduzir(error));
    return paraMotorista(data);
  },

  async atualizar(id: string, mudancas: Partial<Motorista>): Promise<void> {
    if (!usandoBanco()) throw new Error('Edição exige o banco de dados configurado.');
    const { error } = await supabase()
      .from('motoristas')
      .update(paraLinhaMotorista(mudancas))
      .eq('id', id);
    if (error) throw new Error(traduzir(error));
  },

  async excluir(id: string): Promise<void> {
    if (!usandoBanco()) throw new Error('Exclusão exige o banco de dados configurado.');
    const { error } = await supabase().from('motoristas').delete().eq('id', id);
    if (error) throw new Error(traduzir(error));
  },
};

/** Converte o motorista do formato do front para o do banco. */
function paraLinhaMotorista(m: Partial<Motorista>): Record<string, unknown> {
  const linha: Record<string, unknown> = {};
  if (m.nome !== undefined) linha.nome = m.nome;
  if (m.cpf !== undefined) linha.cpf = m.cpf;
  if (m.telefone !== undefined) linha.telefone = m.telefone;
  if (m.cnh !== undefined) linha.cnh = m.cnh;
  if (m.categoriaCnh !== undefined) linha.categoria_cnh = m.categoriaCnh || null;
  if (m.validadeCnh !== undefined) linha.validade_cnh = m.validadeCnh || null;
  if (m.status !== undefined) linha.status = m.status;
  if (m.veiculoId !== undefined) linha.veiculo_id = m.veiculoId;
  if (m.admissao !== undefined) linha.admissao = m.admissao || null;
  if (m.observacoes !== undefined) linha.observacoes = m.observacoes;
  return linha;
}

/* ==========================================================================
   Financeiro
   ========================================================================== */

const financeiro = {
  async listar(filtros: Filtros = {}): Promise<Lancamento[]> {
    if (!usandoBanco()) {
      const dados = (await lerMock(lancamentosJson)) as Lancamento[];
      return dados
        .filter(
          (l) =>
            casaBusca(l, filtros.busca, ['descricao', 'categoria']) &&
            dentroDoPeriodo(l.data, filtros.de, filtros.ate) &&
            (!filtros.veiculoId || l.veiculoId === filtros.veiculoId) &&
            (!filtros.motoristaId || l.motoristaId === filtros.motoristaId) &&
            (!filtros.clienteId || l.clienteId === filtros.clienteId),
        )
        .sort((a, b) => b.data.localeCompare(a.data));
    }

    let consulta = supabase().from('lancamentos').select('*').order('data', { ascending: false });

    if (filtros.de) consulta = consulta.gte('data', filtros.de);
    if (filtros.ate) consulta = consulta.lte('data', filtros.ate);
    if (filtros.veiculoId) consulta = consulta.eq('veiculo_id', filtros.veiculoId);
    if (filtros.motoristaId) consulta = consulta.eq('motorista_id', filtros.motoristaId);
    if (filtros.clienteId) consulta = consulta.eq('cliente_id', filtros.clienteId);

    return verificar(await consulta).map(paraLancamento);
  },

  async categorias(): Promise<string[]> {
    if (!usandoBanco()) {
      const dados = (await lerMock(lancamentosJson)) as Lancamento[];
      return [...new Set(dados.map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    const dados = verificar(await supabase().from('lancamentos').select('categoria'));
    return [...new Set((dados as { categoria: string }[]).map((l) => l.categoria))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
  },

  async criar(lancamento: Omit<Lancamento, 'id'>): Promise<Lancamento> {
    if (!usandoBanco()) throw new Error('Lançamento exige o banco de dados configurado.');

    const { data, error } = await supabase()
      .from('lancamentos')
      .insert({
        tipo: lancamento.tipo,
        data: lancamento.data,
        valor: lancamento.valor,
        categoria: lancamento.categoria,
        descricao: lancamento.descricao,
        veiculo_id: lancamento.veiculoId,
        motorista_id: lancamento.motoristaId,
        cliente_id: lancamento.clienteId,
      })
      .select()
      .single();

    if (error) throw new Error(traduzir(error));
    return paraLancamento(data);
  },

  async excluir(id: string): Promise<void> {
    if (!usandoBanco()) throw new Error('Exclusão exige o banco de dados configurado.');
    const { error } = await supabase().from('lancamentos').delete().eq('id', id);
    if (error) throw new Error(traduzir(error));
  },
};

/* ==========================================================================
   Agenda
   ========================================================================== */

const agenda = {
  async listar(filtros: Filtros = {}): Promise<Compromisso[]> {
    if (!usandoBanco()) {
      const dados = (await lerMock(compromissosJson)) as Compromisso[];
      return dados
        .filter(
          (c) =>
            casaBusca(c, filtros.busca, ['titulo', 'observacoes']) &&
            dentroDoPeriodo(c.data, filtros.de, filtros.ate) &&
            (!filtros.clienteId || c.clienteId === filtros.clienteId) &&
            (!filtros.veiculoId || c.veiculoId === filtros.veiculoId) &&
            (!filtros.motoristaId || c.motoristaId === filtros.motoristaId),
        )
        .sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario));
    }

    let consulta = supabase()
      .from('compromissos')
      .select('*')
      .order('data')
      .order('horario', { nullsFirst: true });

    if (filtros.de) consulta = consulta.gte('data', filtros.de);
    if (filtros.ate) consulta = consulta.lte('data', filtros.ate);
    if (filtros.clienteId) consulta = consulta.eq('cliente_id', filtros.clienteId);
    if (filtros.veiculoId) consulta = consulta.eq('veiculo_id', filtros.veiculoId);
    if (filtros.motoristaId) consulta = consulta.eq('motorista_id', filtros.motoristaId);

    return verificar(await consulta).map(paraCompromisso);
  },

  async obter(id: string): Promise<Compromisso | null> {
    if (!usandoBanco()) {
      const dados = (await lerMock(compromissosJson)) as Compromisso[];
      return dados.find((c) => c.id === id) ?? null;
    }

    const { data, error } = await supabase()
      .from('compromissos')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? paraCompromisso(data) : null;
  },

  async criar(compromisso: Omit<Compromisso, 'id'>): Promise<Compromisso> {
    if (!usandoBanco()) throw new Error('Agendamento exige o banco de dados configurado.');

    const { data, error } = await supabase()
      .from('compromissos')
      .insert(paraLinhaCompromisso(compromisso))
      .select()
      .single();

    if (error) throw new Error(traduzir(error));
    return paraCompromisso(data);
  },

  async atualizar(id: string, mudancas: Partial<Compromisso>): Promise<void> {
    if (!usandoBanco()) throw new Error('Edição exige o banco de dados configurado.');
    const { error } = await supabase()
      .from('compromissos')
      .update(paraLinhaCompromisso(mudancas))
      .eq('id', id);
    if (error) throw new Error(traduzir(error));
  },

  async excluir(id: string): Promise<void> {
    if (!usandoBanco()) throw new Error('Exclusão exige o banco de dados configurado.');
    const { error } = await supabase().from('compromissos').delete().eq('id', id);
    if (error) throw new Error(traduzir(error));
  },
};

/** Converte o compromisso do formato do front para o do banco. */
function paraLinhaCompromisso(c: Partial<Compromisso>): Record<string, unknown> {
  const linha: Record<string, unknown> = {};
  if (c.tipo !== undefined) linha.tipo = c.tipo;
  if (c.titulo !== undefined) linha.titulo = c.titulo;
  if (c.data !== undefined) linha.data = c.data;
  if (c.diaInteiro !== undefined) linha.dia_inteiro = c.diaInteiro;
  // A constraint horario_coerente exige horário quando não é dia inteiro.
  if (c.horario !== undefined || c.diaInteiro !== undefined) {
    linha.horario = c.diaInteiro ? null : c.horario || null;
  }
  if (c.clienteId !== undefined) linha.cliente_id = c.clienteId;
  if (c.veiculoId !== undefined) linha.veiculo_id = c.veiculoId;
  if (c.motoristaId !== undefined) linha.motorista_id = c.motoristaId;
  if (c.rotaId !== undefined) linha.rota_id = c.rotaId;
  if (c.enderecoColeta !== undefined) linha.endereco_coleta = c.enderecoColeta;
  if (c.enderecoEntrega !== undefined) linha.endereco_entrega = c.enderecoEntrega;
  if (c.caracteristicas !== undefined) linha.caracteristicas = c.caracteristicas;
  if (c.observacoes !== undefined) linha.observacoes = c.observacoes;
  return linha;
}

/* ==========================================================================
   Rotas
   ========================================================================== */

const SELECT_ROTA = '*, mudancas(*), paradas(*, parada_movimentos(*))';

const rotas = {
  async listar(filtros: Filtros = {}): Promise<Rota[]> {
    if (!usandoBanco()) {
      const dados = (await lerMock(rotasJson)) as Rota[];
      return dados.filter(
        (r) =>
          casaBusca(r, filtros.busca, ['nome', 'origem', 'destino']) &&
          (!filtros.status || r.status === filtros.status) &&
          (!filtros.veiculoId || r.veiculoId === filtros.veiculoId) &&
          (!filtros.motoristaId || r.motoristaId === filtros.motoristaId) &&
          dentroDoPeriodo(r.dataSaida, filtros.de, filtros.ate),
      );
    }

    let consulta = supabase()
      .from('rotas')
      .select(SELECT_ROTA)
      .order('data_saida', { ascending: false, nullsFirst: false });

    if (filtros.status) consulta = consulta.eq('status', filtros.status);
    if (filtros.veiculoId) consulta = consulta.eq('veiculo_id', filtros.veiculoId);
    if (filtros.motoristaId) consulta = consulta.eq('motorista_id', filtros.motoristaId);
    if (filtros.de) consulta = consulta.gte('data_saida', filtros.de);
    if (filtros.ate) consulta = consulta.lte('data_saida', filtros.ate);

    return verificar(await consulta).map(paraRota);
  },

  async obter(id: string): Promise<Rota | null> {
    if (!usandoBanco()) {
      const dados = (await lerMock(rotasJson)) as Rota[];
      return dados.find((r) => r.id === id) ?? null;
    }

    const { data, error } = await supabase()
      .from('rotas')
      .select(SELECT_ROTA)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? paraRota(data) : null;
  },

  /**
   * Cria a rota inteira — cargas, paradas e movimentos — numa transação.
   *
   * Delega para a função criar_rota_completa no Postgres em vez de fazer
   * quatro inserts daqui. Motivo: paradas referenciam cargas, que só ganham
   * id depois de inseridas, e sem transação uma falha no meio deixaria rota
   * órfã. As cargas viajam com um id temporário que o banco mapeia.
   */
  async criar(rota: {
    nome: string;
    origem: string;
    destino: string;
    dataSaida: string;
    dataPrevistaRetorno: string;
    veiculoId: string | null;
    motoristaId: string | null;
    mudancas: {
      tempId: string;
      clienteId: string | null;
      clienteNome: string;
      telefone: string;
      documento: string;
      volumeM3: number;
      enderecoColeta: string;
      enderecoEntrega: string;
      observacao: string;
    }[];
    paradas: {
      tipo: string;
      cidade: string;
      uf: string;
      endereco: string;
      data: string;
      observacao: string;
      coletam: string[];
      entregam: string[];
    }[];
  }): Promise<string> {
    if (!usandoBanco()) throw new Error('Criar rota exige o banco de dados configurado.');

    const { data, error } = await supabase().rpc('criar_rota_completa', {
      p_rota: {
        nome: rota.nome,
        status: 'planejada',
        veiculo_id: rota.veiculoId ?? '',
        motorista_id: rota.motoristaId ?? '',
        origem: rota.origem,
        destino: rota.destino,
        data_saida: rota.dataSaida,
        data_prevista_retorno: rota.dataPrevistaRetorno,
        mudancas: rota.mudancas.map((m) => ({
          temp_id: m.tempId,
          cliente_id: m.clienteId ?? '',
          cliente_nome: m.clienteNome,
          telefone: m.telefone,
          documento: m.documento,
          volume_m3: m.volumeM3,
          endereco_coleta: m.enderecoColeta,
          endereco_entrega: m.enderecoEntrega,
          observacao: m.observacao,
        })),
        paradas: rota.paradas.map((p) => ({
          tipo: p.tipo,
          cidade: p.cidade,
          uf: p.uf,
          endereco: p.endereco,
          data: p.data,
          observacao: p.observacao,
          coletam: p.coletam,
          entregam: p.entregam,
        })),
      },
    });

    if (error) throw new Error(traduzir(error));
    return data as string;
  },

  async excluir(id: string): Promise<void> {
    if (!usandoBanco()) throw new Error('Exclusão exige o banco de dados configurado.');
    // As cargas, paradas e movimentos caem junto por ON DELETE CASCADE.
    const { error } = await supabase().from('rotas').delete().eq('id', id);
    if (error) throw new Error(traduzir(error));
  },

  async atualizarStatus(id: string, status: Rota['status']): Promise<void> {
    if (!usandoBanco()) throw new Error('Alteração exige o banco de dados configurado.');
    const { error } = await supabase().from('rotas').update({ status }).eq('id', id);
    if (error) throw new Error(traduzir(error));
  },
};

/* ==========================================================================
   Orçamentos
   ========================================================================== */

export type ParametrosPrecificacao = {
  faixasVolume: FaixaVolume[];
  adicionais: Adicional[];
  custoPorKm: number;
  margemMinima: number;
  margemMaxima: number;
};

const orcamentos = {
  async listar(filtros: Filtros = {}): Promise<Orcamento[]> {
    if (!usandoBanco()) {
      const dados = (await lerMock(orcamentosJson)) as Orcamento[];
      return dados
        .filter(
          (o) =>
            casaBusca(o, filtros.busca, ['clienteNome', 'observacoes']) &&
            (!filtros.status || o.status === filtros.status) &&
            (!filtros.clienteId || o.clienteId === filtros.clienteId) &&
            dentroDoPeriodo(o.data, filtros.de, filtros.ate),
        )
        .sort((a, b) => b.data.localeCompare(a.data));
    }

    // A VIEW, não a tabela: é ela que mascara custo e margem para quem não
    // tem a capacidade ver_custos. Ver migration 04.
    let consulta = supabase()
      .from('orcamentos_visao')
      .select('*')
      .order('data', { ascending: false });

    if (filtros.status) consulta = consulta.eq('status', filtros.status);
    if (filtros.clienteId) consulta = consulta.eq('cliente_id', filtros.clienteId);
    if (filtros.de) consulta = consulta.gte('data', filtros.de);
    if (filtros.ate) consulta = consulta.lte('data', filtros.ate);

    return verificar(await consulta).map(paraOrcamento);
  },

  async obter(id: string): Promise<Orcamento | null> {
    if (!usandoBanco()) {
      const dados = (await lerMock(orcamentosJson)) as Orcamento[];
      return dados.find((o) => o.id === id) ?? null;
    }

    const { data, error } = await supabase()
      .from('orcamentos_visao')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? paraOrcamento(data) : null;
  },

  async aprovar(id: string): Promise<void> {
    if (!usandoBanco()) throw new Error('Aprovação exige o banco de dados configurado.');
    const { error } = await supabase().from('orcamentos').update({ status: 'aprovado' }).eq('id', id);
    if (error) throw new Error(traduzir(error));
  },

  /**
   * Parâmetros de precificação — contêm CUSTO INTERNO.
   *
   * Com o banco, o RLS já barra quem não tem a capacidade ver_custos: as
   * listas voltam vazias. Quem precisa apenas do preço usa
   * `precificacao.calcularPreco()` em lib/api/admin.ts.
   */
  async parametros(): Promise<ParametrosPrecificacao> {
    if (!usandoBanco()) {
      return lerMock(parametrosJson as unknown as ParametrosPrecificacao);
    }

    const cliente = supabase();
    const [{ data: faixas }, { data: adicionais }, { data: gerais }] = await Promise.all([
      cliente.from('faixas_volume').select('id, ate, valor_base').order('ate'),
      cliente.from('adicionais').select('id, nome, tipo, valor').eq('ativo', true).order('nome'),
      cliente
        .from('parametros_precificacao')
        .select('custo_por_km, margem_minima, margem_maxima')
        .maybeSingle(),
    ]);

    return {
      faixasVolume: (faixas ?? []).map((f) => ({
        id: f.id,
        ate: Number(f.ate),
        valorBase: Number(f.valor_base),
      })),
      adicionais: (adicionais ?? []).map((a) => ({
        id: a.id,
        nome: a.nome,
        tipo: a.tipo as Adicional['tipo'],
        valor: Number(a.valor),
      })),
      custoPorKm: Number(gerais?.custo_por_km ?? 0),
      margemMinima: Number(gerais?.margem_minima ?? 25),
      margemMaxima: Number(gerais?.margem_maxima ?? 55),
    };
  },
};

/* ==========================================================================
   Relatórios
   ========================================================================== */

export type LinhaRelatorioDb = {
  rotaId: string;
  rotaNome: string;
  dataSaida: string;
  status: string;
  clientes: string;
  veiculo: string;
  motorista: string;
  volumeM3: number;
  /** null quando o nível não tem a capacidade ver_faturamento. */
  faturamento: number | null;
  /** null quando o nível não tem a capacidade ver_custos. */
  custo: number | null;
};

const relatorios = {
  /**
   * Consolidação por rota, direto do banco.
   *
   * A função relatorio_operacoes() aplica o recorte por capacidade e devolve
   * NULL — não zero — nas colunas que o nível não pode ver. Ver migration 04.
   */
  async operacoes(filtros: Filtros = {}): Promise<LinhaRelatorioDb[] | null> {
    if (!usandoBanco()) return null;

    const { data, error } = await supabase().rpc('relatorio_operacoes', {
      p_de: filtros.de || null,
      p_ate: filtros.ate || null,
      p_cliente_id: filtros.clienteId || null,
      p_veiculo_id: filtros.veiculoId || null,
      p_motorista_id: filtros.motoristaId || null,
      p_status: filtros.status || null,
    });

    if (error) throw new Error(error.message);

    return (data ?? []).map((l: Record<string, unknown>) => ({
      rotaId: l.rota_id as string,
      rotaNome: l.rota_nome as string,
      dataSaida: (l.data_saida as string) ?? '',
      status: l.status as string,
      clientes: l.clientes as string,
      veiculo: l.veiculo as string,
      motorista: l.motorista as string,
      volumeM3: Number(l.volume_m3 ?? 0),
      faturamento: l.faturamento === null ? null : Number(l.faturamento),
      custo: l.custo === null ? null : Number(l.custo),
    }));
  },
};

/* ==========================================================================
   Tradução de erros do Postgres
   ========================================================================== */

function traduzir(erro: { code?: string; message: string }): string {
  switch (erro.code) {
    case '42501':
      return 'Seu nível de acesso não permite esta operação.';
    case '23505':
      return 'Já existe um registro com esses dados.';
    case '23503':
      return 'Existe outro registro dependendo deste. Remova o vínculo primeiro.';
    case '23514':
      return 'Algum campo está fora do formato esperado.';
    default:
      return erro.message;
  }
}

/* ==========================================================================
   Export
   ========================================================================== */

export const api = {
  clientes,
  veiculos,
  motoristas,
  financeiro,
  agenda,
  rotas,
  orcamentos,
  relatorios,
};

export default api;
