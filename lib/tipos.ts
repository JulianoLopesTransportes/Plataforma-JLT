/**
 * TIPOS DE DOMÍNIO — schema unificado das entidades da JLT.
 *
 * Os módulos originais declaravam a mesma entidade de três formas diferentes
 * (o cliente "Maria da Silva" tinha campos distintos em documentos, agenda e
 * financeiro). Aqui existe uma definição só; todos os módulos consomem esta.
 *
 * Quando o Supabase entrar, estes tipos passam a ser gerados a partir do
 * schema do Postgres (`supabase gen types typescript`) e este arquivo vira
 * um re-export. Os nomes de campo já foram escolhidos pensando nisso.
 */

/* ==========================================================================
   Cliente
   ========================================================================== */

export type TipoPessoa = 'PF' | 'PJ';

/** Funil comercial do cliente. A ordem do array é a ordem do funil. */
export const STATUS_CLIENTE = ['Novo', 'Em andamento', 'Concluído'] as const;
export type StatusCliente = (typeof STATUS_CLIENTE)[number];

/** Como o cliente chegou até a empresa. */
export const ORIGENS_CLIENTE = [
  'MudaMuda',
  'WhatsApp',
  'Instagram',
  'Facebook',
  'Indicação',
  'Repasse',
] as const;
export type OrigemCliente = (typeof ORIGENS_CLIENTE)[number];

/** Porte da mudança, derivado do volume em m³. Ver classificarVolume(). */
export type ClasseVolume = 'Pequeno' | 'Médio' | 'Grande';

export type Anexo = {
  id: string;
  nome: string;
  /** Caminho no Supabase Storage. Vazio nos mocks da Fase A. */
  caminho?: string;
  tipo: string;
  tamanho: number;
  /** ISO 8601. Quando o Supabase entrar, vira o created_at do storage. */
  enviadoEm: string;
};

export type EventoHistorico = {
  id: string;
  /** ISO 8601 */
  em: string;
  autor: string;
  descricao: string;
};

export type Cliente = {
  id: string;
  tipo: TipoPessoa;
  nome: string;
  /** CPF ou CNPJ, já mascarado para exibição. */
  documento: string;
  telefone: string;
  email: string;
  status: StatusCliente;
  origem: OrigemCliente;
  /** Detalhe livre da origem — ex.: nome de quem indicou. */
  origemDetalhe?: string;
  enderecoColeta: string;
  enderecoEntrega: string;
  /** Volume estimado da mudança, em m³. */
  volumeM3: number | null;
  /** ISO 8601 (só a data, sem hora). Vazio quando ainda não há data definida. */
  dataPrevista: string;
  observacoes: string;
  /**
   * Relação de itens da mudança, um por linha. Escrita à mão ou importada
   * de um .txt. É o que a Ordem de Serviço imprime — diferente do
   * inventário do módulo Documentos, que tem valor declarado e ambiente.
   */
  itens: string;
  criadoEm: string;
  anexos: Anexo[];
  historico: EventoHistorico[];
};

/* ==========================================================================
   Frota — veículos e motoristas
   ========================================================================== */

export type StatusVeiculo = 'Disponível' | 'Em rota' | 'Manutenção' | 'Inativo';

export type Veiculo = {
  id: string;
  /** Placa no padrão Mercosul (ABC1D23). */
  placa: string;
  modelo: string;
  marca: string;
  ano: number;
  /** Capacidade de carga em m³ — usada no cálculo de ocupação das rotas. */
  capacidadeM3: number;
  /** Capacidade em quilos. */
  capacidadeKg: number;
  status: StatusVeiculo;
  /** ISO 8601 (data). */
  proximaManutencao: string;
  observacoes: string;
  anexos: Anexo[];
};

export type StatusMotorista = 'Ativo' | 'Em rota' | 'Férias' | 'Inativo';

export type CategoriaCnh = 'B' | 'C' | 'D' | 'E';

export type Motorista = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  cnh: string;
  categoriaCnh: CategoriaCnh;
  /** ISO 8601 (data). Vence: destacado quando próximo do vencimento. */
  validadeCnh: string;
  status: StatusMotorista;
  /** Veículo ao qual o motorista está vinculado, se houver. */
  veiculoId: string | null;
  admissao: string;
  observacoes: string;
  anexos: Anexo[];
};

/* ==========================================================================
   Financeiro
   ========================================================================== */

export type TipoLancamento = 'gasto' | 'ganho';

export type Lancamento = {
  id: string;
  tipo: TipoLancamento;
  /** ISO 8601 (data). */
  data: string;
  /** Valor absoluto em BRL. O sinal vem do campo `tipo`, nunca do valor. */
  valor: number;
  categoria: string;
  descricao: string;
  /** Vínculos opcionais — permitem custo por veículo, por rota, por cliente. */
  veiculoId: string | null;
  motoristaId: string | null;
  clienteId: string | null;
};

/* ==========================================================================
   Agenda
   ========================================================================== */

export type TipoCompromisso = 'cliente' | 'visita' | 'rota' | 'equipe' | 'pessoal' | 'outro';

export type Compromisso = {
  id: string;
  tipo: TipoCompromisso;
  titulo: string;
  /** ISO 8601 (data). */
  data: string;
  /** HH:MM. Vazio quando diaInteiro é true. */
  horario: string;
  diaInteiro: boolean;
  clienteId: string | null;
  veiculoId: string | null;
  motoristaId: string | null;
  rotaId: string | null;
  enderecoColeta: string;
  enderecoEntrega: string;
  /** Serviços contratados: embalagem, desmontagem, içamento... */
  caracteristicas: string[];
  observacoes: string;
};

/* ==========================================================================
   Rotas
   ========================================================================== */

export type StatusRota = 'planejada' | 'carregando' | 'em_transito' | 'concluida';

/**
 * Uma "mudança" é a carga de um cliente dentro de uma rota: entra numa parada
 * de coleta e sai numa parada de entrega. É a unidade que ocupa espaço no
 * caminhão.
 */
export type Mudanca = {
  id: string;
  clienteNome: string;
  telefone: string;
  documento: string;
  volumeM3: number;
  enderecoColeta: string;
  enderecoEntrega: string;
  observacao: string;
};

export type TipoParada = 'coleta' | 'entrega' | 'mista';

export type Parada = {
  id: string;
  tipo: TipoParada;
  cidade: string;
  uf: string;
  endereco: string;
  /** ISO 8601 (data). */
  data: string;
  /** Ids de mudanças COLETADAS nesta parada — entram no caminhão. */
  coletam: string[];
  /** Ids de mudanças ENTREGUES nesta parada — saem do caminhão. */
  entregam: string[];
  observacao: string;
};

export type Rota = {
  id: string;
  nome: string;
  status: StatusRota;
  veiculoId: string | null;
  motoristaId: string | null;
  origem: string;
  destino: string;
  /** ISO 8601 (data). */
  dataSaida: string;
  dataPrevistaRetorno: string;
  mudancas: Mudanca[];
  paradas: Parada[];
};

/* ==========================================================================
   Orçamentos / precificação
   ========================================================================== */

/** Faixa de volume com preço base. Parâmetro de precificação. */
export type FaixaVolume = {
  id: string;
  /** m³ */
  ate: number;
  /** BRL — custo base da faixa. */
  valorBase: number;
};

export type TipoAdicional = 'fixo' | 'percentual' | 'por_unidade';

export type Adicional = {
  id: string;
  nome: string;
  tipo: TipoAdicional;
  /**
   * fixo        → valor em BRL, cobrado uma vez
   * percentual  → pontos percentuais sobre o preço base da faixa
   * por_unidade → valor em BRL por unidade, multiplicado pela quantidade
   */
  valor: number;
  /** Nome da unidade quando tipo='por_unidade': caixa, diária, ajudante, km. */
  unidade?: string;
};

export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado';

export type Orcamento = {
  id: string;
  clienteId: string;
  clienteNome: string;
  status: StatusOrcamento;
  /** ISO 8601 (data). */
  data: string;
  volumeM3: number;
  distanciaKm: number;
  /** Custo interno apurado. Comercial NUNCA vê este campo. */
  custoBase: number;
  /** Margem aplicada, em %. Comercial NUNCA vê este campo. */
  margemPercentual: number;
  adicionaisSelecionados: string[];
  /** Preço final apresentado ao cliente. Comercial vê apenas este. */
  valorFinal: number;
  observacoes: string;
};

/* ==========================================================================
   Utilitários de consulta
   ========================================================================== */

/** Filtros aceitos pelas funções de listagem da camada de API. */
export type Filtros = {
  busca?: string;
  status?: string;
  /** ISO 8601 (data) — início do período. */
  de?: string;
  /** ISO 8601 (data) — fim do período. */
  ate?: string;
  clienteId?: string;
  veiculoId?: string;
  motoristaId?: string;
};
