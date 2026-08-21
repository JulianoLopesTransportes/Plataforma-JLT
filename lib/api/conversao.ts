/**
 * CONVERSÃO — linhas do Postgres para os tipos de domínio.
 *
 * O banco usa snake_case (convenção do SQL) e o front usa camelCase
 * (convenção do TypeScript). A tradução acontece só aqui, para que nenhum
 * componente precise conhecer o formato do banco.
 *
 * Também normaliza `numeric`: o PostgREST às vezes devolve esses campos
 * como string para não perder precisão, e uma soma silenciosa de strings
 * viraria concatenação — "10" + "20" = "1020" em vez de 30.
 */

import type {
  Cliente,
  Veiculo,
  Motorista,
  Lancamento,
  Compromisso,
  Rota,
  Orcamento,
  Anexo,
  EventoHistorico,
  StatusCliente,
  OrigemCliente,
  TipoPessoa,
} from '../tipos';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** numeric do Postgres pode chegar como string. Isto garante número. */
function num(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isNaN(n) ? 0 : n;
}

/** Igual a num(), mas preserva a distinção entre "zero" e "não informado". */
function numOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isNaN(n) ? null : n;
}

/** Campo de texto que no banco pode ser null mas no front é string vazia. */
function txt(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

export function paraCliente(linha: any): Cliente {
  return {
    id: linha.id,
    tipo: linha.tipo as TipoPessoa,
    nome: txt(linha.nome),
    documento: txt(linha.documento),
    telefone: txt(linha.telefone),
    email: txt(linha.email),
    status: linha.status as StatusCliente,
    origem: linha.origem as OrigemCliente,
    origemDetalhe: txt(linha.origem_detalhe),
    enderecoColeta: txt(linha.endereco_coleta),
    enderecoEntrega: txt(linha.endereco_entrega),
    volumeM3: numOuNulo(linha.volume_m3),
    dataPrevista: txt(linha.data_prevista),
    observacoes: txt(linha.observacoes),
    itens: txt(linha.itens),
    criadoEm: txt(linha.criado_em),
    anexos: (linha.cliente_anexos ?? []).map(paraAnexo),
    historico: (linha.cliente_historico ?? []).map(paraEvento),
  };
}

function paraAnexo(linha: any): Anexo {
  return {
    id: linha.id,
    nome: txt(linha.nome),
    caminho: txt(linha.caminho),
    tipo: txt(linha.tipo),
    tamanho: num(linha.tamanho),
    enviadoEm: txt(linha.enviado_em),
  };
}

function paraEvento(linha: any): EventoHistorico {
  return {
    id: linha.id,
    em: txt(linha.em),
    autor: txt(linha.autor_nome),
    descricao: txt(linha.descricao),
  };
}

export function paraVeiculo(linha: any): Veiculo {
  return {
    id: linha.id,
    placa: txt(linha.placa),
    modelo: txt(linha.modelo),
    marca: txt(linha.marca),
    ano: num(linha.ano),
    capacidadeM3: num(linha.capacidade_m3),
    capacidadeKg: num(linha.capacidade_kg),
    status: linha.status,
    proximaManutencao: txt(linha.proxima_manutencao),
    observacoes: txt(linha.observacoes),
    anexos: (linha.veiculo_anexos ?? []).map(paraAnexo),
  };
}

export function paraMotorista(linha: any): Motorista {
  return {
    id: linha.id,
    nome: txt(linha.nome),
    cpf: txt(linha.cpf),
    telefone: txt(linha.telefone),
    cnh: txt(linha.cnh),
    categoriaCnh: linha.categoria_cnh,
    validadeCnh: txt(linha.validade_cnh),
    status: linha.status,
    veiculoId: linha.veiculo_id ?? null,
    admissao: txt(linha.admissao),
    observacoes: txt(linha.observacoes),
    anexos: (linha.motorista_anexos ?? []).map(paraAnexo),
  };
}

export function paraLancamento(linha: any): Lancamento {
  return {
    id: linha.id,
    tipo: linha.tipo,
    data: txt(linha.data),
    valor: num(linha.valor),
    categoria: txt(linha.categoria),
    descricao: txt(linha.descricao),
    veiculoId: linha.veiculo_id ?? null,
    motoristaId: linha.motorista_id ?? null,
    clienteId: linha.cliente_id ?? null,
  };
}

export function paraCompromisso(linha: any): Compromisso {
  return {
    id: linha.id,
    tipo: linha.tipo,
    titulo: txt(linha.titulo),
    data: txt(linha.data),
    // O Postgres devolve time como 'HH:MM:SS'; a interface usa 'HH:MM'.
    horario: txt(linha.horario).slice(0, 5),
    diaInteiro: Boolean(linha.dia_inteiro),
    clienteId: linha.cliente_id ?? null,
    veiculoId: linha.veiculo_id ?? null,
    motoristaId: linha.motorista_id ?? null,
    rotaId: linha.rota_id ?? null,
    enderecoColeta: txt(linha.endereco_coleta),
    enderecoEntrega: txt(linha.endereco_entrega),
    caracteristicas: Array.isArray(linha.caracteristicas) ? linha.caracteristicas : [],
    observacoes: txt(linha.observacoes),
  };
}

/**
 * Rota com mudanças e paradas.
 *
 * A relação parada↔mudança está normalizada no banco como
 * `parada_movimentos`, com um tipo por linha. Aqui ela volta ao formato
 * que o motor de ocupação espera: dois arrays por parada, coletam e
 * entregam. Ver lib/negocio/rotas.ts.
 */
export function paraRota(linha: any): Rota {
  const paradas = (linha.paradas ?? []).map((p: any) => {
    const movimentos = p.parada_movimentos ?? [];
    return {
      id: p.id,
      tipo: p.tipo,
      cidade: txt(p.cidade),
      uf: txt(p.uf),
      endereco: txt(p.endereco),
      data: txt(p.data),
      coletam: movimentos
        .filter((m: any) => m.tipo === 'coleta')
        .map((m: any) => m.mudanca_id),
      entregam: movimentos
        .filter((m: any) => m.tipo === 'entrega')
        .map((m: any) => m.mudanca_id),
      observacao: txt(p.observacao),
    };
  });

  return {
    id: linha.id,
    nome: txt(linha.nome),
    status: linha.status,
    veiculoId: linha.veiculo_id ?? null,
    motoristaId: linha.motorista_id ?? null,
    origem: txt(linha.origem),
    destino: txt(linha.destino),
    dataSaida: txt(linha.data_saida),
    dataPrevistaRetorno: txt(linha.data_prevista_retorno),
    mudancas: (linha.mudancas ?? []).map((m: any) => ({
      id: m.id,
      clienteNome: txt(m.cliente_nome),
      telefone: txt(m.telefone),
      documento: txt(m.documento),
      volumeM3: num(m.volume_m3),
      enderecoColeta: txt(m.endereco_coleta),
      enderecoEntrega: txt(m.endereco_entrega),
      observacao: txt(m.observacao),
    })),
    paradas: paradas.sort((a: any, b: any) => a.data.localeCompare(b.data)),
  };
}

/**
 * Orçamento vindo de `orcamentos_visao`.
 *
 * custo_base e margem_percentual chegam NULL para quem não tem a
 * capacidade ver_custos — é o corte por coluna aplicado pelo banco. Aqui
 * viram 0 para não quebrar os tipos, e a interface já esconde as colunas
 * para esse nível de qualquer forma.
 */
export function paraOrcamento(linha: any): Orcamento {
  return {
    id: linha.id,
    clienteId: linha.cliente_id ?? '',
    clienteNome: txt(linha.cliente_nome),
    status: linha.status,
    data: txt(linha.data),
    volumeM3: num(linha.volume_m3),
    distanciaKm: num(linha.distancia_km),
    custoBase: num(linha.custo_base),
    margemPercentual: num(linha.margem_percentual),
    adicionaisSelecionados: (linha.orcamento_adicionais ?? []).map((a: any) => a.adicional_id),
    valorFinal: num(linha.valor_final),
    observacoes: txt(linha.observacoes),
  };
}
