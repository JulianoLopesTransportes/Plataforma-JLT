/**
 * API — a única porta de saída para dados da plataforma.
 *
 * Nenhum componente importa JSON de /mock diretamente. Tudo passa por aqui.
 * Cada função carrega o comentário do endpoint real que vai substituí-la,
 * para que a troca na Fase B (Supabase) seja mecânica.
 *
 * Uso:
 *   const clientes = await api.clientes.listar({ status: 'Novo' });
 *   const rota = await api.rotas.obter('rot_001');
 */

import { lerMock, casaBusca } from './cliente-http';
import { dentroDoPeriodo } from '../utils/formato';
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

/* ==========================================================================
   Clientes
   ========================================================================== */

const clientes = {
  /** TODO: substituir por GET /api/clientes */
  async listar(filtros: Filtros = {}): Promise<Cliente[]> {
    const dados = (await lerMock(clientesJson)) as Cliente[];
    return dados.filter(
      (c) =>
        casaBusca(c, filtros.busca, ['nome', 'documento', 'email', 'telefone']) &&
        (!filtros.status || c.status === filtros.status) &&
        (!filtros.de && !filtros.ate ? true : dentroDoPeriodo(c.dataPrevista, filtros.de, filtros.ate)),
    );
  },

  /** TODO: substituir por GET /api/clientes/:id */
  async obter(id: string): Promise<Cliente | null> {
    const dados = (await lerMock(clientesJson)) as Cliente[];
    return dados.find((c) => c.id === id) ?? null;
  },
};

/* ==========================================================================
   Frota — veículos e motoristas
   ========================================================================== */

const veiculos = {
  /** TODO: substituir por GET /api/veiculos */
  async listar(filtros: Filtros = {}): Promise<Veiculo[]> {
    const dados = (await lerMock(veiculosJson)) as Veiculo[];
    return dados.filter(
      (v) =>
        casaBusca(v, filtros.busca, ['placa', 'modelo', 'marca']) &&
        (!filtros.status || v.status === filtros.status),
    );
  },

  /** TODO: substituir por GET /api/veiculos/:id */
  async obter(id: string): Promise<Veiculo | null> {
    const dados = (await lerMock(veiculosJson)) as Veiculo[];
    return dados.find((v) => v.id === id) ?? null;
  },
};

const motoristas = {
  /** TODO: substituir por GET /api/motoristas */
  async listar(filtros: Filtros = {}): Promise<Motorista[]> {
    const dados = (await lerMock(motoristasJson)) as Motorista[];
    return dados.filter(
      (m) =>
        casaBusca(m, filtros.busca, ['nome', 'cpf', 'cnh', 'telefone']) &&
        (!filtros.status || m.status === filtros.status) &&
        (!filtros.veiculoId || m.veiculoId === filtros.veiculoId),
    );
  },

  /** TODO: substituir por GET /api/motoristas/:id */
  async obter(id: string): Promise<Motorista | null> {
    const dados = (await lerMock(motoristasJson)) as Motorista[];
    return dados.find((m) => m.id === id) ?? null;
  },
};

/* ==========================================================================
   Financeiro
   ========================================================================== */

const financeiro = {
  /** TODO: substituir por GET /api/lancamentos */
  async listar(filtros: Filtros = {}): Promise<Lancamento[]> {
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
  },

  /** TODO: substituir por GET /api/lancamentos/categorias */
  async categorias(): Promise<string[]> {
    const dados = (await lerMock(lancamentosJson)) as Lancamento[];
    return [...new Set(dados.map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  },
};

/* ==========================================================================
   Agenda
   ========================================================================== */

const agenda = {
  /** TODO: substituir por GET /api/compromissos */
  async listar(filtros: Filtros = {}): Promise<Compromisso[]> {
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
  },

  /** TODO: substituir por GET /api/compromissos/:id */
  async obter(id: string): Promise<Compromisso | null> {
    const dados = (await lerMock(compromissosJson)) as Compromisso[];
    return dados.find((c) => c.id === id) ?? null;
  },
};

/* ==========================================================================
   Rotas
   ========================================================================== */

const rotas = {
  /** TODO: substituir por GET /api/rotas */
  async listar(filtros: Filtros = {}): Promise<Rota[]> {
    const dados = (await lerMock(rotasJson)) as Rota[];
    return dados.filter(
      (r) =>
        casaBusca(r, filtros.busca, ['nome', 'origem', 'destino']) &&
        (!filtros.status || r.status === filtros.status) &&
        (!filtros.veiculoId || r.veiculoId === filtros.veiculoId) &&
        (!filtros.motoristaId || r.motoristaId === filtros.motoristaId) &&
        dentroDoPeriodo(r.dataSaida, filtros.de, filtros.ate),
    );
  },

  /** TODO: substituir por GET /api/rotas/:id */
  async obter(id: string): Promise<Rota | null> {
    const dados = (await lerMock(rotasJson)) as Rota[];
    return dados.find((r) => r.id === id) ?? null;
  },
};

/* ==========================================================================
   Orçamentos e parâmetros de precificação
   ========================================================================== */

export type ParametrosPrecificacao = {
  faixasVolume: FaixaVolume[];
  adicionais: Adicional[];
  /** Custo rodoviário por km, em BRL. Dado interno. */
  custoPorKm: number;
  margemMinima: number;
  margemMaxima: number;
};

const orcamentos = {
  /** TODO: substituir por GET /api/orcamentos */
  async listar(filtros: Filtros = {}): Promise<Orcamento[]> {
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
  },

  /** TODO: substituir por GET /api/orcamentos/:id */
  async obter(id: string): Promise<Orcamento | null> {
    const dados = (await lerMock(orcamentosJson)) as Orcamento[];
    return dados.find((o) => o.id === id) ?? null;
  },

  /**
   * Parâmetros de precificação: faixas de volume, adicionais, custo/km e
   * limites de margem.
   *
   * Atenção de permissão: estes dados contêm CUSTO INTERNO. Quem consome
   * precisa checar podeFazer(nivel, 'ver_custos') antes de exibir.
   *
   * TODO: substituir por GET /api/parametros-precificacao
   */
  async parametros(): Promise<ParametrosPrecificacao> {
    // O import de JSON alarga os literais para `string`; o cast reata o
    // dado ao tipo de domínio. Some quando o schema vier do Supabase.
    return lerMock(parametrosJson as unknown as ParametrosPrecificacao);
  },
};

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
};

export default api;
