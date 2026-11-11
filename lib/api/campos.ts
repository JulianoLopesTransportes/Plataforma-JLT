/**
 * Conversão dos campos da tela para as colunas do banco.
 *
 * UM arquivo para as cinco entidades, e não cinco: o laço é idêntico em
 * todas, e espalhá-lo era convite para as versões divergirem.
 *
 * ========================================================================
 * POR QUE ISTO EXISTE
 * ========================================================================
 *
 * A conversão era uma sequência de `if (mudancas.x !== undefined)` escrita
 * à mão, uma por entidade. O compilador não tinha como conferir se a lista
 * estava completa, e em `clientes` ela não estava: `origem`, `origemDetalhe`
 * e `tipo` ficaram de fora desde o primeiro commit da camada de dados.
 *
 * O efeito era pior que um erro. A tela mandava o campo, o gateway o
 * descartava calado, o Postgres não tem o que reclamar de um UPDATE que não
 * menciona a coluna — e a tela mostrava "salvo". O Juliano trocava a origem
 * de um cliente e ela voltava ao valor antigo, por meses, até ele reportar.
 *
 * Cada mapa abaixo é um `Record<keyof CamposX, Regra>`: o TypeScript EXIGE
 * uma entrada por campo editável. Acrescentar campo no tipo sem mapear a
 * coluna aqui não compila. É a trava que não existia.
 */

import type {
  Cliente,
  CamposCliente,
  Lancamento,
  CamposLancamento,
  Veiculo,
  CamposVeiculo,
  Motorista,
  CamposMotorista,
  Compromisso,
  CamposCompromisso,
} from '../tipos';

/**
 * Como um campo vira coluna.
 *
 * `ao` recebe `unknown` de propósito: as transformações são minúsculas
 * (maiúscula, vazio→null) e tipá-las por campo pediria um tipo mapeado que
 * ninguém consegue ler depois. O ganho de tipo que importa é a completude
 * do mapa, e essa está garantida pelo Record.
 */
type Regra = {
  coluna: string;
  ao?: (valor: unknown) => unknown;
};

/** Vazio vira NULL. Para date e uuid: '' não é nenhum dos dois. */
const nuloSeVazio = (valor: unknown) => valor || null;

function converter<C>(mapa: Record<keyof C, Regra>, mudancas: Partial<C>): Record<string, unknown> {
  const linha: Record<string, unknown> = {};

  for (const chave of Object.keys(mapa) as (keyof C)[]) {
    const valor = mudancas[chave];
    // Campo ausente fica FORA do UPDATE — é o que permite salvar só o
    // telefone sem reescrever o resto do cadastro.
    if (valor === undefined) continue;
    const regra = mapa[chave];
    linha[regra.coluna] = regra.ao ? regra.ao(valor) : valor;
  }

  return linha;
}

/* ==========================================================================
   Cliente
   ========================================================================== */

const CLIENTE: Record<keyof CamposCliente, Regra> = {
  tipo: { coluna: 'tipo' },
  nome: { coluna: 'nome' },
  documento: { coluna: 'documento' },
  telefone: { coluna: 'telefone' },
  email: { coluna: 'email' },
  status: { coluna: 'status' },
  origem: { coluna: 'origem' },
  origemDetalhe: { coluna: 'origem_detalhe' },
  enderecoColeta: { coluna: 'endereco_coleta' },
  enderecoEntrega: { coluna: 'endereco_entrega' },
  volumeM3: { coluna: 'volume_m3' },
  // date: '' não é data e o Postgres recusaria.
  dataPrevista: { coluna: 'data_prevista', ao: nuloSeVazio },
  observacoes: { coluna: 'observacoes' },
  itens: { coluna: 'itens' },
  responsavelId: { coluna: 'responsavel_id' },
};

export function camposDeCliente(mudancas: Partial<Cliente>): Record<string, unknown> {
  return converter<CamposCliente>(CLIENTE, mudancas);
}

/* ==========================================================================
   Lançamento
   ========================================================================== */

const LANCAMENTO: Record<keyof CamposLancamento, Regra> = {
  tipo: { coluna: 'tipo' },
  // `data` NÃO leva nuloSeVazio: a coluna é NOT NULL, e um erro honesto é
  // melhor que gravar meia verdade.
  data: { coluna: 'data' },
  valor: { coluna: 'valor' },
  categoria: { coluna: 'categoria' },
  descricao: { coluna: 'descricao' },
  veiculoId: { coluna: 'veiculo_id', ao: nuloSeVazio },
  motoristaId: { coluna: 'motorista_id', ao: nuloSeVazio },
  clienteId: { coluna: 'cliente_id', ao: nuloSeVazio },
};

export function camposDeLancamento(mudancas: Partial<Lancamento>): Record<string, unknown> {
  return converter<CamposLancamento>(LANCAMENTO, mudancas);
}

/* ==========================================================================
   Veículo
   ========================================================================== */

const VEICULO: Record<keyof CamposVeiculo, Regra> = {
  // Placa sempre em maiúscula: é chave de busca, e "abc1d23" digitado no
  // celular não acharia o veículo depois.
  placa: { coluna: 'placa', ao: (v) => String(v).toUpperCase() },
  modelo: { coluna: 'modelo' },
  marca: { coluna: 'marca' },
  ano: { coluna: 'ano', ao: nuloSeVazio },
  capacidadeM3: { coluna: 'capacidade_m3' },
  capacidadeKg: { coluna: 'capacidade_kg' },
  status: { coluna: 'status' },
  proximaManutencao: { coluna: 'proxima_manutencao', ao: nuloSeVazio },
  observacoes: { coluna: 'observacoes' },
};

export function camposDeVeiculo(mudancas: Partial<Veiculo>): Record<string, unknown> {
  return converter<CamposVeiculo>(VEICULO, mudancas);
}

/* ==========================================================================
   Motorista
   ========================================================================== */

const MOTORISTA: Record<keyof CamposMotorista, Regra> = {
  nome: { coluna: 'nome' },
  cpf: { coluna: 'cpf' },
  telefone: { coluna: 'telefone' },
  cnh: { coluna: 'cnh' },
  categoriaCnh: { coluna: 'categoria_cnh', ao: nuloSeVazio },
  validadeCnh: { coluna: 'validade_cnh', ao: nuloSeVazio },
  status: { coluna: 'status' },
  veiculoId: { coluna: 'veiculo_id', ao: nuloSeVazio },
  admissao: { coluna: 'admissao', ao: nuloSeVazio },
  observacoes: { coluna: 'observacoes' },
};

export function camposDeMotorista(mudancas: Partial<Motorista>): Record<string, unknown> {
  return converter<CamposMotorista>(MOTORISTA, mudancas);
}

/* ==========================================================================
   Compromisso
   ========================================================================== */

const COMPROMISSO: Record<keyof CamposCompromisso, Regra> = {
  automatico: { coluna: 'automatico' },
  tipo: { coluna: 'tipo' },
  titulo: { coluna: 'titulo' },
  data: { coluna: 'data' },
  diaInteiro: { coluna: 'dia_inteiro' },
  // Tratado à parte em camposDeCompromisso: depende de diaInteiro.
  horario: { coluna: 'horario' },
  clienteId: { coluna: 'cliente_id', ao: nuloSeVazio },
  veiculoId: { coluna: 'veiculo_id', ao: nuloSeVazio },
  motoristaId: { coluna: 'motorista_id', ao: nuloSeVazio },
  rotaId: { coluna: 'rota_id', ao: nuloSeVazio },
  enderecoColeta: { coluna: 'endereco_coleta' },
  enderecoEntrega: { coluna: 'endereco_entrega' },
  caracteristicas: { coluna: 'caracteristicas' },
  observacoes: { coluna: 'observacoes' },
};

/**
 * Compromisso tem uma regra que não é campo a campo.
 *
 * A constraint `horario_coerente` no banco exige horário quando não é dia
 * inteiro, e exige horário NULO quando é. Então mexer em `diaInteiro`
 * obriga a reescrever `horario` mesmo que a tela não o tenha tocado — e é
 * por isso que esta função não é só um `converter()`.
 */
export function camposDeCompromisso(mudancas: Partial<Compromisso>): Record<string, unknown> {
  const linha = converter<CamposCompromisso>(COMPROMISSO, mudancas);

  if (mudancas.horario !== undefined || mudancas.diaInteiro !== undefined) {
    linha.horario = mudancas.diaInteiro ? null : mudancas.horario || null;
  }

  return linha;
}
