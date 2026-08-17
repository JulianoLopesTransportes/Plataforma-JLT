'use client';

/**
 * BIBLIOTECA DE COMPONENTES — escritos uma vez, importados por todo módulo.
 *
 * Nenhum módulo redesenha tabela, modal, card de métrica ou filtro. Se
 * algo aqui não atende um caso, o componente ganha uma prop — não se
 * duplica o componente dentro do módulo.
 */

import { useState, useMemo, useEffect, useCallback, createContext, useContext } from 'react';
import Icone from '@/components/layout/Icone';
import estilos from './ui.module.css';

/* ==========================================================================
   Cabeçalho de página — título, subtítulo, régua e ações
   ========================================================================== */

export function TituloPagina({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className={estilos.cabecalho}>
      <div className={estilos.cabecalhoTexto}>
        <h1 className="page-title">{titulo}</h1>
        <hr className="rule" />
        {subtitulo && <p className="page-subtitle">{subtitulo}</p>}
      </div>
      {acoes && <div className={estilos.cabecalhoAcoes}>{acoes}</div>}
    </div>
  );
}

/* ==========================================================================
   Card de métrica
   ========================================================================== */

export function CardMetrica({
  rotulo,
  valor,
  detalhe,
  icone,
  tom,
}: {
  rotulo: string;
  /**
   * O valor já formatado. Passe `null` quando o número ainda não tem origem
   * definida — o card mostra um estado vazio honesto em vez de inventar.
   */
  valor: string | null;
  detalhe?: string;
  icone?: string;
  tom?: 'positivo' | 'negativo';
}) {
  const classeTom =
    tom === 'positivo' ? estilos.metricaPositiva : tom === 'negativo' ? estilos.metricaNegativa : '';

  return (
    <div className={estilos.metrica}>
      <div className={estilos.metricaTopo}>
        <span className={estilos.metricaRotulo}>{rotulo}</span>
        {icone && (
          <span className={estilos.metricaIcone}>
            <Icone nome={icone} tamanho={18} />
          </span>
        )}
      </div>

      {valor === null ? (
        <span className={estilos.metricaValorVazio}>Sem dados — aguardando integração</span>
      ) : (
        <span className={`${estilos.metricaValor} ${classeTom}`}>{valor}</span>
      )}

      {detalhe && <span className={estilos.metricaDetalhe}>{detalhe}</span>}
    </div>
  );
}

export function GradeMetricas({ children }: { children: React.ReactNode }) {
  return <div className={estilos.gradeMetricas}>{children}</div>;
}

/* ==========================================================================
   Badge de status
   ========================================================================== */

export type TomBadge = 'success' | 'warning' | 'danger' | 'info' | 'neutro';

export function Badge({ texto, tom = 'neutro' }: { texto: string; tom?: TomBadge }) {
  return <span className={`badge badge-${tom}`}>{texto}</span>;
}

/* ==========================================================================
   Barra de filtros
   ========================================================================== */

export function BarraFiltros({ children }: { children: React.ReactNode }) {
  return <div className={estilos.filtros}>{children}</div>;
}

export function CampoFiltro({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{rotulo}</label>
      {children}
    </div>
  );
}

export function AcoesFiltro({ children }: { children: React.ReactNode }) {
  return <div className={estilos.filtrosAcoes}>{children}</div>;
}

/* ==========================================================================
   Tabela — ordenação e paginação embutidas
   ========================================================================== */

export type Coluna<T> = {
  chave: string;
  rotulo: string;
  /** Como renderizar a célula. Sem isto, mostra o campo cru. */
  render?: (registro: T) => React.ReactNode;
  /** Valor usado na ordenação. Sem isto, a coluna não ordena. */
  ordenarPor?: (registro: T) => string | number;
  /** Alinha à direita e usa numerais tabulares. */
  numerico?: boolean;
};

export function Tabela<T extends { id: string }>({
  colunas,
  registros,
  porPagina = 10,
  aoClicarLinha,
  mensagemVazio = 'Nenhum registro encontrado.',
  carregando = false,
}: {
  colunas: Coluna<T>[];
  registros: T[];
  porPagina?: number;
  aoClicarLinha?: (registro: T) => void;
  mensagemVazio?: string;
  carregando?: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState<{ chave: string; asc: boolean } | null>(null);

  // Filtrar muda o total de páginas; voltar ao início evita página vazia.
  useEffect(() => {
    setPagina(1);
  }, [registros.length]);

  const ordenados = useMemo(() => {
    if (!ordem) return registros;
    const coluna = colunas.find((c) => c.chave === ordem.chave);
    if (!coluna?.ordenarPor) return registros;

    return [...registros].sort((a, b) => {
      const va = coluna.ordenarPor!(a);
      const vb = coluna.ordenarPor!(b);
      const comparacao =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'pt-BR');
      return ordem.asc ? comparacao : -comparacao;
    });
  }, [registros, ordem, colunas]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * porPagina;
  const visiveis = ordenados.slice(inicio, inicio + porPagina);

  function alternarOrdem(chave: string) {
    setOrdem((atual) =>
      atual?.chave === chave ? { chave, asc: !atual.asc } : { chave, asc: true },
    );
  }

  if (carregando) {
    return <div className={estilos.carregando}>Carregando registros…</div>;
  }

  if (registros.length === 0) {
    return (
      <div className="card">
        <div className="estado-vazio">
          <strong>Nada por aqui</strong>
          {mensagemVazio}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={estilos.tabelaEnvolucro}>
        <table>
          <thead>
            <tr>
              {colunas.map((coluna) => (
                <th
                  key={coluna.chave}
                  className={coluna.ordenarPor ? estilos.thOrdenavel : undefined}
                  onClick={coluna.ordenarPor ? () => alternarOrdem(coluna.chave) : undefined}
                  style={coluna.numerico ? { textAlign: 'right' } : undefined}
                >
                  {coluna.rotulo}
                  {ordem?.chave === coluna.chave && (
                    <span className={estilos.setaOrdem}>{ordem.asc ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((registro) => (
              <tr
                key={registro.id}
                onClick={aoClicarLinha ? () => aoClicarLinha(registro) : undefined}
                style={aoClicarLinha ? { cursor: 'pointer' } : undefined}
              >
                {colunas.map((coluna) => (
                  <td key={coluna.chave} className={coluna.numerico ? 'numerico' : undefined}>
                    {coluna.render
                      ? coluna.render(registro)
                      : String((registro as Record<string, unknown>)[coluna.chave] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className={estilos.paginacao}>
          <span>
            Exibindo {inicio + 1}–{Math.min(inicio + porPagina, ordenados.length)} de{' '}
            {ordenados.length} registros
          </span>
          <div className={estilos.paginacaoBotoes}>
            <button
              type="button"
              className={estilos.botaoPagina}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaSegura === 1}
            >
              Anterior
            </button>
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`${estilos.botaoPagina} ${n === paginaSegura ? estilos.paginaAtual : ''}`}
                onClick={() => setPagina(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className={estilos.botaoPagina}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaSegura === totalPaginas}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ==========================================================================
   Modal
   ========================================================================== */

export function Modal({
  titulo,
  aberto,
  aoFechar,
  children,
  rodape,
  largo = false,
}: {
  titulo: string;
  aberto: boolean;
  aoFechar: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  largo?: boolean;
}) {
  // Esc fecha; enquanto aberto, o fundo não rola.
  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar();
    }

    document.addEventListener('keydown', aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      className={estilos.modalFundo}
      onClick={aoFechar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className={`${estilos.modal} ${largo ? estilos.modalLargo : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={estilos.modalCabecalho}>
          <h2 className={estilos.modalTitulo}>{titulo}</h2>
          <button type="button" className={estilos.modalFechar} onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" tamanho={20} />
          </button>
        </div>
        <div className={estilos.modalCorpo}>{children}</div>
        {rodape && <div className={estilos.modalRodape}>{rodape}</div>}
      </div>
    </div>
  );
}

/* ==========================================================================
   Toast
   ========================================================================== */

type Toast = { id: string; texto: string; tom: 'sucesso' | 'erro' | 'aviso' | 'info' };

const ContextoToast = createContext<{
  mostrar: (texto: string, tom?: Toast['tom']) => void;
}>({ mostrar: () => {} });

export function useToast() {
  return useContext(ContextoToast);
}

export function ProvedorToast({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remover = useCallback((id: string) => {
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const mostrar = useCallback(
    (texto: string, tom: Toast['tom'] = 'info') => {
      const id = `${Date.now()}${Math.random()}`;
      setToasts((atuais) => [...atuais, { id, texto, tom }]);
      setTimeout(() => remover(id), 4500);
    },
    [remover],
  );

  return (
    <ContextoToast.Provider value={{ mostrar }}>
      {children}
      <div className={estilos.pilhaToast}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${estilos.toast} ${
              t.tom === 'sucesso'
                ? estilos.toastSucesso
                : t.tom === 'erro'
                  ? estilos.toastErro
                  : t.tom === 'aviso'
                    ? estilos.toastAviso
                    : ''
            }`}
            role="status"
          >
            <span className={estilos.toastTexto}>{t.texto}</span>
            <button
              type="button"
              className={estilos.toastFechar}
              onClick={() => remover(t.id)}
              aria-label="Fechar aviso"
            >
              <Icone nome="fechar" tamanho={15} />
            </button>
          </div>
        ))}
      </div>
    </ContextoToast.Provider>
  );
}

/* ==========================================================================
   Abas
   ========================================================================== */

export function Abas({
  abas,
  ativa,
  aoTrocar,
}: {
  abas: { chave: string; rotulo: string }[];
  ativa: string;
  aoTrocar: (chave: string) => void;
}) {
  return (
    <div className={estilos.abas} role="tablist">
      {abas.map((aba) => (
        <button
          key={aba.chave}
          type="button"
          role="tab"
          aria-selected={ativa === aba.chave}
          className={`${estilos.aba} ${ativa === aba.chave ? estilos.abaAtiva : ''}`}
          onClick={() => aoTrocar(aba.chave)}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  );
}

/* ==========================================================================
   Estado vazio
   ========================================================================== */

export function EstadoVazio({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="card">
      <div className="estado-vazio">
        <strong>{titulo}</strong>
        {descricao}
      </div>
    </div>
  );
}
