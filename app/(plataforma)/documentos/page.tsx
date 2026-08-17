'use client';

/**
 * DOCUMENTOS — migrado de referencia/02-documentos_10.html
 *
 * Os seis geradores, com o texto jurídico integral do módulo original.
 * O conteúdo vive em lib/negocio/documentos.ts, que devolve uma lista de
 * blocos; esta tela só coleta os campos e desenha os blocos.
 *
 * A pré-visualização é o próprio documento: `window.print()` imprime só a
 * folha, porque a moldura da plataforma some no @media print.
 */

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { api } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar } from '@/lib/permissoes';
import { formatarBRL, hojeISO, paraNumero } from '@/lib/utils/formato';
import {
  TIPOS_DOCUMENTO,
  TITULO_DOCUMENTO,
  NOME_ARQUIVO,
  EMPRESA,
  ENDERECO_SEDE,
  SERVICOS_INCLUSOS,
  ABRANGENCIA_IMAGEM,
  FINALIDADES_IMAGEM,
  gerarOrcamento,
  gerarContrato,
  gerarInventario,
  gerarGuarda,
  gerarImagem,
  gerarComprovante,
  type TipoDocumento,
  type BlocoDocumento,
  type DadosCliente,
  type Trecho,
} from '@/lib/negocio/documentos';
import { TituloPagina, CampoFiltro, useToast } from '@/components/ui';
import type { Cliente } from '@/lib/tipos';
import catalogoItens from '@/mock/catalogo-itens.json';
import estilos from './documentos.module.css';

const CATALOGO = catalogoItens as Record<string, string[]>;

/** Quebra um textarea em linhas úteis — usado nos campos livres. */
function linhas(texto: string): string[] {
  return texto.split('\n').map((l) => l.trim()).filter(Boolean);
}

export default function PaginaDocumentos() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipo, setTipo] = useState<TipoDocumento>('orcamento');
  const [clienteId, setClienteId] = useState('');

  // --- Campos comuns e por documento ---
  const [valor, setValor] = useState('');
  const [seguroIncluso, setSeguroIncluso] = useState(true);

  const [validadeDias, setValidadeDias] = useState('15');
  const [dataColeta, setDataColeta] = useState('');
  const [servicosMarcados, setServicosMarcados] = useState<string[]>(SERVICOS_INCLUSOS);
  const [outrosServicos, setOutrosServicos] = useState('');

  const [dataExecucao, setDataExecucao] = useState('');
  const [dataContrato, setDataContrato] = useState(hojeISO());
  const [clausulasAdicionais, setClausulasAdicionais] = useState('');

  const [dataInventario, setDataInventario] = useState(hojeISO());
  const [valorDeclarado, setValorDeclarado] = useState('');
  const [metragem, setMetragem] = useState('');
  const [observacao, setObservacao] = useState('');

  const [diaVencimento, setDiaVencimento] = useState('10');
  const [prazoMeses, setPrazoMeses] = useState('');
  const [enderecoDeposito, setEnderecoDeposito] = useState(ENDERECO_SEDE);
  const [dataInicio, setDataInicio] = useState(hojeISO());

  const [abrangencia, setAbrangencia] = useState<string[]>(['pessoal']);
  const [finalidades, setFinalidades] = useState<string[]>(['redes']);
  const [prazoImagem, setPrazoImagem] = useState('Por prazo indeterminado.');

  const [dataEntrega, setDataEntrega] = useState(hojeISO());
  const [recebedor, setRecebedor] = useState('');
  const [ressalvas, setRessalvas] = useState('');

  // --- Inventário de itens ---
  const [itensInventario, setItensInventario] = useState<Record<string, number>>({});
  const [ambienteAberto, setAmbienteAberto] = useState<string>(Object.keys(CATALOGO)[0]);

  const podeMexer = podeEditar(usuario.nivel, 'documentos');

  useEffect(() => {
    api.clientes.listar().then(setClientes);
  }, []);

  const clienteSelecionado = clientes.find((c) => c.id === clienteId) ?? null;

  // Preenche o inventário e a data prevista a partir do cliente escolhido.
  useEffect(() => {
    if (clienteSelecionado?.dataPrevista) {
      setDataColeta(clienteSelecionado.dataPrevista);
      setDataExecucao(clienteSelecionado.dataPrevista);
    }
    if (clienteSelecionado?.volumeM3) {
      setMetragem(String(clienteSelecionado.volumeM3));
    }
  }, [clienteSelecionado]);

  const dadosCliente: DadosCliente | null = clienteSelecionado
    ? {
        nome: clienteSelecionado.nome,
        tipoPessoa: clienteSelecionado.tipo,
        documento: clienteSelecionado.documento,
        telefone: clienteSelecionado.telefone,
        email: clienteSelecionado.email,
        enderecoColeta: clienteSelecionado.enderecoColeta,
        enderecoEntrega: clienteSelecionado.enderecoEntrega,
      }
    : null;

  const totalItens = useMemo(
    () => Object.values(itensInventario).reduce((s, q) => s + q, 0),
    [itensInventario],
  );

  /* --- Blocos do documento -------------------------------------------- */
  const blocos: BlocoDocumento[] = useMemo(() => {
    if (!dadosCliente) return [];

    switch (tipo) {
      case 'orcamento':
        return gerarOrcamento({
          cliente: dadosCliente,
          validadeDias: Number(validadeDias) || 15,
          valorTotal: valor ? paraNumero(valor) : null,
          dataColeta,
          servicosMarcados,
          outrosServicos: linhas(outrosServicos),
        });

      case 'contrato':
        return gerarContrato({
          cliente: dadosCliente,
          valorTotal: valor ? paraNumero(valor) : null,
          seguroIncluso,
          dataExecucao,
          dataContrato,
          clausulasAdicionais: linhas(clausulasAdicionais),
        });

      case 'inventario':
        return gerarInventario({
          cliente: dadosCliente,
          data: dataInventario,
          valorTotalDeclarado: valorDeclarado ? paraNumero(valorDeclarado) : null,
          metragem,
          observacao,
        });

      case 'guarda':
        return gerarGuarda({
          cliente: dadosCliente,
          valorMensal: valor ? paraNumero(valor) : null,
          diaVencimento,
          metragem,
          prazoMeses,
          seguroIncluso,
          enderecoDeposito,
          dataInicio,
          valorTotalDeclarado: valorDeclarado ? paraNumero(valorDeclarado) : null,
        });

      case 'imagem':
        return gerarImagem({
          cliente: dadosCliente,
          abrangencia,
          finalidades,
          prazo: prazoImagem,
        });

      case 'comprovante':
        return gerarComprovante({
          cliente: dadosCliente,
          dataEntrega,
          recebedor,
          ressalvas,
        });
    }
  }, [
    tipo, dadosCliente, validadeDias, valor, dataColeta, servicosMarcados, outrosServicos,
    seguroIncluso, dataExecucao, dataContrato, clausulasAdicionais, dataInventario,
    valorDeclarado, metragem, observacao, diaVencimento, prazoMeses, enderecoDeposito,
    dataInicio, abrangencia, finalidades, prazoImagem, dataEntrega, recebedor, ressalvas,
  ]);

  function alternar(lista: string[], set: (v: string[]) => void, item: string) {
    set(lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item]);
  }

  function mudarQuantidade(item: string, delta: number) {
    setItensInventario((atual) => {
      const nova = (atual[item] ?? 0) + delta;
      const copia = { ...atual };
      if (nova <= 0) delete copia[item];
      else copia[item] = nova;
      return copia;
    });
  }

  function imprimir() {
    if (!dadosCliente) {
      mostrar('Selecione um cliente antes de gerar o documento.', 'erro');
      return;
    }
    const tituloAnterior = document.title;
    document.title = `${NOME_ARQUIVO[tipo]}-${dadosCliente.nome.replace(/\s+/g, '-')}`;
    window.print();
    document.title = tituloAnterior;
  }

  const usaInventario = tipo === 'inventario' || tipo === 'guarda';
  const usaValor = tipo === 'orcamento' || tipo === 'contrato' || tipo === 'guarda';

  return (
    <>
      <div className="sem-impressao">
        <TituloPagina
          titulo="Documentos"
          subtitulo="Orçamentos, contratos, inventários e comprovantes com o texto oficial da empresa."
          acoes={
            <button
              type="button"
              className="btn btn-primary"
              onClick={imprimir}
              disabled={!podeMexer || !dadosCliente}
              title={
                !podeMexer
                  ? 'Seu nível não permite gerar documentos'
                  : !dadosCliente
                    ? 'Selecione um cliente'
                    : undefined
              }
            >
              Imprimir / salvar PDF
            </button>
          }
        />
      </div>

      <div className={estilos.grade}>
        {/* ================= Painel de configuração ================= */}
        <div className={`card sem-impressao ${estilos.painel}`}>
          <h2 className="card-title">Configuração</h2>

          <div className={estilos.tiposDocumento}>
            {TIPOS_DOCUMENTO.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${estilos.tipoBotao} ${tipo === t.id ? estilos.tipoAtivo : ''}`}
                onClick={() => setTipo(t.id)}
                title={t.descricao}
              >
                {t.rotulo}
              </button>
            ))}
          </div>

          <p className="field-hint" style={{ marginBottom: 20 }}>
            {TIPOS_DOCUMENTO.find((t) => t.id === tipo)?.descricao}
          </p>

          <CampoFiltro rotulo="Cliente">
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Selecione um cliente…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </CampoFiltro>

          {usaValor && (
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="valor">
                {tipo === 'guarda' ? 'Valor mensal (R$)' : 'Valor total do serviço (R$)'}
              </label>
              <input
                id="valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
              {valor && (
                <p className="field-hint">
                  Sinal de {formatarBRL(Math.max(paraNumero(valor) * 0.1, 500))} (10%, mínimo R$
                  500)
                </p>
              )}
            </div>
          )}

          {(tipo === 'contrato' || tipo === 'guarda') && (
            <div className="field" style={{ marginTop: 16 }}>
              <label className="field-check">
                <input
                  type="checkbox"
                  checked={seguroIncluso}
                  onChange={(e) => setSeguroIncluso(e.target.checked)}
                />
                Seguro {tipo === 'guarda' ? 'dos bens' : 'de carga'} incluso
              </label>
            </div>
          )}

          {/* ---------- Orçamento ---------- */}
          {tipo === 'orcamento' && (
            <>
              <div className="form-row" style={{ marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="validade">Validade (dias)</label>
                  <input
                    id="validade"
                    type="number"
                    min="1"
                    value={validadeDias}
                    onChange={(e) => setValidadeDias(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="dataColeta">Data prevista de coleta</label>
                  <input
                    id="dataColeta"
                    type="date"
                    value={dataColeta}
                    onChange={(e) => setDataColeta(e.target.value)}
                  />
                </div>
              </div>

              <h3 className={estilos.subtitulo}>Serviços inclusos</h3>
              {SERVICOS_INCLUSOS.map((s) => (
                <label key={s} className={`field-check ${estilos.linhaServico}`}>
                  <input
                    type="checkbox"
                    checked={servicosMarcados.includes(s)}
                    onChange={() => alternar(servicosMarcados, setServicosMarcados, s)}
                  />
                  {s}
                </label>
              ))}

              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="outros">Outros serviços (um por linha)</label>
                <textarea
                  id="outros"
                  value={outrosServicos}
                  onChange={(e) => setOutrosServicos(e.target.value)}
                  placeholder="Içamento por sacada&#10;Guarda-móveis por 30 dias"
                />
              </div>
            </>
          )}

          {/* ---------- Contrato ---------- */}
          {tipo === 'contrato' && (
            <>
              <div className="form-row" style={{ marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="dataExec">Data prevista de execução</label>
                  <input
                    id="dataExec"
                    type="date"
                    value={dataExecucao}
                    onChange={(e) => setDataExecucao(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="dataCtr">Data do contrato</label>
                  <input
                    id="dataCtr"
                    type="date"
                    value={dataContrato}
                    onChange={(e) => setDataContrato(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="clausulas">Cláusulas adicionais (uma por linha)</label>
                <textarea
                  id="clausulas"
                  value={clausulasAdicionais}
                  onChange={(e) => setClausulasAdicionais(e.target.value)}
                  placeholder="Entram como seção própria, depois da Cláusula 13."
                />
              </div>
            </>
          )}

          {/* ---------- Guarda-móveis ---------- */}
          {tipo === 'guarda' && (
            <>
              <div className="form-row-3" style={{ marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="venc">Dia do vencimento</label>
                  <input
                    id="venc"
                    type="number"
                    min="1"
                    max="31"
                    value={diaVencimento}
                    onChange={(e) => setDiaVencimento(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="prazo">Prazo (meses)</label>
                  <input
                    id="prazo"
                    type="number"
                    min="1"
                    value={prazoMeses}
                    onChange={(e) => setPrazoMeses(e.target.value)}
                    placeholder="Vazio = indeterminado"
                  />
                </div>
                <div className="field">
                  <label htmlFor="dataIni">Início</label>
                  <input
                    id="dataIni"
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="deposito">Endereço do depósito</label>
                <input
                  id="deposito"
                  value={enderecoDeposito}
                  onChange={(e) => setEnderecoDeposito(e.target.value)}
                />
              </div>
            </>
          )}

          {/* ---------- Autorização de imagem ---------- */}
          {tipo === 'imagem' && (
            <>
              <h3 className={estilos.subtitulo}>Abrangência</h3>
              {ABRANGENCIA_IMAGEM.map((a) => (
                <label key={a.id} className={`field-check ${estilos.linhaServico}`}>
                  <input
                    type="checkbox"
                    checked={abrangencia.includes(a.id)}
                    onChange={() => alternar(abrangencia, setAbrangencia, a.id)}
                  />
                  {a.rotulo}
                </label>
              ))}

              <h3 className={estilos.subtitulo}>Finalidades</h3>
              {FINALIDADES_IMAGEM.map((f) => (
                <label key={f.id} className={`field-check ${estilos.linhaServico}`}>
                  <input
                    type="checkbox"
                    checked={finalidades.includes(f.id)}
                    onChange={() => alternar(finalidades, setFinalidades, f.id)}
                  />
                  {f.rotulo}
                </label>
              ))}

              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="prazoImg">Prazo da autorização</label>
                <input
                  id="prazoImg"
                  value={prazoImagem}
                  onChange={(e) => setPrazoImagem(e.target.value)}
                />
              </div>
            </>
          )}

          {/* ---------- Comprovante ---------- */}
          {tipo === 'comprovante' && (
            <>
              <div className="form-row" style={{ marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="dataEnt">Data da entrega</label>
                  <input
                    id="dataEnt"
                    type="date"
                    value={dataEntrega}
                    onChange={(e) => setDataEntrega(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="receb">Quem recebeu</label>
                  <input
                    id="receb"
                    value={recebedor}
                    onChange={(e) => setRecebedor(e.target.value)}
                    placeholder="Vazio = o próprio cliente"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="ress">Ressalvas</label>
                <textarea
                  id="ress"
                  value={ressalvas}
                  onChange={(e) => setRessalvas(e.target.value)}
                  placeholder="Vazio imprime: “Não foram registradas ressalvas no ato da entrega.”"
                />
              </div>
            </>
          )}

          {/* ---------- Inventário de itens ---------- */}
          {usaInventario && (
            <>
              <div className="form-row-3" style={{ marginTop: 16 }}>
                {tipo === 'inventario' && (
                  <div className="field">
                    <label htmlFor="dataInv">Data</label>
                    <input
                      id="dataInv"
                      type="date"
                      value={dataInventario}
                      onChange={(e) => setDataInventario(e.target.value)}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="valorDecl">Valor declarado (R$)</label>
                  <input
                    id="valorDecl"
                    inputMode="decimal"
                    value={valorDeclarado}
                    onChange={(e) => setValorDeclarado(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="field">
                  <label htmlFor="metr">Metragem (m³)</label>
                  <input
                    id="metr"
                    inputMode="decimal"
                    value={metragem}
                    onChange={(e) => setMetragem(e.target.value)}
                  />
                </div>
              </div>

              {tipo === 'inventario' && (
                <div className="field">
                  <label htmlFor="obs">Observação</label>
                  <textarea
                    id="obs"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                  />
                </div>
              )}

              <h3 className={estilos.subtitulo}>
                Itens por ambiente
                {totalItens > 0 && <span className={estilos.contador}>{totalItens}</span>}
              </h3>

              <div className={estilos.abasAmbiente}>
                {Object.keys(CATALOGO).map((ambiente) => (
                  <button
                    key={ambiente}
                    type="button"
                    className={`${estilos.abaAmbiente} ${
                      ambienteAberto === ambiente ? estilos.abaAmbienteAtiva : ''
                    }`}
                    onClick={() => setAmbienteAberto(ambiente)}
                  >
                    {ambiente}
                  </button>
                ))}
              </div>

              <div className={estilos.listaItens}>
                {CATALOGO[ambienteAberto]?.map((item) => (
                  <div key={item} className={estilos.linhaItem}>
                    <span className={estilos.nomeItem}>{item}</span>
                    <div className={estilos.controleQuantidade}>
                      <button
                        type="button"
                        onClick={() => mudarQuantidade(item, -1)}
                        disabled={!itensInventario[item]}
                        aria-label={`Remover um ${item}`}
                      >
                        −
                      </button>
                      <span>{itensInventario[item] ?? 0}</span>
                      <button
                        type="button"
                        onClick={() => mudarQuantidade(item, 1)}
                        aria-label={`Adicionar um ${item}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ================= Pré-visualização ================= */}
        <div className={estilos.previa}>
          {!dadosCliente ? (
            <div className="card sem-impressao">
              <div className="estado-vazio">
                <strong>Selecione um cliente</strong>
                O documento é montado com os dados do cliente escolhido ao lado.
              </div>
            </div>
          ) : (
            <article className={estilos.folha}>
              <CabecalhoDocumento
                titulo={TITULO_DOCUMENTO[tipo]}
                selo={tipo === 'orcamento' ? `Válido por ${validadeDias} dias` : undefined}
              />

              {blocos.map((bloco, i) => (
                <Bloco
                  key={i}
                  bloco={bloco}
                  itens={itensInventario}
                  clienteNome={dadosCliente.nome}
                  clienteDocumento={dadosCliente.documento}
                />
              ))}

              <footer className={estilos.rodapeDocumento}>
                {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj} · Documento gerado em{' '}
                {new Date().toLocaleDateString('pt-BR')}
              </footer>
            </article>
          )}
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   Renderização dos blocos
   ========================================================================== */

function Bloco({
  bloco,
  itens,
  clienteNome,
  clienteDocumento,
}: {
  bloco: BlocoDocumento;
  itens: Record<string, number>;
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

    case 'tabelaItens':
      return <TabelaItens itens={itens} />;

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

/** Renderiza um trecho, preservando quebras de linha internas. */
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

function TabelaItens({ itens }: { itens: Record<string, number> }) {
  const total = Object.values(itens).reduce((s, q) => s + q, 0);

  if (total === 0) {
    return (
      <p className={estilos.aviso}>
        Nenhum item selecionado — marque as quantidades no painel ao lado.
      </p>
    );
  }

  return (
    <>
      {Object.entries(CATALOGO).map(([ambiente, listaItens]) => {
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

function CabecalhoDocumento({ titulo, selo }: { titulo: string; selo?: string }) {
  return (
    <>
      <header className={estilos.cabecalhoDocumento}>
        <div className={estilos.marcaDocumento}>
          <Image
            src="/logo-jlt.png"
            alt={EMPRESA.nomeFantasia}
            width={160}
            height={107}
            className={estilos.logoDocumento}
          />
          <small>CNPJ: {EMPRESA.cnpj}</small>
        </div>
        <div className={estilos.contatoCabecalho}>
          <span>{EMPRESA.email}</span>
          <span>
            {EMPRESA.telefone} · {EMPRESA.telefoneSecundario}
          </span>
        </div>
      </header>

      <hr className={estilos.reguaDocumento} />

      <div className={estilos.caixaTitulo}>
        <h1 className={estilos.tituloDocumento}>{titulo}</h1>
        {selo && <div className={estilos.selo}>{selo}</div>}
      </div>
    </>
  );
}
