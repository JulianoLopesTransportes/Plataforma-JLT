'use client';

/**
 * MOLDURA DA PLATAFORMA
 *
 * Injeta sidebar e header em volta de todo módulo. Nenhuma página abaixo
 * deste layout redeclara estrutura de navegação — é este arquivo, e só ele,
 * que desenha a moldura.
 *
 * Também segura a renderização enquanto a sessão é lida, para que nenhum
 * módulo apareça por um instante antes da guarda de acesso agir.
 */

import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { useSessao } from '@/components/layout/SessaoProvider';
import { ProvedorToast } from '@/components/ui';
import estilos from '@/components/layout/layout.module.css';

const CHAVE_COLAPSO = 'jlt.sidebarColapsada';

export default function LayoutPlataforma({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, sair } = useSessao();
  const [colapsada, setColapsada] = useState(false);
  const [drawerAberto, setDrawerAberto] = useState(false);

  // Preferência de sidebar recolhida sobrevive à navegação.
  useEffect(() => {
    setColapsada(localStorage.getItem(CHAVE_COLAPSO) === 'true');
  }, []);

  function alternarColapso() {
    setColapsada((atual) => {
      const proximo = !atual;
      localStorage.setItem(CHAVE_COLAPSO, String(proximo));
      return proximo;
    });
  }

  // Sessão ainda sendo lida, ou já redirecionada pela guarda em
  // SessaoProvider: não renderizamos módulo nenhum.
  if (carregando || !usuario) {
    return <div className={estilos.carregandoTela}>Carregando…</div>;
  }

  return (
    <ProvedorToast>
      <div className={estilos.app}>
        <Sidebar
          nivel={usuario.nivel}
          colapsada={colapsada}
          aberta={drawerAberto}
          aoAlternarColapso={alternarColapso}
          aoNavegar={() => setDrawerAberto(false)}
        />

        {drawerAberto && (
          <div
            className={estilos.backdrop}
            onClick={() => setDrawerAberto(false)}
            aria-hidden="true"
          />
        )}

        <div className={estilos.coluna}>
          <Header usuario={usuario} aoAbrirMenu={() => setDrawerAberto(true)} aoSair={sair} />
          <main className={estilos.conteudo}>{children}</main>
        </div>
      </div>
    </ProvedorToast>
  );
}
