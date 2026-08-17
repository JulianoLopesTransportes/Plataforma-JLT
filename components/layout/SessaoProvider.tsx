'use client';

/**
 * PROVEDOR DE SESSÃO + GUARDA DE ROTA
 *
 * Mantém a sessão mock (ver aviso em lib/auth.ts) disponível para toda a
 * árvore e aplica a guarda de acesso: se o nível da sessão não pode ver o
 * módulo da URL atual, redireciona para o dashboard com um aviso.
 *
 * A guarda é client-side porque a sessão vive em sessionStorage. Isso impede
 * navegação indevida, não acesso mal-intencionado — na Fase B ela é
 * substituída por middleware.ts validando a sessão do Supabase no servidor.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { sessaoAtual, sair as encerrarSessao, type Usuario } from '@/lib/auth';
import { moduloDaRota, podeVer } from '@/lib/permissoes';

type ContextoSessao = {
  usuario: Usuario | null;
  /** true enquanto lemos o sessionStorage — evita piscar a tela errada. */
  carregando: boolean;
  sair: () => void;
};

const Contexto = createContext<ContextoSessao>({
  usuario: null,
  carregando: true,
  sair: () => {},
});

/** Hook de acesso à sessão. Use em qualquer componente cliente. */
export function useSessao(): ContextoSessao {
  return useContext(Contexto);
}

/**
 * Hook de conveniência para telas que só renderizam com sessão válida.
 * Dentro de (plataforma) o layout já garante isso, então o non-null aqui
 * é seguro e evita `usuario?.nivel` espalhado por todo módulo.
 */
export function useUsuario(): Usuario {
  const { usuario } = useSessao();
  if (!usuario) {
    throw new Error('useUsuario() exige sessão ativa — use dentro do layout da plataforma.');
  }
  return usuario;
}

export function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Lê a sessão uma vez, já no cliente.
  useEffect(() => {
    setUsuario(sessaoAtual());
    setCarregando(false);
  }, []);

  // Guarda de rota: roda a cada navegação, depois que a sessão foi lida.
  useEffect(() => {
    if (carregando) return;

    if (!usuario) {
      router.replace('/');
      return;
    }

    const modulo = moduloDaRota(pathname);
    if (modulo && !podeVer(usuario.nivel, modulo)) {
      // O aviso é lido e exibido pelo dashboard, depois limpo.
      sessionStorage.setItem(
        'jlt.aviso',
        `Seu nível de acesso (${usuario.nivel}) não permite abrir o módulo solicitado.`,
      );
      router.replace('/dashboard');
    }
  }, [carregando, usuario, pathname, router]);

  const sair = useCallback(() => {
    encerrarSessao();
    setUsuario(null);
    router.replace('/');
  }, [router]);

  return <Contexto.Provider value={{ usuario, carregando, sair }}>{children}</Contexto.Provider>;
}
