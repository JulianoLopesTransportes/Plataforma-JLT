'use client';

/**
 * HEADER — breadcrumb à esquerda, identificação do usuário e logout à direita.
 * O nível aparece sempre visível: é o que permite conferir de relance qual
 * perfil está ativo ao trocar de usuário de teste.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icone from './Icone';
import { iniciais, type Usuario } from '@/lib/auth';
import { rotuloDoNivel } from '@/lib/permissoes';
import { moduloDaRota } from '@/lib/permissoes';
import { rotuloDoModulo } from '@/lib/navegacao';
import estilos from './layout.module.css';

type Props = {
  usuario: Usuario;
  aoAbrirMenu: () => void;
  aoSair: () => void;
};

export default function Header({ usuario, aoAbrirMenu, aoSair }: Props) {
  const pathname = usePathname();
  const modulo = moduloDaRota(pathname);

  /** Segmentos após o módulo — ex.: /clientes/cli_001 → ['cli_001'] */
  const subsegmentos = pathname.split('/').filter(Boolean).slice(1);

  return (
    <header className={estilos.header}>
      <div className={estilos.breadcrumb}>
        <button
          type="button"
          className={estilos.botaoMenu}
          onClick={aoAbrirMenu}
          aria-label="Abrir menu"
        >
          <Icone nome="menu" tamanho={22} />
        </button>

        <Link href="/dashboard">Início</Link>

        {modulo && modulo !== 'dashboard' && (
          <>
            <span className={estilos.breadcrumbSeparador}>/</span>
            {subsegmentos.length > 0 ? (
              <Link href={`/${modulo}`}>{rotuloDoModulo(modulo)}</Link>
            ) : (
              <span className={estilos.breadcrumbAtual}>{rotuloDoModulo(modulo)}</span>
            )}
          </>
        )}

        {subsegmentos.length > 0 && (
          <>
            <span className={estilos.breadcrumbSeparador}>/</span>
            <span className={estilos.breadcrumbAtual}>Detalhe</span>
          </>
        )}
      </div>

      <div className={estilos.usuario}>
        <div className={estilos.avatar} aria-hidden="true">
          {iniciais(usuario.nome)}
        </div>
        <div className={estilos.usuarioTexto}>
          <span className={estilos.usuarioNome}>{usuario.nome}</span>
          <span className={estilos.usuarioNivel}>{rotuloDoNivel(usuario.nivel)}</span>
        </div>
        <button type="button" className={estilos.botaoSair} onClick={aoSair}>
          <Icone nome="sair" tamanho={16} />
          Sair
        </button>
      </div>
    </header>
  );
}
