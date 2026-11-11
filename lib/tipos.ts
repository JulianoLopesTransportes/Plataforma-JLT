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

/**
 * Todos os status que um cliente pode ter. A ordem do array é a ordem do
 * seletor na tela, e espelha a ordem do enum `status_cliente` no Postgres:
 * os quatro degraus do funil primeiro, as duas saídas agrupadas no fim.
 *
 * "Fechada" é o ponto em que o serviço está contratado — é ela que
 * alimenta a agenda. "Finalizada" é o serviço já executado.
 */
export const STATUS_CLIENTE = [
  'Novo',
  'Em andamento',
  'Fechada',
  'Finalizada',
  'Sem resposta',
  'Perdida',
] as const;

export type StatusCliente = (typeof STATUS_CLIENTE)[number];

/**
 * O caminho LINEAR do funil — a ordem em que o botão "Avançar" caminha.
 *
 * Separado de STATUS_CLIENTE porque "Sem resposta" e "Perdida" são saídas,
 * não degraus: ninguém avança PARA elas, você as escolhe no seletor.
 *
 * Não é preciosismo. Até a migration 45, `proximoStatus()` andava por
 * ÍNDICE do array de status, e os dois novos valores no fim fariam um
 * cliente "Finalizada" exibir o botão "Avançar para Sem resposta" e deixar
 * de ser o fim do funil.
 */
export const FUNIL_CLIENTE = [
  'Novo',
  'Em andamento',
  'Fechada',
  'Finalizada',
] as const satisfies readonly StatusCliente[];

/** O status a partir do qual o cliente aparece na agenda. */
export const STATUS_QUE_AGENDA: StatusCliente = 'Fechada';

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
  /** Gaveta do anexo: contrato, orçamento, documento pessoal… */
  categoria: string;
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
  /**
   * Código curto para achar o cliente depois: 2026-0001.
   *
   * Gerado pelo banco no cadastro e imutável — é por ele que se procura
   * no telefone, então mudar depois quebraria a referência de quem anotou.
   * A numeração reinicia a cada ano; o par ano+número é que é único.
   */
  codigo: string;
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
  /**
   * Quem mantém o contato e conduz o processo com este cliente.
   *
   * Referência a `perfis`, preenchida pelo banco com quem cadastrou. Nula
   * nos clientes anteriores à migration 42 e quando o perfil do dono foi
   * apagado — nos dois casos qualquer um pode assumir.
   *
   * Guarda só o id. O nome sai da view `equipe`, que a tela carrega uma
   * vez: desnormalizar o nome aqui o deixaria velho no dia em que alguém
   * corrigisse a grafia do próprio cadastro, e um join em `perfis` volta
   * vazio porque o RLS de lá só deixa cada um ver a própria linha.
   */
  responsavelId: string | null;
  criadoEm: string;
  anexos: Anexo[];
  historico: EventoHistorico[];
};

/**
 * O que a tela edita num cliente — tudo menos o que ela não escreve.
 *
 * `id` e `criadoEm` são do banco; `codigo` sai de um gatilho e é imutável;
 * `anexos` e `historico` têm tabelas próprias.
 *
 * Existe para ser a FONTE de `COLUNA_CLIENTE` em lib/api: aquele mapa é um
 * Record sobre estas chaves, então acrescentar campo aqui sem mapear a
 * coluna lá não compila. Antes disso a conversão era lista branca escrita
 * à mão, e `origem`, `origemDetalhe` e `tipo` ficaram de fora dela desde o
 * primeiro commit da camada de dados: a tela dizia que salvava e o UPDATE
 * saía sem os campos.
 */
export type CamposCliente = Omit<
  Cliente,
  'id' | 'codigo' | 'criadoEm' | 'anexos' | 'historico'
>;

/**
 * Um integrante da equipe, como o seletor de responsável precisa dele.
 *
 * Vem da view `equipe`, que expõe só isto. E-mail e nível ficam no banco.
 */
export type MembroEquipe = {
  id: string;
  nome: string;
  cargo: string;
  ativo: boolean;
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

/** O que a tela edita num lançamento. Fonte de `COLUNA_LANCAMENTO`. */
export type CamposLancamento = Omit<Lancamento, 'id'>;

/** Onde a categoria pode ser usada. */
export const APLICA_A = ['gasto', 'ganho', 'ambos'] as const;
export type AplicaA = (typeof APLICA_A)[number];

/**
 * Categoria de lançamento — dado editável desde a migration 46.
 *
 * O `nome` é a chave no banco, e a FK em `lancamentos.categoria` é
 * `on update cascade`: renomear arrasta o histórico junto. Por isso não há
 * id separado — e por isso renomear não é operação inocente.
 */
export type CategoriaLancamento = {
  nome: string;
  aplicaA: AplicaA;
  /** Inativa sai do seletor, mas o histórico que a usa continua legível. */
  ativo: boolean;
  ordem: number;
};

/* ==========================================================================
   Agenda
   ========================================================================== */

/**
 * Coleta e entrega de uma mesma mudança quase sempre caem em dias
 * diferentes, então são dois compromissos. O antigo 'cliente' — rotulado
 * "Mudança" — não conseguia dizer qual dos dois era.
 */
export type TipoCompromisso =
  | 'coleta_mudanca'
  | 'entrega_mudanca'
  | 'visita'
  | 'rota'
  | 'equipe'
  | 'pessoal'
  | 'outro';

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
  /**
   * Nasceu do cliente entrar em "Fechada".
   *
   * É o único compromisso que a data prevista do cliente move, e o único
   * que move a data prevista de volta. Os criados à mão na agenda não
   * mexem em cliente nenhum.
   */
  automatico: boolean;
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

/**
 * Uma coleta ou uma entrega acontecendo numa cidade.
 *
 * Carrega o próprio endereço porque numa mesma cidade se coleta de dois
 * clientes em ruas diferentes — caso comum em rota compartilhada. Vazio
 * cai no endereço da parada, que é como as rotas antigas foram gravadas.
 */
export type Movimento = {
  mudancaId: string;
  endereco: string;
};

export type Parada = {
  id: string;
  tipo: TipoParada;
  cidade: string;
  uf: string;
  endereco: string;
  /** ISO 8601 (data). */
  data: string;
  /**
   * Posição na sequência da rota, a partir de 0.
   *
   * Existe porque duas cidades podem cair na mesma data, e aí a data
   * sozinha não decide qual vem antes. É a ordem em que o usuário montou.
   */
  ordem: number;
  /** Mudanças COLETADAS nesta parada — entram no caminhão. */
  coletam: Movimento[];
  /** Mudanças ENTREGUES nesta parada — saem do caminhão. */
  entregam: Movimento[];
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

export type AdicionalAplicado = {
  id: string;
  nome: string;
  quantidade: number;
};

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
  /**
   * Adicionais aplicados, com o nome como estava NA ÉPOCA.
   *
   * O nome vem gravado junto, não resolvido na leitura, por dois motivos:
   * a tabela `adicionais` só é legível por quem tem `ver_custos`, e o
   * Comercial veria uma lista sem nomes; e renomear um adicional depois
   * não pode reescrever o que foi orçado.
   */
  adicionais: AdicionalAplicado[];
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

/* ==========================================================================
   Campos editáveis — a fonte dos mapas em lib/api/campos.ts
   ==========================================================================

   Cada um destes tipos existe para virar `Record<keyof …, Regra>` naquele
   arquivo. É o que faz o compilador cobrar uma coluna para cada campo novo,
   em vez de deixar o UPDATE sair sem ele — que foi o que aconteceu com
   `origem`, `origemDetalhe` e `tipo` do cliente desde o primeiro commit da
   camada de dados até 09/11/2026. */

export type CamposVeiculo = Omit<Veiculo, 'id' | 'anexos'>;
export type CamposMotorista = Omit<Motorista, 'id' | 'anexos'>;
export type CamposCompromisso = Omit<Compromisso, 'id'>;
