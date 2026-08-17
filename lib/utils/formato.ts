/**
 * FORMATADORES E MÁSCARAS — versão única.
 *
 * Os módulos originais reimplementavam estas funções cada um do seu jeito:
 * formatBRL aparecia em 3 arquivos, maskPhone em 3, dataFormatada em 2, com
 * comportamentos ligeiramente diferentes em cada cópia. Aqui existe uma só.
 */

/* ==========================================================================
   Dinheiro
   ========================================================================== */

const FORMATADOR_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** 1234.5 → "R$ 1.234,50" */
export function formatarBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return FORMATADOR_BRL.format(valor);
}

/** 1234.5 → "1.234,50" (sem o símbolo, para colunas de tabela e CSV) */
export function formatarNumero(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** 0.155 → "15,5%" — recebe a fração, não o percentual. */
export function formatarPercentual(fracao: number, casas = 1): string {
  return `${(fracao * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
}

/** "R$ 1.234,50" → 1234.5. Aceita o que o usuário digitar num campo livre. */
export function paraNumero(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? 0 : n;
}

/* ==========================================================================
   Datas
   Convenção: internamente tudo é ISO 'YYYY-MM-DD'. Só a exibição é BR.
   ========================================================================== */

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * "2026-03-08" → "08/03/2026"
 *
 * Faz o corte na string em vez de usar `new Date()` de propósito: o
 * construtor interpreta 'YYYY-MM-DD' como UTC e, em fuso negativo como o
 * nosso, devolve o dia anterior. Era esse o bug clássico a evitar.
 */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  if (!ano || !mes || !dia) return '—';
  return `${dia}/${mes}/${ano}`;
}

/** "2026-03-08" → "8 de março de 2026" (para cabeçalho de documento). */
export function dataPorExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return '—';
  return `${dia} de ${NOMES_MES[mes - 1].toLowerCase()} de ${ano}`;
}

/** Data de hoje em ISO 'YYYY-MM-DD', no fuso local. */
export function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Converte um Date local para ISO 'YYYY-MM-DD'. */
export function paraISO(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Nome do mês pelo índice 0-11. */
export function nomeDoMes(indice: number): string {
  return NOMES_MES[indice] ?? '';
}

/** Dias inteiros entre duas datas ISO. Negativo se `ate` for anterior a `de`. */
export function diasEntre(de: string, ate: string): number {
  const inicio = new Date(`${de}T00:00:00`);
  const fim = new Date(`${ate}T00:00:00`);
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
}

/** A data ISO está dentro do período? Limites vazios não restringem. */
export function dentroDoPeriodo(data: string, de?: string, ate?: string): boolean {
  if (de && data < de) return false;
  if (ate && data > ate) return false;
  return true;
}

/* ==========================================================================
   Documentos e máscaras
   Todas as máscaras são progressivas: funcionam enquanto o usuário digita.
   ========================================================================== */

/** 12345678901 → "123.456.789-01" */
export function mascararCPF(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** 12345678000190 → "12.345.678/0001-90" */
export function mascararCNPJ(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Escolhe CPF ou CNPJ conforme a quantidade de dígitos já digitada. */
export function mascararDocumento(valor: string, tipo?: 'PF' | 'PJ'): string {
  if (tipo === 'PF') return mascararCPF(valor);
  if (tipo === 'PJ') return mascararCNPJ(valor);
  return valor.replace(/\D/g, '').length > 11 ? mascararCNPJ(valor) : mascararCPF(valor);
}

/** Fixo e celular: "(31) 3333-4444" e "(31) 99999-1234". */
export function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

/** CEP: "30110-001". */
export function mascararCEP(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

/**
 * Placa Mercosul (ABC1D23) ou antiga (ABC1234).
 * Normaliza para maiúsculas e limita a 7 caracteres.
 */
export function mascararPlaca(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

/** A placa está num dos dois formatos válidos? */
export function placaValida(placa: string): boolean {
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p) || /^[A-Z]{3}\d{4}$/.test(p);
}

/**
 * Validação de CPF pelos dígitos verificadores.
 * Usada só para avisar o usuário; nada é bloqueado por causa disso.
 */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** Validação de CNPJ pelos dígitos verificadores. */
export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;

  const digito = (ate: number) => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

/* ==========================================================================
   Texto
   ========================================================================== */

/** "Rota BH → Vitória" → "rota-bh-vitoria" (para nome de arquivo e id). */
export function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Corta o texto sem cortar palavra no meio. */
export function truncar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  return `${texto.slice(0, texto.lastIndexOf(' ', limite))}…`;
}

/** Tamanho de arquivo legível: 2134064 → "2,0 MB". */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatarNumero(bytes / 1024, 1)} KB`;
  return `${formatarNumero(bytes / (1024 * 1024), 1)} MB`;
}

/** Gera um id local. Some quando o banco entrar e passar a gerar o id. */
export function novoId(prefixo: string): string {
  return `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
