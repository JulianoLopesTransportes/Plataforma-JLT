/**
 * ÍCONES — conjunto outline, traço 1.8, herda a cor do contexto.
 *
 * Extraídos do guia visual (referencia/00-guia-visual_1.html) para manter a
 * identidade. São inline em vez de biblioteca externa: são poucos, e assim
 * o projeto não ganha mais uma dependência.
 */

type Props = {
  nome: string;
  /** Tamanho em px. Padrão 19 (medida da sidebar no guia). */
  tamanho?: number;
  className?: string;
};

const CAMINHOS: Record<string, React.ReactNode> = {
  dashboard: <path d="M3 12l2-2 5 5L21 4" strokeLinecap="round" strokeLinejoin="round" />,
  clientes: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" />
    </>
  ),
  documentos: (
    <>
      <path d="M6 3h9l4 4v14H6z" strokeLinejoin="round" />
      <path d="M9 11h7M9 15h7" strokeLinecap="round" />
    </>
  ),
  agenda: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" strokeLinecap="round" />
    </>
  ),
  rotas: (
    <>
      <path d="M4 18c3-.5 3.5-3 2-5s-.5-6 3-6 1.5 4.5 4 4.5S15 7 18 7" strokeLinecap="round" />
      <circle cx="4.5" cy="18.5" r="1.6" />
      <circle cx="18.5" cy="6.5" r="1.6" />
    </>
  ),
  veiculo: (
    <>
      <path d="M3 16V8h11l4 4h3v4" strokeLinejoin="round" />
      <circle cx="7.5" cy="17" r="1.8" />
      <circle cx="17" cy="17" r="1.8" />
    </>
  ),
  motorista: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1-3.8 4-6 7.5-6s6.5 2.2 7.5 6" strokeLinecap="round" />
    </>
  ),
  financeiro: <path d="M3 17l5-5 4 3 8-8" strokeLinecap="round" strokeLinejoin="round" />,
  orcamento: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h5M8 17h3" strokeLinecap="round" />
    </>
  ),
  relatorios: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c.8-3.3 3.4-5.2 6.5-5.2s5.7 1.9 6.5 5.2" strokeLinecap="round" />
      <path d="M16.5 5.5a3.2 3.2 0 010 5.6M18 14.9c2.2.6 3.7 2.4 4.3 5.1" strokeLinecap="round" />
    </>
  ),
  guia: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3 2" strokeLinecap="round" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />,
  sair: (
    <>
      <path d="M14 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4" strokeLinecap="round" />
      <path d="M10 8l-4 4 4 4M6 12h9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  buscar: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" strokeLinecap="round" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
  baixar: (
    <>
      <path d="M12 4v11M8 11l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 4l9 16H3z" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
    </>
  ),
  seta: <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
};

export default function Icone({ nome, tamanho = 19, className }: Props) {
  const conteudo = CAMINHOS[nome];
  if (!conteudo) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {conteudo}
    </svg>
  );
}
