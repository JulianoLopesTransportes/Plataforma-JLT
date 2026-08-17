'use client';

/**
 * DOCUMENTOS — migrado de referencia/02-documentos_10.html
 *
 * Seis geradores: orçamento, contrato, inventário, guarda-móveis,
 * autorização de imagem e comprovante de entrega. O texto das cláusulas
 * vive em lib/negocio/documentos.ts.
 *
 * A pré-visualização é o próprio documento: `window.print()` imprime só o
 * painel de preview, porque a moldura da plataforma carrega a classe
 * `sem-impressao` (ver regra @media print em globals.css).
 */

import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar } from '@/lib/permissoes';
import { formatarBRL, formatarData, dataPorExtenso, hojeISO } from '@/lib/utils/formato';
import {
  TIPOS_DOCUMENTO,
  NOME_ARQUIVO,
  EMPRESA,
  SERVICOS_INCLUSOS,
  clausulasContratoMudanca,
  type TipoDocumento,
} from '@/lib/negocio/documentos';
import { TituloPagina, CampoFiltro, useToast } from '@/components/ui';
import type { Cliente } from '@/lib/tipos';
import catalogoItens from '@/mock/catalogo-itens.json';
import estilos from './documentos.module.css';

const CATALOGO = catalogoItens as Record<string, string[]>;

export default function PaginaDocumentos() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipo, setTipo] = useState<TipoDocumento>('orcamento');
  const [clienteId, setClienteId] = useState('');
  const [valor, setValor] = useState('');
  const [validadeDias, setValidadeDias] = useState('15');
  const [seguroIncluso, setSeguroIncluso] = useState(true);
  const [servicosMarcados, setServicosMarcados] = useState<string[]>(SERVICOS_INCLUSOS);
  const [observacoes, setObservacoes] = useState('');
  const [itensInventario, setItensInventario] = useState<Record<string, number>>({});
  const [ambienteAberto, setAmbienteAberto] = useState<string>(Object.keys(CATALOGO)[0]);

  const podeMexer = podeEditar(usuario.nivel, 'documentos');

  useEffect(() => {
    api.clientes.listar().then(setClientes);
  }, []);

  const cliente = clientes.find((c) => c.id === clienteId) ?? null;

  const totalItens = useMemo(
    () => Object.values(itensInventario).reduce((s, q) => s + q, 0),
    [itensInventario],
  );

  function mudarQuantidade(item: string, delta: number) {
    setItensInventario((atual) => {
      const nova = (atual[item] ?? 0) + delta;
      const copia = { ...atual };
      if (nova <= 0) delete copia[item];
      else copia[item] = nova;
      return copia;
    });
  }

  function alternarServico(servico: string) {
    setServicosMarcados((atual) =>
      atual.includes(servico) ? atual.filter((s) => s !== servico) : [...atual, servico],
    );
  }

  function imprimir() {
    if (!cliente) {
      mostrar('Selecione um cliente antes de gerar o documento.', 'erro');
      return;
    }
    // O título da janela vira o nome sugerido do PDF no diálogo de impressão.
    const tituloAnterior = document.title;
    document.title = `${NOME_ARQUIVO[tipo]}-${cliente.nome.replace(/\s+/g, '-')}`;
    window.print();
    document.title = tituloAnterior;
  }

  const hoje = hojeISO();
  const validade = validadeDias ? Number(validadeDias) : 0;

  return (
    <>
      <div className="sem-impressao">
        <TituloPagina
          titulo="Documentos"
          subtitulo="Geração de orçamentos, contratos, inventários e comprovantes."
          acoes={
            <button
              type="button"
              className="btn btn-primary"
              onClick={imprimir}
              disabled={!podeMexer || !cliente}
              title={
                !podeMexer
                  ? 'Seu nível não permite gerar documentos'
                  : !cliente
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

          {(tipo === 'orcamento' || tipo === 'contrato' || tipo === 'guarda') && (
            <>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="valor">Valor do serviço (R$)</label>
                <input
                  id="valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                />
              </div>

              <div className="field" style={{ marginTop: 16 }}>
                <label className="field-check">
                  <input
                    type="checkbox"
                    checked={seguroIncluso}
                    onChange={(e) => setSeguroIncluso(e.target.checked)}
                  />
                  Seguro de carga incluso
                </label>
              </div>
            </>
          )}

          {tipo === 'orcamento' && (
            <>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="validade">Validade da proposta (dias)</label>
                <input
                  id="validade"
                  type="number"
                  min="1"
                  value={validadeDias}
                  onChange={(e) => setValidadeDias(e.target.value)}
                />
              </div>

              <h3 className={estilos.subtitulo}>Serviços inclusos</h3>
              {SERVICOS_INCLUSOS.map((s) => (
                <label key={s} className={`field-check ${estilos.linhaServico}`}>
                  <input
                    type="checkbox"
                    checked={servicosMarcados.includes(s)}
                    onChange={() => alternarServico(s)}
                  />
                  {s}
                </label>
              ))}
            </>
          )}

          {tipo === 'inventario' && (
            <>
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

          <div className="field" style={{ marginTop: 20 }}>
            <label htmlFor="obs">Observações</label>
            <textarea
              id="obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Condições específicas deste documento…"
            />
          </div>
        </div>

        {/* ================= Pré-visualização ================= */}
        <div className={estilos.previa}>
          {!cliente ? (
            <div className="card sem-impressao">
              <div className="estado-vazio">
                <strong>Selecione um cliente</strong>
                O documento é montado com os dados do cliente escolhido ao lado.
              </div>
            </div>
          ) : (
            <article className={estilos.folha}>
              <CabecalhoDocumento />

              <h1 className={estilos.tituloDocumento}>
                {TIPOS_DOCUMENTO.find((t) => t.id === tipo)?.rotulo}
              </h1>

              <section className={estilos.secao}>
                <h2 className={estilos.secaoTitulo}>Identificação das Partes</h2>
                <p>
                  <strong>CONTRATADA:</strong> {EMPRESA.razaoSocial}, CNPJ {EMPRESA.cnpj},
                  estabelecida em {EMPRESA.endereco}.
                </p>
                <p>
                  <strong>CONTRATANTE:</strong> {cliente.nome},{' '}
                  {cliente.tipo === 'PF' ? 'CPF' : 'CNPJ'} {cliente.documento}, telefone{' '}
                  {cliente.telefone}
                  {cliente.email ? `, e-mail ${cliente.email}` : ''}.
                </p>
              </section>

              {(tipo === 'orcamento' || tipo === 'contrato' || tipo === 'comprovante') && (
                <section className={estilos.secao}>
                  <h2 className={estilos.secaoTitulo}>Endereços</h2>
                  <p>
                    <strong>Coleta:</strong> {cliente.enderecoColeta || 'A definir'}
                  </p>
                  <p>
                    <strong>Entrega:</strong> {cliente.enderecoEntrega || 'A definir'}
                  </p>
                  {cliente.dataPrevista && (
                    <p>
                      <strong>Data prevista:</strong> {formatarData(cliente.dataPrevista)}
                    </p>
                  )}
                  {cliente.volumeM3 && (
                    <p>
                      <strong>Volume estimado:</strong> {cliente.volumeM3} m³
                    </p>
                  )}
                </section>
              )}

              {/* ---------- Orçamento ---------- */}
              {tipo === 'orcamento' && (
                <>
                  <section className={estilos.secao}>
                    <h2 className={estilos.secaoTitulo}>Serviços inclusos</h2>
                    <ul className={estilos.listaServicos}>
                      {SERVICOS_INCLUSOS.map((s) => (
                        <li key={s}>
                          {servicosMarcados.includes(s) ? '☑' : '☐'} {s}
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className={estilos.secao}>
                    <h2 className={estilos.secaoTitulo}>Condições financeiras</h2>
                    <p className={estilos.valorDestaque}>
                      Valor total: {valor ? formatarBRL(Number(valor.replace(',', '.'))) : '—'}
                    </p>
                    <p>
                      Seguro de carga: {seguroIncluso ? 'incluso' : 'não incluso'}.
                    </p>
                    <p>
                      Pagamento: sinal de 10% (mínimo R$ 500) na assinatura, 50% do saldo no
                      carregamento e o restante antes do descarregamento.
                    </p>
                  </section>

                  <section className={estilos.secao}>
                    <h2 className={estilos.secaoTitulo}>Validade e condições gerais</h2>
                    <p>
                      Esta proposta é válida por {validade} dias a contar de{' '}
                      {dataPorExtenso(hoje)}.
                    </p>
                    <p>
                      Valores sujeitos a confirmação após vistoria presencial do volume e das
                      condições de acesso.
                    </p>
                  </section>
                </>
              )}

              {/* ---------- Contrato ---------- */}
              {tipo === 'contrato' &&
                clausulasContratoMudanca(seguroIncluso).map((clausula) => (
                  <section key={clausula.titulo} className={estilos.secao}>
                    <h2 className={estilos.secaoTitulo}>{clausula.titulo}</h2>
                    {clausula.itens.map((item) => (
                      <p key={item.numero}>
                        <strong>{item.numero}</strong> {item.texto}
                      </p>
                    ))}
                  </section>
                ))}

              {/* ---------- Inventário ---------- */}
              {tipo === 'inventario' && (
                <section className={estilos.secao}>
                  <h2 className={estilos.secaoTitulo}>Relação de bens</h2>

                  {totalItens === 0 ? (
                    <p className={estilos.aviso}>
                      Nenhum item selecionado — marque as quantidades no painel ao lado.
                    </p>
                  ) : (
                    <>
                      {Object.entries(CATALOGO).map(([ambiente, itens]) => {
                        const doAmbiente = itens.filter((i) => itensInventario[i]);
                        if (doAmbiente.length === 0) return null;

                        return (
                          <div key={ambiente} className={estilos.blocoAmbiente}>
                            <h3 className={estilos.nomeAmbiente}>{ambiente}</h3>
                            <table className={estilos.tabelaDocumento}>
                              <tbody>
                                {doAmbiente.map((item) => (
                                  <tr key={item}>
                                    <td>{item}</td>
                                    <td className={estilos.quantidadeCelula}>
                                      {itensInventario[item]}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}

                      <p className={estilos.totalInventario}>
                        Total de volumes declarados: <strong>{totalItens}</strong>
                      </p>
                    </>
                  )}
                </section>
              )}

              {/* ---------- Guarda-móveis ---------- */}
              {tipo === 'guarda' && (
                <section className={estilos.secao}>
                  <h2 className={estilos.secaoTitulo}>Objeto do depósito</h2>
                  <p>
                    <strong>1.1.</strong> A CONTRATADA recebe em depósito os bens do CONTRATANTE
                    relacionados no inventário anexo, obrigando-se a guardá-los e conservá-los.
                  </p>
                  <p>
                    <strong>1.2.</strong> Valor mensal do serviço:{' '}
                    {valor ? formatarBRL(Number(valor.replace(',', '.'))) : '—'}.
                  </p>
                  <p>
                    <strong>1.3.</strong> Seguro dos bens: {seguroIncluso ? '☑' : '☐'} INCLUSO
                    {'   /   '}
                    {seguroIncluso ? '☐' : '☑'} NÃO INCLUSO.
                  </p>
                  <p>
                    <strong>1.4.</strong> A retirada dos bens depende de quitação das mensalidades
                    vencidas e de aviso prévio de 5 dias úteis.
                  </p>
                </section>
              )}

              {/* ---------- Autorização de imagem ---------- */}
              {tipo === 'imagem' && (
                <section className={estilos.secao}>
                  <h2 className={estilos.secaoTitulo}>Autorização</h2>
                  <p>
                    Pelo presente instrumento, {cliente.nome}, inscrito sob o documento{' '}
                    {cliente.documento}, autoriza a {EMPRESA.razaoSocial} a utilizar imagens
                    captadas durante a execução do serviço de mudança, para fins de divulgação
                    institucional em redes sociais, site e materiais impressos.
                  </p>
                  <p>
                    A presente autorização é concedida a título gratuito, por prazo indeterminado,
                    e pode ser revogada por comunicação escrita do CONTRATANTE.
                  </p>
                </section>
              )}

              {/* ---------- Comprovante ---------- */}
              {tipo === 'comprovante' && (
                <section className={estilos.secao}>
                  <h2 className={estilos.secaoTitulo}>Declaração de recebimento</h2>
                  <p>
                    Declaro que os bens relacionados no inventário foram entregues no endereço de
                    destino em {dataPorExtenso(hoje)}, nas condições abaixo assinaladas.
                  </p>
                  <p>☐ Entrega concluída sem avarias.</p>
                  <p>☐ Entrega concluída com ressalvas (descrever abaixo).</p>
                  <div className={estilos.campoRessalva}>Ressalvas:</div>
                </section>
              )}

              {observacoes && (
                <section className={estilos.secao}>
                  <h2 className={estilos.secaoTitulo}>Observações</h2>
                  <p>{observacoes}</p>
                </section>
              )}

              {/* ---------- Assinaturas ---------- */}
              <section className={estilos.assinaturas}>
                <p className={estilos.localData}>
                  {EMPRESA.endereco}, {dataPorExtenso(hoje)}.
                </p>

                <div className={estilos.linhasAssinatura}>
                  <div>
                    <div className={estilos.linha} />
                    <span>{EMPRESA.razaoSocial}</span>
                    <small>CONTRATADA</small>
                  </div>
                  <div>
                    <div className={estilos.linha} />
                    <span>{cliente.nome}</span>
                    <small>CONTRATANTE</small>
                  </div>
                </div>
              </section>

              <footer className={estilos.rodapeDocumento}>
                {EMPRESA.razaoSocial} — {EMPRESA.telefone} — {EMPRESA.email} — {EMPRESA.site}
              </footer>
            </article>
          )}
        </div>
      </div>
    </>
  );
}

function CabecalhoDocumento() {
  return (
    <header className={estilos.cabecalhoDocumento}>
      <div>
        <strong>{EMPRESA.razaoSocial}</strong>
        <span>CNPJ {EMPRESA.cnpj}</span>
      </div>
      <div className={estilos.contatoCabecalho}>
        <span>{EMPRESA.telefone}</span>
        <span>{EMPRESA.email}</span>
      </div>
    </header>
  );
}
