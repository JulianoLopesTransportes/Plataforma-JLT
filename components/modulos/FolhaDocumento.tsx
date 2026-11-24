'use client';

/**
 * FOLHA DE DOCUMENTO — a apresentação impressa, compartilhada.
 *
 * Extraída do módulo Documentos para que a Agenda gere a ordem de
 * serviço no mesmo padrão visual. Sem isso, ela teria uma cópia do
 * cabeçalho, do rodapé e das réguas — e as duas divergiriam no primeiro
 * ajuste de identidade.
 *
 * Recebe blocos prontos de lib/negocio/documentos e apenas os desenha.
 */

import Image from 'next/image';
import { EMPRESA, type BlocoDocumento, type Trecho } from '@/lib/negocio/documentos';
import type { ItemInventario } from '@/lib/tipos';
import { formatarBRL } from '@/lib/utils/formato';
import estilos from './folha-documento.module.css';

export default function FolhaDocumento({
  titulo,
  subtitulo,
  selo,
  blocos,
  clienteNome,
  clienteDocumento,
  inventario = [],
}: {
  titulo: string;
  subtitulo?: string;
  selo?: string;
  blocos: BlocoDocumento[];
  clienteNome: string;
  clienteDocumento: string;
  /**
   * Os itens do inventário, JÁ com o ambiente em cada linha.
   *
   * Era `Record<nomeDoItem, quantidade>`, com o ambiente deduzido do
   * catálogo — e isso tinha um defeito calado: cinco nomes aparecem em
   * mais de um ambiente, e "Caixa grande" está em quatro. O documento
   * imprimia a MESMA quantidade sob cada um deles, de modo que quem
   * declarava 4 caixas assinava um papel listando 16. Com o ambiente na
   * linha, cada item sai uma vez só, onde o cliente o colocou.
   */
  inventario?: ItemInventario[];
}) {
  return (
    <article className={estilos.folha}>
      <Cabecalho titulo={titulo} subtitulo={subtitulo} selo={selo} />

      {blocos.map((bloco, i) => (
        <Bloco
          key={i}
          bloco={bloco}
          inventario={inventario}
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
            width={200}
            height={127}
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
  inventario,
  clienteNome,
  clienteDocumento,
}: {
  bloco: BlocoDocumento;
  inventario: ItemInventario[];
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
      return <TabelaItens inventario={inventario} />;

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

function TabelaItens({ inventario }: { inventario: ItemInventario[] }) {
  const linhas = inventario.filter((i) => i.quantidade > 0);

  if (linhas.length === 0) {
    return (
      <p className={estilos.aviso}>
        Nenhum item selecionado — marque as quantidades no painel ao lado.
      </p>
    );
  }

  const volumes = linhas.reduce((s, i) => s + i.quantidade, 0);
  const valor = linhas.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  /*
   * A coluna de dinheiro só aparece quando há dinheiro declarado.
   *
   * A cláusula 7.1 calcula a indenização sobre o valor INDIVIDUAL do bem,
   * então o valor por item é o que faz ela ser aplicável. Mas o
   * inventário tirado em branco, para preencher a caneta na casa do
   * cliente, não deve carregar uma coluna de "R$ 0,00" em toda linha.
   */
  const comValor = linhas.some((i) => i.valorUnitario > 0);

  // Agrupa preservando a ordem de chegada — quem monta a lista decide.
  const grupos = new Map<string, ItemInventario[]>();
  for (const i of linhas) {
    const chave = i.ambiente || 'Sem ambiente';
    grupos.set(chave, [...(grupos.get(chave) ?? []), i]);
  }

  return (
    <>
      {[...grupos].map(([ambiente, itensDoAmbiente]) => (
        <div key={ambiente} className={estilos.blocoAmbiente}>
          <h3 className={estilos.nomeAmbiente}>{ambiente}</h3>
          <table className={estilos.tabelaDocumento}>
            <tbody>
              {itensDoAmbiente.map((i) => (
                <tr key={`${ambiente}-${i.item}`}>
                  <td>{i.item}</td>
                  <td className={estilos.quantidadeCelula}>{i.quantidade}</td>
                  {comValor && (
                    <td className={estilos.valorCelula}>
                      {i.valorUnitario > 0 ? formatarBRL(i.quantidade * i.valorUnitario) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className={estilos.totalInventario}>
        Total de volumes declarados: <strong>{volumes}</strong>
        {comValor && (
          <>
            {' · '}Valor total declarado: <strong>{formatarBRL(valor)}</strong>
          </>
        )}
      </p>
    </>
  );
}
