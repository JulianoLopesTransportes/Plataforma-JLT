/**
 * DOCUMENTOS — modelos e cláusulas, portados de 02-documentos_10.html
 *
 * O texto jurídico é o mesmo do módulo original, palavra por palavra: são
 * cláusulas que a empresa já usa em contrato assinado, não texto de
 * exemplo. Qualquer alteração aqui muda documento com efeito legal.
 */

export type TipoDocumento =
  | 'orcamento'
  | 'contrato'
  | 'inventario'
  | 'guarda'
  | 'imagem'
  | 'comprovante';

export const TIPOS_DOCUMENTO: { id: TipoDocumento; rotulo: string; descricao: string }[] = [
  {
    id: 'orcamento',
    rotulo: 'Orçamento',
    descricao: 'Proposta comercial com valores, serviços inclusos e validade.',
  },
  {
    id: 'contrato',
    rotulo: 'Contrato de mudança',
    descricao: 'Contrato de prestação de serviço de transporte e mudança.',
  },
  {
    id: 'inventario',
    rotulo: 'Inventário de bens',
    descricao: 'Relação dos itens transportados, por ambiente.',
  },
  {
    id: 'guarda',
    rotulo: 'Contrato de guarda-móveis',
    descricao: 'Contrato de depósito e guarda de bens.',
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

/** Nome de arquivo sugerido ao imprimir/salvar em PDF. */
export const NOME_ARQUIVO: Record<TipoDocumento, string> = {
  orcamento: 'Orcamento',
  contrato: 'Contrato',
  inventario: 'Inventario',
  guarda: 'ContratoGuardaMoveis',
  imagem: 'AutorizacaoImagem',
  comprovante: 'ComprovanteEntrega',
};

/* ==========================================================================
   Dados da empresa — cabeçalho de todo documento
   ========================================================================== */

export const EMPRESA = {
  razaoSocial: 'Juliano Lopes Transportes',
  cnpj: '58.450.843/0001-70',
  endereco: 'Belo Horizonte — MG',
  telefone: '(31) 97339-0837',
  email: 'contato@julianoltransportes.com.br',
  site: 'julianoltransportes.com.br',
};

/* ==========================================================================
   Cláusulas reutilizadas entre contratos
   ========================================================================== */

export function clausulaForcaMaior(numero: number, variante: 'mudanca' | 'guarda'): Clausula {
  return {
    titulo: `Cláusula ${numero} – Caso Fortuito e Força Maior`,
    itens: [
      {
        numero: `${numero}.1.`,
        texto:
          variante === 'guarda'
            ? 'Nenhuma das partes responderá por eventos imprevisíveis ou inevitáveis que impeçam a execução do contrato.'
            : 'Nenhuma das partes responderá por atrasos decorrentes de caso fortuito ou força maior.',
      },
    ],
  };
}

export function clausulaSeguro(variante: 'mudanca' | 'guarda', seguroIncluso: boolean): Clausula {
  const marca = (v: boolean) => (seguroIncluso === v ? '☑' : '☐');
  const linhaEscolha = `O seguro ${variante === 'guarda' ? 'dos bens' : 'de carga'}: ${marca(true)} INCLUSO   /   ${marca(false)} NÃO INCLUSO`;

  if (variante === 'guarda') {
    return {
      titulo: 'Cláusula 8 – Seguro',
      itens: [
        { numero: '8.1.', texto: linhaEscolha },
        { numero: '8.2.', texto: 'Quando incluso, considera-se cobertura até o limite contratado.' },
        {
          numero: '8.3.',
          texto: 'Havendo renúncia ao seguro, o CONTRATANTE declara ciência dos riscos.',
        },
      ],
    };
  }

  return {
    titulo: 'Cláusula 8 – Seguro',
    itens: [
      { numero: '8.1.', texto: linhaEscolha },
      {
        numero: '8.2.',
        texto:
          'Caso o CONTRATANTE opte pela não contratação do seguro, deverá formalizar sua decisão antes do início do serviço.',
      },
      {
        numero: '8.3.',
        texto: 'Nessa hipótese, assume integral responsabilidade pelos riscos não cobertos.',
      },
    ],
  };
}

export type Clausula = {
  titulo: string;
  itens: { numero: string; texto: string }[];
};

/**
 * Corpo do contrato de mudança. As cláusulas 1 (partes) e 9 (assinaturas)
 * são montadas pela tela, porque dependem dos dados do cliente.
 */
export function clausulasContratoMudanca(seguroIncluso: boolean): Clausula[] {
  return [
    {
      titulo: 'Cláusula 2 – Objeto do Contrato',
      itens: [
        {
          numero: '2.1.',
          texto:
            'O presente contrato tem por objeto a prestação de serviços de transporte de mudança residencial ou comercial, compreendendo carregamento, transporte e descarregamento dos bens relacionados no inventário anexo.',
        },
      ],
    },
    {
      titulo: 'Cláusula 3 – Obrigações da Contratada',
      itens: [
        {
          numero: '3.1.',
          texto:
            'Executar o serviço com pessoal qualificado, veículo adequado e nos prazos acordados.',
        },
        {
          numero: '3.2.',
          texto: 'Zelar pela integridade dos bens durante todas as etapas do transporte.',
        },
        {
          numero: '3.3.',
          texto:
            'Comunicar de imediato ao CONTRATANTE qualquer ocorrência que afete o serviço contratado.',
        },
      ],
    },
    {
      titulo: 'Cláusula 4 – Obrigações do Contratante',
      itens: [
        {
          numero: '4.1.',
          texto:
            'Garantir o acesso do veículo e da equipe aos locais de coleta e entrega, providenciando autorizações de condomínio quando necessário.',
        },
        {
          numero: '4.2.',
          texto:
            'Conferir e assinar o inventário dos bens antes do início do carregamento.',
        },
        {
          numero: '4.3.',
          texto:
            'Declarar previamente a existência de itens de alto valor, frágeis ou que exijam manuseio especial.',
        },
        { numero: '4.4.', texto: 'Efetuar os pagamentos nas datas e formas acordadas.' },
      ],
    },
    {
      titulo: 'Cláusula 5 – Prazo de Execução',
      itens: [
        {
          numero: '5.1.',
          texto:
            'O serviço será executado na data acordada entre as partes, admitida variação decorrente de condições de tráfego, clima ou acesso.',
        },
      ],
    },
    {
      titulo: 'Cláusula 6 – Preço e Condições de Pagamento',
      itens: [
        {
          numero: '6.1.',
          texto:
            'O valor total do serviço é o constante no orçamento aprovado, parte integrante deste contrato.',
        },
        {
          numero: '6.2.',
          texto:
            'O pagamento seguirá o parcelamento acordado: sinal na assinatura, parcela no carregamento e saldo antes do descarregamento.',
        },
      ],
    },
    {
      titulo: 'Cláusula 7 – Responsabilidade por Avarias',
      itens: [
        {
          numero: '7.1.',
          texto:
            'Eventuais avarias deverão ser apontadas no ato da entrega, com registro no comprovante de entrega.',
        },
        {
          numero: '7.2.',
          texto:
            'Não haverá responsabilidade da CONTRATADA sobre bens não declarados no inventário nem sobre embalagens feitas pelo próprio CONTRATANTE.',
        },
      ],
    },
    clausulaSeguro('mudanca', seguroIncluso),
    clausulaForcaMaior(9, 'mudanca'),
    {
      titulo: 'Cláusula 10 – Rescisão',
      itens: [
        {
          numero: '10.1.',
          texto:
            'O contrato poderá ser rescindido por qualquer das partes mediante comunicação prévia, respeitados os valores já executados.',
        },
      ],
    },
    {
      titulo: 'Cláusula 11 – Foro',
      itens: [
        {
          numero: '11.1.',
          texto:
            'Fica eleito o foro da comarca de Belo Horizonte — MG para dirimir questões oriundas deste contrato.',
        },
      ],
    },
  ];
}

/** Serviços que aparecem marcáveis no orçamento. */
export const SERVICOS_INCLUSOS = [
  'Logística terrestre completa',
  'Embalagem e proteção dos bens transportados',
  'Cobertura de seguro para a carga',
  'Mão de obra de carregamento e descarregamento',
  'Condução por motorista credenciado e responsável',
];
