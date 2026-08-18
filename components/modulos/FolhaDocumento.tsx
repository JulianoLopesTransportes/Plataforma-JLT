'use client';

/**
 * FOLHA DE DOCUMENTO — a apresentação impressa, compartilhada.
 *
 * Extraída do módulo Documentos para que a Agenda gere a ficha de
 * atendimento no mesmo padrão visual. Sem isso, a ficha teria uma cópia do
 * cabeçalho, do rodapé e das réguas — e as duas divergiriam no primeiro
 * ajuste de identidade.
 *
 * Recebe blocos prontos de lib/negocio/documentos e apenas os desenha.
 */

import Image from 'next/image';
import { EMPRESA, type BlocoDocumento, type Trecho } from '@/lib/negocio/documentos';
import estilos from './folha-documento.module.css';

/** Catálogo de itens, para agrupar o inventário por ambiente. */
type Catalogo = Record<string, string[]>;

export default function FolhaDocumento({
  titulo,
  subtitulo,
  selo,
  blocos,
  clienteNome,
  clienteDocumento,
  itens = {},
  itensManuais = [],
  catalogo = {},
  ambienteManual = 'Outros itens',
}: {
  titulo: string;
  subtitulo?: string;
  selo?: string;
  blocos: BlocoDocumento[];
  clienteNome: string;
  clienteDocumento: string;
  itens?: Record<string, number>;
  itensManuais?: string[];
  catalogo?: Catalogo;
  ambienteManual?: string;
}) {
  return (
    <article className={estilos.folha}>
      <Cabecalho titulo={titulo} subtitulo={subtitulo} selo={selo} />

      {blocos.map((bloco, i) => (
        <Bloco
          key={i}
          bloco={bloco}
          itens={itens}
          itensManuais={itensManuais}
          catalogo={catalogo}
          ambienteManual={ambienteManual}
          clienteNome={clienteNome}
          clienteDocumento={clienteDocumento}
        />
      ))}

      <footer className={estilos.rodapeDocumento}>
        {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj} · Documento gerado em{' '}
        {new Date().toLocaleDateString('pt-BR')}
      </footer>
    </article>
  );
}

/* ==========================================================================
   Cabeçalho
   ========================================================================== */

function Cabecalho({
  titulo,
  subtitulo,
  selo,
}: {
  titulo: string;
  subtitulo?: string;
  selo?: string;
}) {
  return (
    <>
      <header className={estilos.cabecalhoDocumento}>
        <div className={estilos.marcaDocumento}>
          <Image
            src="/logo-jlt.png"
            alt={EMPRESA.nomeFantasia}
            width={235}
            height={108}
            priority
            className={estilos.logoDocumento}
          />
        </div>

        <div className={estilos.contatoCabecalho}>
          <span>{EMPRESA.email}</span>
          <span>
            {EMPRESA.telefone} · {EMPRESA.telefoneSecundario}
          </span>
          <small>CNPJ: {EMPRESA.cnpj}</small>
        </div>
      </header>

      <hr className={estilos.reguaDocumento} />

      <div className={estilos.caixaTitulo}>
        <h1 className={estilos.tituloDocumento}>{titulo}</h1>
        {selo && <div className={estilos.selo}>{selo}</div>}
      </div>

      {subtitulo && <p className={estilos.subtituloDocumento}>{subtitulo}</p>}
    </>
  );
}

/* ==========================================================================
   Blocos
   ========================================================================== */

function Bloco({
  bloco,
  itens,
  itensManuais,
  catalogo,
  ambienteManual,
  clienteNome,
  clienteDocumento,
}: {
  bloco: BlocoDocumento;
  itens: Record<string, number>;
  itensManuais: string[];
  catalogo: Catalogo;
  ambienteManual: string;
  clienteNome: string;
  clienteDocumento: string;
}) {
  switch (bloco.tipo) {
    case 'secao':
      return <h2 className={estilos.secaoTitulo}>{bloco.titulo}</h2>;

    case 'paragrafo':
      return <p className={estilos.paragrafo}>{bloco.partes.map(renderTrecho)}</p>;

    case 'lista':
      return bloco.itens.length === 0 ? null : (
        <ul className={estilos.lista}>
          {bloco.itens.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );

    case 'nota':
      return <p className={estilos.nota}>{bloco.texto}</p>;

    case 'quebraPagina':
      return <div className={estilos.quebraPagina} />;

    case 'linhasEmBranco':
      return (
        <div className={estilos.linhasEmBranco}>
          {Array.from({ length: bloco.quantidade }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      );

    case 'tabelaItens':
      return (
        <TabelaItens
          itens={itens}
          itensManuais={itensManuais}
          catalogo={catalogo}
          ambienteManual={ambienteManual}
        />
      );

    case 'assinaturas':
      return (
        <div className={estilos.assinaturas}>
          <div>
            <div className={estilos.linhaAssinatura} />
            <span>{bloco.rotuloContratante}</span>
            <small>{clienteNome}</small>
            <small>CPF/CNPJ: {clienteDocumento || '____________________'}</small>
          </div>
          <div>
            <div className={estilos.linhaAssinatura} />
            <span>CONTRATADA</span>
            <small>{EMPRESA.razaoSocial}</small>
            <small>CNPJ: {EMPRESA.cnpj}</small>
          </div>
        </div>
      );
  }
}

/** Renderiza um trecho, preservando as quebras de linha internas. */
function renderTrecho(trecho: Trecho, i: number) {
  if (typeof trecho === 'string') {
    return trecho.split('\n').map((linha, j, todas) => (
      <span key={`${i}-${j}`}>
        {linha}
        {j < todas.length - 1 && <br />}
      </span>
    ));
  }
  if ('b' in trecho) return <strong key={i}>{trecho.b}</strong>;
  return <em key={i}>{trecho.i}</em>;
}

/* ==========================================================================
   Inventário
   ========================================================================== */

function TabelaItens({
  itens,
  itensManuais,
  catalogo,
  ambienteManual,
}: {
  itens: Record<string, number>;
  itensManuais: string[];
  catalogo: Catalogo;
  ambienteManual: string;
}) {
  const total = Object.values(itens).reduce((s, q) => s + q, 0);

  if (total === 0) {
    return (
      <p className={estilos.aviso}>
        Nenhum item selecionado — marque as quantidades no painel ao lado.
      </p>
    );
  }

  const grupos: [string, string[]][] = [
    ...Object.entries(catalogo),
    [ambienteManual, itensManuais],
  ];

  return (
    <>
      {grupos.map(([ambiente, listaItens]) => {
        const doAmbiente = listaItens.filter((i) => itens[i]);
        if (doAmbiente.length === 0) return null;

        return (
          <div key={ambiente} className={estilos.blocoAmbiente}>
            <h3 className={estilos.nomeAmbiente}>{ambiente}</h3>
            <table className={estilos.tabelaDocumento}>
              <tbody>
                {doAmbiente.map((item) => (
                  <tr key={item}>
                    <td>{item}</td>
                    <td className={estilos.quantidadeCelula}>{itens[item]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <p className={estilos.totalInventario}>
        Total de volumes declarados: <strong>{total}</strong>
      </p>
    </>
  );
}
