'use client';

/**
 * PROVEDOR DE SESSÃO + GUARDA DE MÓDULO
 *
 * A guarda de AUTENTICAÇÃO agora vive em middleware.ts, no servidor: quem
 * não tem sessão nem chega a renderizar isto aqui.
 *
 * O que sobra para este componente é a guarda de MÓDULO — redirecionar
 * quem abriu uma URL fora do seu nível. Continua sendo conveniência de
 * navegação: a garantia real está no RLS do Postgres, que nega o dado
 * mesmo se alguém contornar a interface.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { perfilAtual, sair as encerrarSessao, type Usuario } from '@/lib/auth';
import { supabase } from '@/lib/supabase/cliente';
import { moduloDaRota, podeVer } from '@/lib/permissoes';

type ContextoSessao = {
  usuario: Usuario | null;
  carregando: boolean;
  sair: () => void;
  /** Recarrega o perfil — usado depois que o admin altera o próprio nível. */
  recarregar: () => Promise<void>;
};

const Contexto = createContext<ContextoSessao>({
  usuario: null,
  carregando: true,
  sair: () => {},
  recarregar: async () => {},
});

export function useSessao(): ContextoSessao {
  return useContext(Contexto);
}

/**
 * Hook para telas que só renderizam com sessão. O layout da plataforma já
 * garante isso, então o non-null aqui é seguro e evita `usuario?.nivel`
 * espalhado por todo módulo.
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

  const recarregar = useCallback(async () => {
    setUsuario(await perfilAtual());
  }, []);

  // Carrega o perfil e acompanha mudanças de sessão (login, logout, refresh
  // de token em outra aba).
  useEffect(() => {
    let ativo = true;

    perfilAtual().then((perfil) => {
      if (!ativo) return;
      setUsuario(perfil);
      setCarregando(false);
    });

    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((evento) => {
      if (!ativo) return;

      if (evento === 'SIGNED_OUT') {
        setUsuario(null);
        return;
      }
      if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED') {
        perfilAtual().then((perfil) => ativo && setUsuario(perfil));
      }
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  // Guarda de sessão e de módulo.
  useEffect(() => {
    if (carregando) return;

    // Normalmente o middleware já barrou antes de chegar aqui. Este ramo
    // cobre o caso em que ele está inerte por falta de configuração do
    // Supabase — sem isto, a tela ficaria presa em "Carregando…".
    if (!usuario) {
      router.replace('/');
      return;
    }

    const modulo = moduloDaRota(pathname);
    if (modulo && !podeVer(usuario.nivel, modulo)) {
      sessionStorage.setItem(
        'jlt.aviso',
        `Seu nível de acesso (${usuario.nivel}) não permite abrir o módulo solicitado.`,
      );
      router.replace('/dashboard');
    }
  }, [carregando, usuario, pathname, router]);

  const sair = useCallback(async () => {
    await encerrarSessao();
    setUsuario(null);
    router.replace('/');
    router.refresh();
  }, [router]);

  return (
    <Contexto.Provider value={{ usuario, carregando, sair, recarregar }}>
      {children}
    </Contexto.Provider>
  );
}
