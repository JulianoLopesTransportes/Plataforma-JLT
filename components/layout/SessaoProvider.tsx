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
 *
 * É TAMBÉM o lugar onde a matriz de permissões é hidratada. Ela vive numa
 * variável de módulo em lib/permissoes.ts para as consultas continuarem
 * síncronas, e precisa estar preenchida antes de qualquer tela desenhar —
 * senão a sidebar pisca vazia e a guarda de módulo redireciona quem tinha
 * acesso. Por isso a hidratação acontece junto do perfil, e `carregando`
 * só vira false quando as duas terminaram.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { perfilAtual, sair as encerrarSessao, type Usuario } from '@/lib/auth';
import { supabase } from '@/lib/supabase/cliente';
import { moduloDaRota, podeVer, hidratarPermissoes, rotuloDoNivel } from '@/lib/permissoes';
import { lerPermissoes } from '@/lib/api/admin';
import { supabaseConfigurado } from '@/lib/supabase/cliente';

type ContextoSessao = {
  usuario: Usuario | null;
  carregando: boolean;
  sair: () => void;
  /** Recarrega o perfil — usado depois que o admin altera o próprio nível. */
  recarregar: () => Promise<void>;
  /**
   * Recarrega a matriz e redesenha a plataforma.
   *
   * Chamada depois que o admin salva a matriz, para a mudança valer NA
   * HORA — sidebar, botões e guardas — em vez de só no próximo login.
   */
  recarregarPermissoes: () => Promise<void>;
};

const Contexto = createContext<ContextoSessao>({
  usuario: null,
  carregando: true,
  sair: () => {},
  recarregar: async () => {},
  recarregarPermissoes: async () => {},
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
  /*
   * hidratarPermissoes() muda uma variável de módulo, que o React não
   * observa. Este contador é o que provoca o redesenho: incrementá-lo faz
   * a árvore reconsultar podeVer/podeEditar e reagir à matriz nova.
   */
  const [versaoPermissoes, setVersaoPermissoes] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  const recarregar = useCallback(async () => {
    setUsuario(await perfilAtual());
  }, []);

  /**
   * Busca a matriz e a instala.
   *
   * Falhar aqui não derruba nada: lib/permissoes.ts já nasce com a semente
   * compilada, que é a mesma matriz gravada pela migration 02. Banco fora
   * do ar com a plataforma inteira inacessível seria pior do que a
   * plataforma rodando no padrão de fábrica.
   */
  const recarregarPermissoes = useCallback(async () => {
    if (!supabaseConfigurado()) return;

    try {
      hidratarPermissoes(await lerPermissoes());
    } catch {
      // Segue com a semente.
    } finally {
      setVersaoPermissoes((v) => v + 1);
    }
  }, []);

  // Carrega o perfil e acompanha mudanças de sessão (login, logout, refresh
  // de token em outra aba).
  useEffect(() => {
    let ativo = true;

    // As duas coisas em paralelo, e a tela só libera quando ambas
    // terminam: perfil sem matriz não sabe o que pode abrir.
    Promise.all([perfilAtual(), recarregarPermissoes()]).then(([perfil]) => {
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
  }, [recarregarPermissoes]);

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
        `Seu nível de acesso (${rotuloDoNivel(usuario.nivel)}) não permite abrir o módulo solicitado.`,
      );
      router.replace('/dashboard');
    }
    // versaoPermissoes entra de propósito: se o admin se tirar de um
    // módulo que está aberto no momento, a guarda precisa reagir na hora.
  }, [carregando, usuario, pathname, router, versaoPermissoes]);

  const sair = useCallback(async () => {
    await encerrarSessao();
    setUsuario(null);
    router.replace('/');
    router.refresh();
  }, [router]);

  /*
   * O objeto de valor é criado a cada render DE PROPÓSITO.
   *
   * As consultas de permissão são síncronas e leem uma variável de módulo,
   * que o React não observa. O que faz a plataforma reagir à matriz nova é
   * este objeto trocar de identidade: `versaoPermissoes` muda, o provider
   * redesenha, o valor é outro, e todo componente que chamou useSessao()
   * — ou useUsuario(), que passa por ele — redesenha junto. Memoizar isto
   * congelaria a sidebar na matriz antiga.
   *
   * Não usar `key` aqui: remontaria a subárvore inteira e a tela que
   * acabou de salvar perderia a aba e o rascunho.
   */
  void versaoPermissoes;

  return (
    <Contexto.Provider value={{ usuario, carregando, sair, recarregar, recarregarPermissoes }}>
      {children}
    </Contexto.Provider>
  );
}
