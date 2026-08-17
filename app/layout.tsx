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
