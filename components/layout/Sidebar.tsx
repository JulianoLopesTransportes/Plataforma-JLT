'use client';

/**
 * SIDEBAR — renderiza APENAS os módulos permitidos ao nível da sessão.
 *
 * A filtragem sai inteira de podeVer(); não há nenhuma condição de nível
 * escrita à mão aqui. Um grupo que fica sem itens visíveis desaparece junto
 * com seu rótulo.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Icone from './Icone';
import { NAVEGACAO } from '@/lib/navegacao';
import { podeVer } from '@/lib/permissoes';
import type { Nivel } from '@/lib/permissoes';
import estilos from './layout.module.css';

type Props = {
  nivel: Nivel;
  colapsada: boolean;
  aberta: boolean;
  aoAlternarColapso: () => void;
  aoNavegar: () => void;
};

export default function Sidebar({ nivel, colapsada, aberta, aoAlternarColapso, aoNavegar }: Props) {
  const pathname = usePathname();

  const classes = [
    estilos.sidebar,
    colapsada ? estilos.sidebarColapsada : '',
    aberta ? estilos.sidebarAberta : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={classes} aria-label="Navegação principal">
      <div className={estilos.marca}>
        <div className={estilos.placaLogo}>
          {colapsada ? (
            <span className={estilos.siglaLogo}>JLT</span>
          ) : (
            <Image
              src="/logo-jlt.png"
              alt="Juliano Lopes Transportes"
              width={210}
              height={70}
              priority
              style={{ width: '100%', height: 'auto' }}
            />
          )}
        </div>
      </div>

      <nav>
        {NAVEGACAO.map((grupo) => {
          const visiveis = grupo.itens.filter((item) => podeVer(nivel, item.modulo));
          if (visiveis.length === 0) return null;

          return (
            <div key={grupo.rotulo}>
              <div className={estilos.grupoRotulo}>{grupo.rotulo}</div>
              {visiveis.map((item) => {
                const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${estilos.item} ${ativo ? estilos.itemAtivo : ''}`}
                    aria-current={ativo ? 'page' : undefined}
                    title={colapsada ? item.rotulo : undefined}
                    onClick={aoNavegar}
                  >
                    <Icone nome={item.icone} />
                    <span className={estilos.itemRotulo}>{item.rotulo}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className={estilos.rodapeSidebar}>
        <button
          type="button"
          className={`${estilos.botaoColapsar} ${colapsada ? '' : estilos.setaInvertida}`}
          onClick={aoAlternarColapso}
          aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
        >
          <Icone nome="seta" tamanho={16} />
          {!colapsada && <span>Recolher menu</span>}
        </button>
      </div>
    </aside>
  );
}
