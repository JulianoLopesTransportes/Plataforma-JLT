import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Montserrat } from 'next/font/google';
import { SessaoProvider } from '@/components/layout/SessaoProvider';
import '@/styles/globals.css';

/**
 * As duas fontes da identidade visual, auto-hospedadas pelo next/font.
 * Os originais carregavam do Google Fonts por CDN; aqui elas passam a ser
 * servidas pelo próprio domínio — sem requisição a terceiro e sem o salto
 * de layout que o carregamento remoto causava.
 */
const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--fonte-display',
  display: 'swap',
});

const montserrat = Montserrat({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--fonte-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Plataforma JLT — Juliano Lopes Transportes',
  description: 'Plataforma interna de gestão da Juliano Lopes Transportes.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#820901',
  /*
   * `cover` é o que faz `env(safe-area-inset-*)` devolver número.
   *
   * Sem ele o iOS encaixa a página numa caixa que já evita o notch, e o
   * safe-area vale zero — a proteção no CSS existiria e não faria nada.
   * Com `cover` a página ocupa a tela inteira e passa a ser responsável
   * por respeitar o recorte: é a troca certa, porque aí o cabeçalho e a
   * gaveta podem usar a área sob o notch como fundo e manter o CONTEÚDO
   * fora dela.
   */
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${bebas.variable} ${montserrat.variable}`}>
      <body>
        <SessaoProvider>{children}</SessaoProvider>
      </body>
    </html>
  );
}
