/**
 * DOCUMENTOS — modelos completos, portados de referencia/02-documentos_10.html
 *
 * O texto jurídico aqui é o MESMO do módulo original, palavra por palavra.
 * São cláusulas que a empresa usa em contrato assinado, não texto de
 * exemplo: alterar qualquer frase muda documento com efeito legal.
 *
 * Estrutura: cada gerador devolve uma lista de blocos, e a tela apenas
 * renderiza os blocos. Os trechos em negrito são representados como
 * `{ b: 'texto' }` em vez de HTML, para que dado vindo do cliente (nome,
 * documento, endereço) nunca seja interpretado como marcação.
 */

import { formatarBRL, dataPorExtenso } from '../utils/formato';

/* ==========================================================================
   Dados da empresa — extraídos do documento original
   ========================================================================== */

export const EMPRESA = {
  razaoSocial: 'JULIANO LOPES TRANSPORTES LTDA',
  nomeFantasia: 'Juliano Lopes Transportes',
  cnpj: '58.450.843/0001-70',
  logradouro: 'Rua Levino Rodrigues Martins, nº 37',
  bairro: 'Serra Verde',
  cidade: 'Belo Horizonte',
  uf: 'MG',
  cep: '31.630-510',
  email: 'contato@julianoltransportes.com.br',
  telefone: '(31) 97339-0837',
  telefoneSecundario: '(31) 99441-3919',
  site: 'julianoltransportes.com.br',
};

/**
 * Endereço do DEPÓSITO de guarda-móveis. É diferente da sede: a cláusula 2.1
 * do contrato de guarda aponta para cá, não para a Rua Levino Rodrigues.
 */
export const ENDERECO_DEPOSITO =
  'Rua José Carcheno (ao lado do nº 146), Bairro Jaqueline, Belo Horizonte/MG';

/** Endereço completo da sede, como aparece na qualificação das partes. */
export const ENDERECO_SEDE = `${EMPRESA.logradouro}, Bairro ${EMPRESA.bairro}, ${EMPRESA.cidade}/${EMPRESA.uf}, CEP ${EMPRESA.cep}`;

/** Praça usada no fecho dos documentos. */
export const PRACA = 'Belo Horizonte';

/* ==========================================================================
   Tipos
   ========================================================================== */

export type TipoDocumento =
  | 'orcamento'
  | 'contrato'
  | 'inventario'
  | 'guarda'
  | 'imagem'
  | 'comprovante'
  | 'ficha';

export const TIPOS_DOCUMENTO: { id: TipoDocumento; rotulo: string; descricao: string }[] = [
  {
    id: 'orcamento',
    rotulo: 'Orçamento',
    descricao: 'Proposta comercial com serviços inclusos, parcelamento e validade.',
  },
  {
    id: 'contrato',
    rotulo: 'Contrato de mudança',
    descricao: 'Contrato de prestação de serviço de transporte — 13 cláusulas.',
  },
  {
    id: 'inventario',
    rotulo: 'Inventário',
    descricao: 'Relação dos bens transportados, por ambiente, com valor declarado.',
  },
  {
    id: 'guarda',
    rotulo: 'Guarda-móveis',
    descricao: 'Contrato de depósito e guarda de bens — 13 cláusulas + Anexo I.',
  },
  {
    id: 'imagem',
    rotulo: 'Autorização de imagem',
    descricao: 'Autorização para uso de imagem em divulgação.',
  },
  {
    id: 'comprovante',
    rotulo: 'Comprovante de entrega',
    descricao: 'Recibo de conclusão do serviço, assinado no destino.',
  },
];

/** Nome de arquivo sugerido ao imprimir ou salvar em PDF. */
export const NOME_ARQUIVO: Record<TipoDocumento, string> = {
  orcamento: 'Orcamento',
  contrato: 'Contrato',
  inventario: 'Inventario',
  guarda: 'ContratoGuardaMoveis',
  imagem: 'AutorizacaoImagem',
  comprovante: 'ComprovanteEntrega',
  ficha: 'FichaAtendimento',
};

/** Trecho de texto: string simples ou trecho em negrito. */
export type Trecho = string | { b: string } | { i: string };

export type BlocoDocumento =
  | { tipo: 'secao'; titulo: string }
  | { tipo: 'paragrafo'; partes: Trecho[] }
  | { tipo: 'lista'; itens: string[] }
  | { tipo: 'nota'; texto: string }
  | { tipo: 'tabelaItens' }
  | { tipo: 'quebraPagina' }
  | { tipo: 'linhasEmBranco'; quantidade: number }
  | { tipo: 'assinaturas'; rotuloContratante: string };

/** Dados do cliente usados na qualificação das partes. */
export type DadosCliente = {
  nome: string;
  tipoPessoa: 'PF' | 'PJ';
  documento: string;
  telefone: string;
  email: string;
  enderecoColeta: string;
  enderecoEntrega: string;
};

/**
 * Linha em branco preenchível quando o dado não existe.
 * O original imprimia sublinhados para o campo ser completado à mão.
 */
const LINHA = '____________________';
const LINHA_DATA = '____/____/______';

function ou(valor: string | undefined | null, alternativa = LINHA): string {
  return valor && valor.trim() ? valor : alternativa;
}

function valorOuLinha(valor: number | null): string {
  return valor === null || Number.isNaN(valor) ? LINHA : formatarBRL(valor);
}

function dataOuLinha(iso: string): string {
  if (!iso) return LINHA_DATA;
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/* ==========================================================================
   Parcelamento — 10% (mínimo R$ 500) / 50% do saldo / saldo final
   ========================================================================== */

export type Parcelas = {
  sinal: number | null;
  primeira: number | null;
  segunda: number | null;
};

export function calcularParcelas(valorTotal: number | null): Parcelas {
  if (valorTotal === null || Number.isNaN(valorTotal) || valorTotal <= 0) {
    return { sinal: null, primeira: null, segunda: null };
  }
  const sinal = Math.max(valorTotal * 0.1, 500);
  const saldo = valorTotal - sinal;
  const primeira = saldo * 0.5;
  return { sinal, primeira, segunda: saldo - primeira };
}

/* ==========================================================================
   Blocos compartilhados
   ========================================================================== */

/** Cláusula 1 — qualificação das partes. Igual em contrato e guarda-móveis. */
function blocoPartes(c: DadosCliente, variante: 'contrato' | 'guarda'): BlocoDocumento[] {
  const pessoa = c.tipoPessoa === 'PF' ? 'pessoa física' : 'pessoa jurídica';

  return [
    { tipo: 'secao', titulo: 'Cláusula 1 – Identificação das Partes' },
    {
      tipo: 'paragrafo',
      partes: [
        'De um lado, ',
        { b: EMPRESA.razaoSocial },
        `, pessoa jurídica de direito privado, inscrita no CNPJ nº ${EMPRESA.cnpj}, com sede na ${ENDERECO_SEDE}, e-mail ${EMPRESA.email}, doravante denominada `,
        { b: 'CONTRATADA' },
        '.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes:
        variante === 'guarda'
          ? [
              'De outro lado, ',
              { b: ou(c.nome, '[cliente]') },
              `, inscrito(a) no CPF/CNPJ nº ${ou(c.documento)}, residente em ${ou(c.enderecoColeta)}, doravante denominado(a) `,
              { b: 'CONTRATANTE' },
              '.',
            ]
          : [
              'E, de outro lado, ',
              { b: ou(c.nome, '[cliente]') },
              `, ${pessoa}, inscrito(a) no CPF/CNPJ nº ${ou(c.documento)}, residente e domiciliado(a) em ${ou(c.enderecoColeta)}, doravante denominado(a) `,
              { b: 'CONTRATANTE' },
              '.',
            ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        variante === 'guarda'
          ? 'As partes celebram o presente contrato, regido pelas cláusulas abaixo.'
          : 'As partes acima identificadas celebram o presente contrato, que será regido pelas cláusulas e condições a seguir.',
      ],
    },
  ];
}

/** Cláusula de seguro. O texto muda entre mudança e guarda-móveis. */
function blocoSeguro(variante: 'contrato' | 'guarda', seguroIncluso: boolean): BlocoDocumento[] {
  const marca = (v: boolean) => (seguroIncluso === v ? '☑' : '☐');
  const escolha = `${marca(true)} INCLUSO     /     ${marca(false)} NÃO INCLUSO`;

  if (variante === 'guarda') {
    return [
      { tipo: 'secao', titulo: 'Cláusula 8 – Seguro' },
      { tipo: 'paragrafo', partes: [{ b: '8.1.' }, ` O seguro dos bens: ${escolha}`] },
      {
        tipo: 'paragrafo',
        partes: [{ b: '8.2.' }, ' Quando incluso, considera-se cobertura até o limite contratado.'],
      },
      {
        tipo: 'paragrafo',
        partes: [
          { b: '8.3.' },
          ' Havendo renúncia ao seguro, o CONTRATANTE declara ciência dos riscos.',
        ],
      },
    ];
  }

  return [
    { tipo: 'secao', titulo: 'Cláusula 8 – Seguro' },
    { tipo: 'paragrafo', partes: [{ b: '8.1.' }, ` O seguro de carga: ${escolha}`] },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '8.2.' },
        ' Caso o CONTRATANTE opte pela não contratação do seguro, deverá formalizar sua decisão antes do início do serviço.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '8.3.' },
        ' Nessa hipótese, assume integral responsabilidade pelos riscos não cobertos.',
      ],
    },
  ];
}

/** Cláusula de caso fortuito e força maior. O número varia por documento. */
function blocoForcaMaior(numero: number, variante: 'contrato' | 'guarda'): BlocoDocumento[] {
  return [
    { tipo: 'secao', titulo: `Cláusula ${numero} – Caso Fortuito e Força Maior` },
    {
      tipo: 'paragrafo',
      partes: [
        { b: `${numero}.1.` },
        variante === 'guarda'
          ? ' Nenhuma das partes responderá por eventos imprevisíveis ou inevitáveis que impeçam a execução do contrato.'
          : ' Nenhuma das partes responderá por atrasos decorrentes de caso fortuito ou força maior.',
      ],
    },
  ];
}

/** Local e data do fecho. */
function blocoLocalData(iso: string): BlocoDocumento {
  return {
    tipo: 'paragrafo',
    partes: [`${PRACA}, ${iso ? dataPorExtenso(iso) : dataPorExtenso(hojeInterno())}.`],
  };
}

function hojeInterno(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ==========================================================================
   Serviços do orçamento
   ========================================================================== */

export const SERVICOS_INCLUSOS = [
  'Logística terrestre completa',
  'Embalagem e proteção dos bens transportados',
  'Cobertura de seguro para a carga',
  'Mão de obra de carregamento e descarregamento',
  'Condução por motorista credenciado e responsável',
];

/* ==========================================================================
   1. ORÇAMENTO
   ========================================================================== */

export type EntradaOrcamento = {
  cliente: DadosCliente;
  validadeDias: number;
  valorTotal: number | null;
  dataColeta: string;
  servicosMarcados: string[];
  outrosServicos: string[];
};

export function gerarOrcamento(e: EntradaOrcamento): BlocoDocumento[] {
  const { sinal, primeira, segunda } = calcularParcelas(e.valorTotal);

  return [
    {
      tipo: 'paragrafo',
      partes: ['Prezado(a) ', { b: ou(e.cliente.nome, '[cliente]') }, ','],
    },
    {
      tipo: 'paragrafo',
      partes: [
        'Em atenção à solicitação encaminhada, a ',
        { b: EMPRESA.nomeFantasia },
        ' apresenta abaixo a proposta comercial referente ao serviço de transporte e mudança, estruturada para atender às suas necessidades com segurança, transparência e pontualidade.',
      ],
    },

    { tipo: 'secao', titulo: 'Informações gerais' },
    { tipo: 'paragrafo', partes: [{ b: 'Contato:' }, ` ${ou(e.cliente.telefone)}`] },
    {
      tipo: 'paragrafo',
      partes: [{ b: 'Endereço de coleta:' }, ` ${ou(e.cliente.enderecoColeta)}`],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: 'Endereço de entrega:' }, ` ${ou(e.cliente.enderecoEntrega)}`],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: 'Data prevista para coleta:' }, ` ${dataOuLinha(e.dataColeta)}`],
    },

    { tipo: 'secao', titulo: 'Serviços inclusos' },
    { tipo: 'lista', itens: [...e.servicosMarcados, ...e.outrosServicos] },

    { tipo: 'secao', titulo: 'Condições financeiras' },
    {
      tipo: 'paragrafo',
      partes: [{ b: 'Valor total do serviço:' }, ` ${valorOuLinha(e.valorTotal)}`],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Sinal' },
        ' ',
        { i: '(10%, mínimo R$ 500,00)' },
        `: ${valorOuLinha(sinal)} — no ato da assinatura do contrato`,
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '1ª parcela' },
        ' ',
        { i: '(50% do saldo)' },
        `: ${valorOuLinha(primeira)} — no momento do carregamento`,
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '2ª parcela' },
        ' ',
        { i: '(saldo final)' },
        `: ${valorOuLinha(segunda)} — antes do início do descarregamento no destino`,
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Pagamentos por cartão de crédito devem ser realizados no momento da coleta, podendo ser parcelados conforme condições da operadora, com acréscimos por conta do Contratante. Valores poderão ser ajustados em caso de alterações significativas na rota, volume ou prazo.',
    },

    { tipo: 'secao', titulo: 'Validade e condições gerais' },
    {
      tipo: 'paragrafo',
      partes: [
        `Validade do orçamento: ${e.validadeDias} dias a partir da data de envio. O serviço será executado mediante contrato formal e emissão de recibos de pagamento. Qualquer modificação nos dados de origem, destino ou datas deverá ser comunicada com antecedência mínima de 48 horas.`,
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        'A ',
        { b: EMPRESA.nomeFantasia },
        ' atua com foco em confiabilidade, agilidade e cuidado com cada item transportado, assegurando o cumprimento integral dos prazos e condições acordadas.',
      ],
    },
    { tipo: 'paragrafo', partes: ['Atenciosamente,'] },
    { tipo: 'paragrafo', partes: [{ b: EMPRESA.nomeFantasia }] },
  ];
}

/* ==========================================================================
   2. CONTRATO DE MUDANÇA — 13 cláusulas
   ========================================================================== */

export type EntradaContrato = {
  cliente: DadosCliente;
  valorTotal: number | null;
  seguroIncluso: boolean;
  dataExecucao: string;
  dataContrato: string;
  clausulasAdicionais: string[];
};

export function gerarContrato(e: EntradaContrato): BlocoDocumento[] {
  const c = e.cliente;
  const { sinal, primeira } = calcularParcelas(e.valorTotal);

  const blocos: BlocoDocumento[] = [
    ...blocoPartes(c, 'contrato'),

    { tipo: 'secao', titulo: 'Cláusula 2 – Objeto do Contrato' },
    {
      tipo: 'paragrafo',
      partes: [
        'O presente contrato tem por objeto a prestação de serviços de transporte terrestre de bens móveis pertencentes ao CONTRATANTE, incluindo, quando contratado, os serviços de embalagem, carga, transporte e descarga, do endereço de origem ao endereço de destino informados pelo CONTRATANTE.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 3 – Obrigações da Contratada' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '3.1.' },
        ` Realizar a coleta dos bens no endereço de origem: ${ou(c.enderecoColeta)}, efetuando a entrega no endereço de destino: ${ou(c.enderecoEntrega)}, na data prevista: ${dataOuLinha(e.dataExecucao)}.`,
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '3.2.' },
        ' Utilizar veículos, equipamentos e mão de obra compatíveis com a execução do serviço contratado.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '3.3.' },
        ' Quando contratado, realizar a embalagem dos bens com materiais adequados.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '3.4.' },
        ' Zelar pela integridade dos bens durante todo o período em que estiverem sob sua responsabilidade, observadas as limitações previstas neste contrato.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '3.5.' },
        ' A responsabilidade da CONTRATADA inicia-se no recebimento dos bens e encerra-se com a entrega ao destinatário no endereço informado.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 4 – Obrigações do Contratante' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '4.1.' },
        ' Informar corretamente os endereços de origem e destino, garantindo livre acesso ao veículo.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '4.2.' },
        ' Providenciar autorizações, reservas de vagas, liberações em condomínios, utilização de elevadores e demais exigências locais.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '4.3.' },
        ' Conferir todos os bens no ato da entrega, registrando imediatamente qualquer avaria ou divergência antes da assinatura do comprovante.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '4.4.' },
        ' Separar previamente documentos, dinheiro, joias, armas, cartões, eletrônicos portáteis e demais objetos de alto valor.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '4.5.' },
        ' Efetuar os pagamentos nos valores e prazos estabelecidos neste contrato.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 5 – Prazos e Condições de Execução' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '5.1.' },
        ' As datas de coleta e entrega possuem caráter estimado, podendo sofrer alterações por motivos operacionais, climáticos, de trânsito ou força maior.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 6 – Valores, Forma de Pagamento e Reajustes' },
    {
      tipo: 'paragrafo',
      partes: [{ b: '6.1.' }, ` Valor total do serviço: ${valorOuLinha(e.valorTotal)}.`],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '6.2.' },
        ' O pagamento será realizado da seguinte forma:',
        `\na) Sinal: ${valorOuLinha(sinal)} (10%, mínimo de R$ 500,00) na assinatura do contrato;`,
        `\nb) Carregamento: ${valorOuLinha(primeira)} (50% do saldo restante) no início da coleta;`,
        '\nc) Saldo final: antes do descarregamento.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '6.3.' },
        ' Pagamentos por cartão poderão ser parcelados conforme a operadora, sendo eventuais taxas de responsabilidade do CONTRATANTE.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 7 – Responsabilidades, Limites e Exclusões' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '7.1.' },
        ' A indenização por eventual avaria será calculada sobre o valor individual do bem.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '7.2.' },
        ' A CONTRATADA não responderá por defeitos preexistentes, vícios ocultos, desgaste natural, danos decorrentes de embalagens realizadas pelo CONTRATANTE ou perda de dados.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: '7.3.' }, ' Recomenda-se backup prévio de equipamentos eletrônicos.'],
    },

    ...blocoSeguro('contrato', e.seguroIncluso),

    { tipo: 'secao', titulo: 'Cláusula 9 – Guarda, Manuseio e Acondicionamento' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '9.1.' },
        ' Caso os bens permaneçam embalados após a entrega, o CONTRATANTE assume a responsabilidade por avarias constatadas posteriormente.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '9.2.' },
        ' A assinatura do comprovante de entrega sem ressalvas presume o recebimento em perfeito estado.',
      ],
    },

    ...blocoForcaMaior(10, 'contrato'),

    { tipo: 'secao', titulo: 'Cláusula 11 – Rescisão' },
    {
      tipo: 'paragrafo',
      partes: [{ b: '11.1.' }, ' O contrato poderá ser rescindido mediante comunicação por escrito.'],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '11.2.' },
        ' Havendo cancelamento após o início da execução, poderão ser cobrados os custos já incorridos.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 12 – Penalidades' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '12.1.' },
        ' O descumprimento deste contrato sujeitará a parte infratora às penalidades legais, sem prejuízo de perdas e danos.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 13 – Vigência' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '13.1.' },
        ' Este contrato entra em vigor na data de sua assinatura e permanece válido até a conclusão dos serviços e a quitação integral dos valores.',
      ],
    },
  ];

  if (e.clausulasAdicionais.length > 0) {
    blocos.push({ tipo: 'secao', titulo: 'Cláusulas Adicionais' });
    for (const linha of e.clausulasAdicionais) {
      blocos.push({ tipo: 'paragrafo', partes: [linha] });
    }
  }

  blocos.push(
    {
      tipo: 'paragrafo',
      partes: [
        'E, por estarem justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor e forma.',
      ],
    },
    blocoLocalData(e.dataContrato),
    { tipo: 'assinaturas', rotuloContratante: 'CONTRATANTE' },
  );

  return blocos;
}

/* ==========================================================================
   3. INVENTÁRIO
   ========================================================================== */

export type EntradaInventario = {
  cliente: DadosCliente;
  data: string;
  valorTotalDeclarado: number | null;
  metragem: string;
  observacao: string;
};

export function gerarInventario(e: EntradaInventario): BlocoDocumento[] {
  const c = e.cliente;

  return [
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Cliente:' },
        ` ${ou(c.nome, '[cliente]')} — `,
        { b: 'Data:' },
        ` ${dataOuLinha(e.data)}`,
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Origem:' },
        ` ${ou(c.enderecoColeta)}  |  `,
        { b: 'Destino:' },
        ` ${ou(c.enderecoEntrega)}`,
      ],
    },

    { tipo: 'secao', titulo: 'Itens relacionados' },
    { tipo: 'tabelaItens' },

    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Valor total declarado:' },
        ` ${valorOuLinha(e.valorTotalDeclarado)}`,
        '\n',
        { b: 'Metragem calculada:' },
        ` ${e.metragem ? `${e.metragem} m³` : '______ m³'}`,
      ],
    },

    { tipo: 'secao', titulo: 'Observação' },
    { tipo: 'paragrafo', partes: [ou(e.observacao, '—')] },

    {
      tipo: 'paragrafo',
      partes: [
        'E, por estarem justas e contratadas, firmam o presente inventário em duas vias de igual teor.',
      ],
    },
    blocoLocalData(e.data),
    { tipo: 'assinaturas', rotuloContratante: 'CONTRATANTE' },
  ];
}

/* ==========================================================================
   4. CONTRATO DE GUARDA-MÓVEIS — 13 cláusulas + Anexo I
   ========================================================================== */

export type EntradaGuarda = {
  cliente: DadosCliente;
  valorMensal: number | null;
  diaVencimento: string;
  metragem: string;
  seguroIncluso: boolean;
  enderecoDeposito: string;
  dataInicio: string;
  valorTotalDeclarado: number | null;
};

export function gerarGuarda(e: EntradaGuarda): BlocoDocumento[] {
  const c = e.cliente;

  return [
    { tipo: 'nota', texto: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GUARDA-MÓVEIS' },

    ...blocoPartes(c, 'guarda'),

    { tipo: 'secao', titulo: 'Cláusula 2 – Objeto do Contrato' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '2.1.' },
        ` Constitui objeto deste contrato a prestação dos serviços de guarda, armazenamento, conservação, custódia e controle dos bens móveis do CONTRATANTE no depósito da CONTRATADA, situado na ${ou(e.enderecoDeposito)}.`,
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '2.2.' },
        ' Os bens armazenados serão aqueles constantes do Anexo I – Inventário, parte integrante deste contrato.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 3 – Inventário, Recebimento e Entrega' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '3.1.' },
        ' Nenhum bem será armazenado sem o preenchimento e assinatura do inventário.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '3.2.' },
        ' O inventário conterá a descrição, quantidade, metragem ocupada e valor declarado dos bens.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '3.3.' },
        ' A retirada dos bens ocorrerá somente mediante identificação do CONTRATANTE ou representante autorizado e após a quitação integral dos débitos existentes.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 4 – Obrigações da Contratada' },
    {
      tipo: 'paragrafo',
      partes: [{ b: '4.1.' }, ' Manter os bens armazenados em ambiente adequado e seguro.'],
    },
    { tipo: 'paragrafo', partes: [{ b: '4.2.' }, ' Registrar movimentações autorizadas.'] },
    { tipo: 'paragrafo', partes: [{ b: '4.3.' }, ' Permitir vistoria mediante agendamento prévio.'] },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '4.4.' },
        ' Zelar pelos bens enquanto estiverem sob sua guarda, respeitadas as limitações deste contrato.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 5 – Obrigações do Contratante' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '5.1.' },
        ' Entregar os bens devidamente embalados, identificados e aptos ao armazenamento.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: '5.2.' }, ' Declarar corretamente o conteúdo e o valor dos bens.'],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: '5.3.' }, ' Informar itens que necessitem de cuidados especiais.'],
    },
    { tipo: 'paragrafo', partes: [{ b: '5.4.' }, ' Efetuar o pagamento nas datas contratadas.'] },

    { tipo: 'secao', titulo: 'Cláusula 6 – Valores e Pagamento' },
    {
      tipo: 'paragrafo',
      partes: [{ b: '6.1.' }, ` Valor mensal: ${valorOuLinha(e.valorMensal)}.`],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: '6.2.' }, ` Volume armazenado: ${e.metragem || '______'} m³.`],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '6.3.' },
        ` O vencimento ocorrerá todo dia ${e.diaVencimento || '___'} de cada mês.`,
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '6.4.' },
        ' O atraso acarretará multa de 2%, juros de 1% ao mês e correção monetária.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '6.5.' },
        ' Os valores poderão ser reajustados anualmente mediante aviso prévio de 30 dias.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 7 – Responsabilidade' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '7.1.' },
        ' A responsabilidade da CONTRATADA limita-se ao valor declarado no inventário, observados os limites do seguro.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '7.2.' },
        ' Não haverá responsabilidade por vícios próprios dos bens, deterioração natural, embalagens inadequadas realizadas pelo CONTRATANTE, caso fortuito ou força maior.',
      ],
    },

    ...blocoSeguro('guarda', e.seguroIncluso),

    { tipo: 'secao', titulo: 'Cláusula 9 – Acesso e Retirada' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '9.1.' },
        ' A retirada parcial ou total dependerá de aviso prévio mínimo de 7 dias.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '9.2.' },
        ' A entrega dos bens somente ocorrerá após a quitação dos valores pendentes.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: '9.3.' }, ' Retiradas parciais poderão gerar recálculo do volume armazenado.'],
    },

    { tipo: 'secao', titulo: 'Cláusula 10 – Vigência' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '10.1.' },
        ' O presente contrato possui prazo indeterminado, iniciando-se na data da assinatura.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '10.2.' },
        ' Permanecendo os bens armazenados, considera-se renovado automaticamente.',
      ],
    },

    { tipo: 'secao', titulo: 'Cláusula 11 – Rescisão' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '11.1.' },
        ' Qualquer parte poderá rescindir este contrato mediante aviso prévio de 30 dias.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '11.2.' },
        ' A CONTRATADA poderá exercer o direito de retenção dos bens até a quitação integral dos débitos, nos termos da legislação aplicável.',
      ],
    },

    ...blocoForcaMaior(12, 'guarda'),

    { tipo: 'secao', titulo: 'Cláusula 13 – Disposições Gerais' },
    {
      tipo: 'paragrafo',
      partes: [{ b: '13.1.' }, ' O Anexo I – Inventário integra este contrato para todos os efeitos legais.'],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '13.2.' },
        ' Alterações somente terão validade se realizadas por escrito e assinadas pelas partes.',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: '13.3.' },
        ' As partes firmam o presente instrumento em duas vias de igual teor e forma.',
      ],
    },

    { tipo: 'quebraPagina' },
    { tipo: 'secao', titulo: 'Anexo I – Inventário dos Bens Armazenados' },
    { tipo: 'tabelaItens' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Valor total declarado:' },
        ` ${valorOuLinha(e.valorTotalDeclarado)}`,
        '\n',
        { b: 'Metragem calculada:' },
        ` ${e.metragem || '______'} m³`,
      ],
    },

    blocoLocalData(e.dataInicio),
    { tipo: 'assinaturas', rotuloContratante: 'CONTRATANTE' },
  ];
}

/* ==========================================================================
   5. AUTORIZAÇÃO DE IMAGEM
   ========================================================================== */

export const ABRANGENCIA_IMAGEM = [
  { id: 'pessoal', rotulo: 'Imagem pessoal do contratante', texto: 'imagem pessoal do CONTRATANTE' },
  {
    id: 'itens',
    rotulo: 'Imagem dos itens transportados',
    texto: 'imagem dos itens/bens transportados',
  },
];

export const FINALIDADES_IMAGEM = [
  { id: 'redes', rotulo: 'Redes sociais', texto: 'divulgação em redes sociais' },
  { id: 'portfolio', rotulo: 'Portfólio / site', texto: 'portfólio/site da empresa' },
  { id: 'impresso', rotulo: 'Material impresso', texto: 'materiais publicitários impressos' },
];

export type EntradaImagem = {
  cliente: DadosCliente;
  abrangencia: string[];
  finalidades: string[];
  prazo: string;
};

export function gerarImagem(e: EntradaImagem): BlocoDocumento[] {
  const c = e.cliente;

  const abrangencia = ABRANGENCIA_IMAGEM.filter((a) => e.abrangencia.includes(a.id))
    .map((a) => a.texto)
    .join(' e ');

  const finalidades = FINALIDADES_IMAGEM.filter((f) => e.finalidades.includes(f.id))
    .map((f) => f.texto)
    .join(', ');

  return [
    {
      tipo: 'paragrafo',
      partes: [
        'Eu, ',
        { b: ou(c.nome, '[cliente]') },
        `, documento nº ${ou(c.documento)}, autorizo a `,
        { b: EMPRESA.nomeFantasia },
        ` a utilizar minha ${abrangencia || 'imagem'}, captada durante a prestação do serviço, para fins de ${finalidades || LINHA}.`,
      ],
    },

    { tipo: 'secao', titulo: 'Prazo' },
    { tipo: 'paragrafo', partes: [ou(e.prazo, 'Por prazo indeterminado.')] },

    {
      tipo: 'paragrafo',
      partes: ['Esta autorização é concedida a título gratuito, sem qualquer ônus para a CONTRATADA.'],
    },

    blocoLocalData(''),
    { tipo: 'assinaturas', rotuloContratante: 'AUTORIZANTE' },
  ];
}

/* ==========================================================================
   6. COMPROVANTE DE ENTREGA
   ========================================================================== */

export type EntradaComprovante = {
  cliente: DadosCliente;
  dataEntrega: string;
  recebedor: string;
  ressalvas: string;
};

export function gerarComprovante(e: EntradaComprovante): BlocoDocumento[] {
  const c = e.cliente;
  const recebedor = ou(e.recebedor, ou(c.nome, '[cliente]'));

  const blocos: BlocoDocumento[] = [
    {
      tipo: 'paragrafo',
      partes: ['Cliente: ', { b: ou(c.nome, '[cliente]') }, `, documento nº ${ou(c.documento)}.`],
    },
    {
      tipo: 'paragrafo',
      partes: ['Empresa: ', { b: EMPRESA.razaoSocial }, `, CNPJ ${EMPRESA.cnpj}.`],
    },
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Endereço de coleta:' },
        ` ${ou(c.enderecoColeta)}`,
        '\n',
        { b: 'Endereço de entrega:' },
        ` ${ou(c.enderecoEntrega)}`,
        '\n',
        { b: 'Data da entrega:' },
        ` ${dataOuLinha(e.dataEntrega)}`,
      ],
    },

    { tipo: 'secao', titulo: 'Declaração' },
    {
      tipo: 'paragrafo',
      partes: [
        'Eu, ',
        { b: recebedor },
        `, declaro ter recebido e conferido a mudança realizada pela ${EMPRESA.razaoSocial}, verificando a quantidade e o estado dos itens transportados, referentes ao endereço e à data acima indicados.`,
      ],
    },
  ];

  if (e.ressalvas.trim()) {
    blocos.push(
      { tipo: 'secao', titulo: 'Ressalvas' },
      { tipo: 'paragrafo', partes: [e.ressalvas] },
    );
  } else {
    blocos.push({
      tipo: 'paragrafo',
      partes: ['Não foram registradas ressalvas no ato da entrega.'],
    });
  }

  blocos.push(blocoLocalData(e.dataEntrega), {
    tipo: 'assinaturas',
    rotuloContratante: 'CONTRATANTE',
  });

  return blocos;
}

/* ==========================================================================
   Título e selo de cada documento
   ========================================================================== */

export const TITULO_DOCUMENTO: Record<TipoDocumento, string> = {
  orcamento: 'Orçamento',
  contrato: 'Contrato de Prestação de Serviço',
  inventario: 'Inventário dos Itens',
  guarda: 'Contrato de Guarda de Móveis',
  imagem: 'Autorização de Uso de Imagem',
  comprovante: 'Comprovante de Entrega',
  ficha: 'Ficha de Atendimento',
};

/* ==========================================================================
   7. FICHA DE ATENDIMENTO
   ==========================================================================
   Documento operacional, não jurídico: é o papel que a equipe leva para a
   rua. Reúne num lugar só o que o motorista e os ajudantes precisam saber
   sem ter que ligar para o escritório — endereços, contato do cliente,
   serviços contratados e espaço para anotar o que aconteceu.
   ========================================================================== */

export type EntradaFicha = {
  cliente: DadosCliente;
  titulo: string;
  data: string;
  horario: string;
  diaInteiro: boolean;
  veiculo: string;
  motorista: string;
  volumeM3: number | null;
  caracteristicas: string[];
  observacoes: string;
};

export function gerarFicha(e: EntradaFicha): BlocoDocumento[] {
  const c = e.cliente;

  const blocos: BlocoDocumento[] = [
    { tipo: 'secao', titulo: 'Atendimento' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Serviço:' },
        ` ${ou(e.titulo, '—')}`,
        '\n',
        { b: 'Data:' },
        ` ${dataOuLinha(e.data)}${e.diaInteiro ? ' — dia inteiro' : e.horario ? ` às ${e.horario}` : ''}`,
      ],
    },

    { tipo: 'secao', titulo: 'Cliente' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Nome:' },
        ` ${ou(c.nome, '[cliente]')}`,
        '\n',
        { b: 'Documento:' },
        ` ${ou(c.documento)}`,
        '\n',
        { b: 'Telefone:' },
        ` ${ou(c.telefone)}`,
        ...(c.email ? (['\n', { b: 'E-mail:' }, ` ${c.email}`] as Trecho[]) : []),
      ],
    },

    { tipo: 'secao', titulo: 'Endereços' },
    {
      tipo: 'paragrafo',
      partes: [{ b: 'Coleta:' }, ` ${ou(c.enderecoColeta)}`],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: 'Entrega:' }, ` ${ou(c.enderecoEntrega)}`],
    },

    { tipo: 'secao', titulo: 'Equipe e veículo' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Motorista:' },
        ` ${ou(e.motorista, 'A definir')}`,
        '\n',
        { b: 'Veículo:' },
        ` ${ou(e.veiculo, 'A definir')}`,
        ...(e.volumeM3
          ? (['\n', { b: 'Volume estimado:' }, ` ${e.volumeM3} m³`] as Trecho[])
          : []),
      ],
    },
  ];

  if (e.caracteristicas.length > 0) {
    blocos.push(
      { tipo: 'secao', titulo: 'Serviços contratados' },
      { tipo: 'lista', itens: e.caracteristicas },
    );
  }

  if (e.observacoes.trim()) {
    blocos.push(
      { tipo: 'secao', titulo: 'Observações' },
      { tipo: 'paragrafo', partes: [e.observacoes] },
    );
  }

  // Campos em branco para a equipe preencher na rua.
  blocos.push(
    { tipo: 'secao', titulo: 'Registro da equipe' },
    {
      tipo: 'paragrafo',
      partes: [
        { b: 'Horário de chegada:' },
        ' ____:____        ',
        { b: 'Início do carregamento:' },
        ' ____:____',
        '\n',
        { b: 'Fim do carregamento:' },
        ' ____:____        ',
        { b: 'Horário de saída:' },
        ' ____:____',
      ],
    },
    {
      tipo: 'paragrafo',
      partes: [{ b: 'Ocorrências:' }],
    },
    { tipo: 'linhasEmBranco', quantidade: 4 },

    { tipo: 'assinaturas', rotuloContratante: 'CLIENTE' },
  );

  return blocos;
}
