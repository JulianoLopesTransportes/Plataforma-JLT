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

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar } from '@/lib/permissoes';
import { formatarBRL, formatarNumero, hojeISO, paraNumero } from '@/lib/utils/formato';
import {
  TIPOS_DOCUMENTO,
  TITULO_DOCUMENTO,
  type TipoMudanca,
  NOME_ARQUIVO,
  ENDERECO_DEPOSITO,
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
} from '@/lib/negocio/documentos';
import { TituloPagina, CampoFiltro, useToast } from '@/components/ui';
import FolhaDocumento from '@/components/modulos/FolhaDocumento';
import type { Cliente, ItemInventario } from '@/lib/tipos';
import catalogoItens from '@/mock/catalogo-itens.json';
import estilos from './documentos.module.css';

/** Legenda sob a faixa do título, como no modelo em uso pela empresa. */
const SUBTITULO_DOCUMENTO: Record<TipoDocumento, string> = {
  orcamento: 'Proposta comercial de transporte e mudança',
  contrato: 'Contrato de prestação de serviços de transporte terrestre de mudança',
  inventario: 'Relação de bens transportados',
  guarda: 'Contrato de prestação de serviços de guarda-móveis',
  imagem: 'Autorização de uso de imagem',
  comprovante: 'Recibo de conclusão de serviço',
  // A ordem de serviço não é oferecida aqui: nasce de um compromisso, na Agenda.
  ordemServico: 'Ordem de serviço da equipe',
};

/*
 * Valor do seletor que significa "não é cliente cadastrado".
 *
 * Um valor sentinela, e não string vazia: vazio já quer dizer "ainda não
 * escolhi", e os dois estados precisam ser distinguíveis — um mostra
 * "selecione um cliente", o outro abre o campo de nome.
 */
const AVULSO = '__avulso__';

const CATALOGO = catalogoItens as Record<string, string[]>;

/** Ambiente onde entram os itens digitados à mão, fora do catálogo. */
const AMBIENTE_MANUAL = 'Outros itens';

/**
 * A chave de uma linha do inventário: ambiente + item.
 *
 * Era só o nome do item, e cinco nomes do catálogo aparecem em mais de um
 * ambiente — "Caixa grande" está em quatro. Com a chave antiga, marcar 4
 * caixas na cozinha fazia as mesmas 4 aparecerem na sala, no quarto e na
 * sala de jantar, e o documento listava 16. A chave composta é a mesma do
 * `unique (cliente_id, ambiente, item)` da migration 53 e a mesma da
 * página que o cliente preenche.
 */
const SEP = '\u0001';
const chaveDe = (ambiente: string, item: string) => `${ambiente}${SEP}${item}`;

/** Uma linha do painel. O valor fica como TEXTO, do jeito que foi digitado. */
type LinhaInventario = { quantidade: number; valor: string };

/** Quebra um textarea em linhas úteis — usado nos campos livres. */
function linhas(texto: string): string[] {
  return texto.split('\n').map((l) => l.trim()).filter(Boolean);
}

/*
 * Suspense em volta porque o conteúdo usa useSearchParams — a tela
 * precisa do ?cliente=<id>&tipo=inventario que a ficha manda ao clicar em
 * "Gerar documento". Sem a fronteira, a prerrenderização estática da rota
 * quebra. Mesmo molde de Orçamentos e Rotas.
 */
export default function PaginaDocumentos() {
  return (
    <Suspense fallback={<TituloPagina titulo="Documentos" subtitulo="Carregando…" />}>
      <ConteudoDocumentos />
    </Suspense>
  );
}

function ConteudoDocumentos() {
  const usuario = useUsuario();
  const { mostrar } = useToast();
  const parametrosUrl = useSearchParams();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipo, setTipo] = useState<TipoDocumento>('orcamento');
  const [clienteId, setClienteId] = useState('');

  /*
   * Nome digitado à mão, para documento de quem não está cadastrado.
   *
   * O resto dos campos — CPF, telefone, endereços — sai como linha em
   * branco no papel: os geradores já fazem isso por `ou()` quando o dado
   * falta. Quem atende na rua preenche à caneta.
   */
  const [nomeAvulso, setNomeAvulso] = useState('');

  // --- Campos comuns e por documento ---
  const [valor, setValor] = useState('');
  const [seguroIncluso, setSeguroIncluso] = useState(true);

  const [validadeDias, setValidadeDias] = useState('15');
  const [dataColeta, setDataColeta] = useState('');
  const [servicosMarcados, setServicosMarcados] = useState<string[]>(SERVICOS_INCLUSOS);
  const [outrosServicos, setOutrosServicos] = useState('');

  /*
   * Substituiu `dataExecucao`, que era uma data só para coleta e entrega.
   *
   * A coleta vem de `dataColeta`, compartilhada com o orçamento. Aqui fica
   * apenas a entrega prevista, que não tem equivalente em outro documento:
   * `dataEntrega` mais abaixo é a data em que o comprovante ATESTA que a
   * entrega ocorreu — fato passado, não plano.
   */
  const [dataEntregaPrevista, setDataEntregaPrevista] = useState('');
  /**
   * Exclusiva ou compartilhada. Exclusiva é o padrão porque é o serviço
   * mais vendido — e porque errar para exclusiva orça mais caro, não mais
   * barato: o engano aparece na conversa em vez de virar prejuízo.
   */
  const [tipoMudanca, setTipoMudanca] = useState<TipoMudanca>('exclusiva');
  /**
   * Saldo final depois do descarregamento e da conferência?
   *
   * `false` é o padrão — mantém o que o contrato dizia antes desta opção
   * existir, então contrato gerado sem ninguém mexer sai igual ao de
   * sempre.
   */
  const [saldoAposDescarregamento, setSaldoAposDescarregamento] = useState(false);
  const [dataContrato, setDataContrato] = useState(hojeISO());
  const [clausulasAdicionais, setClausulasAdicionais] = useState('');

  const [dataInventario, setDataInventario] = useState(hojeISO());
  const [valorDeclarado, setValorDeclarado] = useState('');
  const [metragem, setMetragem] = useState('');
  const [observacao, setObservacao] = useState('');

  const [diaVencimento, setDiaVencimento] = useState('10');
  const [enderecoDeposito, setEnderecoDeposito] = useState(ENDERECO_DEPOSITO);
  const [dataInicio, setDataInicio] = useState(hojeISO());

  const [abrangencia, setAbrangencia] = useState<string[]>(['pessoal']);
  const [finalidades, setFinalidades] = useState<string[]>(['redes']);
  const [prazoImagem, setPrazoImagem] = useState('Por prazo indeterminado.');

  const [dataEntrega, setDataEntrega] = useState(hojeISO());
  const [recebedor, setRecebedor] = useState('');
  const [ressalvas, setRessalvas] = useState('');

  // --- Inventário de itens ---
  const [itensInventario, setItensInventario] = useState<Record<string, LinhaInventario>>({});
  const [ambienteAberto, setAmbienteAberto] = useState<string>(Object.keys(CATALOGO)[0]);
  // Itens que não existem no catálogo, digitados na hora.
  const [itensManuais, setItensManuais] = useState<string[]>([]);
  const [novoItem, setNovoItem] = useState('');
  // O que o cliente preencheu pelo link, quando houver.
  const [doLink, setDoLink] = useState<ItemInventario[]>([]);

  const podeMexer = podeEditar(usuario.nivel, 'documentos');

  useEffect(() => {
    api.clientes.listar().then(setClientes);
  }, []);

  /*
   * Chegou da ficha do cliente com o inventário pronto.
   *
   * Roda uma vez, pelos parâmetros da URL — o atendente pode trocar de
   * cliente ou de tipo depois sem a tela puxá-lo de volta.
   */
  useEffect(() => {
    const id = parametrosUrl.get('cliente');
    const doUrl = parametrosUrl.get('tipo');

    if (id) setClienteId(id);
    if (doUrl && doUrl in TITULO_DOCUMENTO) setTipo(doUrl as TipoDocumento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clienteSelecionado = clientes.find((c) => c.id === clienteId) ?? null;

  // Preenche o inventário e a data prevista a partir do cliente escolhido.
  useEffect(() => {
    /*
     * Só a COLETA vem do cadastro.
     *
     * `clientes.dataPrevista` é a data da mudança — a da coleta. A entrega
     * prevista fica em branco de propósito: o cadastro não guarda essa
     * informação, e copiar a data da coleta para ela escreveria no contrato
     * um prazo de entrega que ninguém combinou.
     */
    if (clienteSelecionado?.dataPrevista) {
      setDataColeta(clienteSelecionado.dataPrevista);
    }
    if (clienteSelecionado?.volumeM3) {
      setMetragem(String(clienteSelecionado.volumeM3));
    }
  }, [clienteSelecionado]);

  /*
   * O que o cliente preencheu pelo link.
   *
   * Carregado só para OFERECER — não entra no painel sozinho. Quem já
   * marcou meia dúzia de itens à mão não deve ver o trabalho sumir ao
   * trocar de cliente.
   */
  useEffect(() => {
    if (!clienteSelecionado) {
      setDoLink([]);
      return;
    }

    let ativo = true;
    api.inventario
      .doCliente(clienteSelecionado.id)
      .then((d) => ativo && setDoLink(d.itens))
      .catch(() => ativo && setDoLink([]));

    return () => {
      ativo = false;
    };
  }, [clienteSelecionado]);

  const avulso = clienteId === AVULSO;

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
    : avulso && nomeAvulso.trim()
      ? {
          // Só o nome. Todo o resto vazio, e os geradores transformam
          // vazio em linha preenchível — inclusive o tipo de pessoa, que
          // não pode ser adivinhado dentro de um contrato.
          nome: nomeAvulso.trim(),
          tipoPessoa: null,
          documento: '',
          telefone: '',
          email: '',
          enderecoColeta: '',
          enderecoEntrega: '',
        }
      : null;

  const totalItens = useMemo(
    () => Object.values(itensInventario).reduce((s, l) => s + l.quantidade, 0),
    [itensInventario],
  );

  /**
   * O inventário no formato que o documento desenha — e que é o mesmo do
   * banco: uma linha por (ambiente, item), com quantidade e valor.
   */
  const inventarioParaDocumento = useMemo<ItemInventario[]>(() => {
    const saida: ItemInventario[] = [];
    for (const [k, linha] of Object.entries(itensInventario)) {
      if (linha.quantidade <= 0) continue;
      const corte = k.indexOf(SEP);
      saida.push({
        ambiente: k.slice(0, corte),
        item: k.slice(corte + 1),
        quantidade: linha.quantidade,
        valorUnitario: paraNumero(linha.valor),
      });
    }

    /*
     * Ordena pela ordem do CATÁLOGO, não alfabética: é a ordem em que a
     * pessoa marcou na tela e em que vai conferir o caminhão. "Outros
     * itens" vai para o fim.
     */
    const ordem = [...Object.keys(CATALOGO), AMBIENTE_MANUAL];
    return saida.sort(
      (a, b) =>
        ordem.indexOf(a.ambiente) - ordem.indexOf(b.ambiente) ||
        a.item.localeCompare(b.item, 'pt-BR'),
    );
  }, [itensInventario]);

  const valorDoInventario = useMemo(
    () => inventarioParaDocumento.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0),
    [inventarioParaDocumento],
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
          dataEntrega: dataEntregaPrevista,
          tipoMudanca,
          metragem,
          servicosMarcados,
          outrosServicos: linhas(outrosServicos),
        });

      case 'contrato':
        return gerarContrato({
          cliente: dadosCliente,
          valorTotal: valor ? paraNumero(valor) : null,
          seguroIncluso,
          dataColeta,
          dataEntrega: dataEntregaPrevista,
          saldoAposDescarregamento,
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

      default:
        // 'ordemServico' existe no tipo mas é gerada pela Agenda, não por esta tela.
        return [];
    }
  }, [
    tipo, dadosCliente, validadeDias, valor, dataColeta, servicosMarcados, outrosServicos,
    seguroIncluso, dataEntregaPrevista, dataContrato, clausulasAdicionais, dataInventario,
    valorDeclarado, metragem, tipoMudanca, saldoAposDescarregamento, observacao, diaVencimento, enderecoDeposito,
    dataInicio, abrangencia, finalidades, prazoImagem, dataEntrega, recebedor, ressalvas,
  ]);

  function alternar(lista: string[], set: (v: string[]) => void, item: string) {
    set(lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item]);
  }

  function acrescentarItemManual() {
    const nome = novoItem.trim();
    if (!nome) return;

    const jaExiste =
      itensManuais.some((i) => i.toLowerCase() === nome.toLowerCase()) ||
      Object.values(CATALOGO).flat().some((i) => i.toLowerCase() === nome.toLowerCase());

    if (jaExiste) {
      mostrar('Este item já está na lista.', 'aviso');
      setNovoItem('');
      return;
    }

    setItensManuais((lista) => [...lista, nome]);
    // Entra já com uma unidade: quem digitou quer pelo menos uma.
    setItensInventario((atual) => ({
      ...atual,
      [chaveDe(AMBIENTE_MANUAL, nome)]: { quantidade: 1, valor: '' },
    }));
    setNovoItem('');
    setAmbienteAberto(AMBIENTE_MANUAL);
  }

  function removerItemManual(nome: string) {
    setItensManuais((lista) => lista.filter((i) => i !== nome));
    setItensInventario((atual) => {
      const copia = { ...atual };
      delete copia[chaveDe(AMBIENTE_MANUAL, nome)];
      return copia;
    });
  }

  function mudarQuantidade(ambiente: string, item: string, delta: number) {
    const k = chaveDe(ambiente, item);
    setItensInventario((atual) => {
      const linha = atual[k] ?? { quantidade: 0, valor: '' };
      const nova = linha.quantidade + delta;
      const copia = { ...atual };
      // Zerar APAGA a linha, inclusive o valor digitado: deixá-lo para
      // trás faria um item com quantidade zero levar dinheiro ao total.
      if (nova <= 0) delete copia[k];
      else copia[k] = { ...linha, quantidade: nova };
      return copia;
    });
  }

  function mudarValorDoItem(ambiente: string, item: string, valor: string) {
    const k = chaveDe(ambiente, item);
    setItensInventario((atual) => ({
      ...atual,
      [k]: { quantidade: atual[k]?.quantidade ?? 1, valor },
    }));
  }

  /**
   * Traz para o painel o que o cliente preencheu pelo link.
   *
   * Substitui o que estiver na tela em vez de somar: o que o cliente
   * declarou é a versão dele do inventário, e misturar as duas listas
   * daria um papel que não é nem uma coisa nem outra.
   */
  function trazerDoLink() {
    const novo: Record<string, LinhaInventario> = {};
    const manuais: string[] = [];

    for (const i of doLink) {
      const noCatalogo = (CATALOGO[i.ambiente] ?? []).includes(i.item);
      const ambiente = noCatalogo ? i.ambiente : AMBIENTE_MANUAL;
      if (!noCatalogo) manuais.push(i.item);

      novo[chaveDe(ambiente, i.item)] = {
        quantidade: i.quantidade,
        valor: i.valorUnitario ? formatarNumero(i.valorUnitario, 2) : '',
      };
    }

    setItensInventario(novo);
    setItensManuais(manuais);
    mostrar(`${doLink.length} itens trazidos do que o cliente preencheu.`);
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



          <CampoFiltro rotulo="Cliente">
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Selecione um cliente…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nome}
                </option>
              ))}
              <option value={AVULSO}>— Avulso, sem cadastro —</option>
            </select>
          </CampoFiltro>

          {avulso && (
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="nomeAvulso">Nome de quem recebe o documento</label>
              <input
                id="nomeAvulso"
                value={nomeAvulso}
                onChange={(e) => setNomeAvulso(e.target.value)}
                placeholder="Maria da Silva Rezende"
              />

            </div>
          )}

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
                  <label htmlFor="dataColeta">Data prevista para coleta</label>
                  <input
                    id="dataColeta"
                    type="date"
                    value={dataColeta}
                    onChange={(e) => setDataColeta(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-3">
                <div className="field">
                  <label htmlFor="tipoMudanca">Tipo de mudança</label>
                  <select
                    id="tipoMudanca"
                    value={tipoMudanca}
                    onChange={(e) => setTipoMudanca(e.target.value as TipoMudanca)}
                  >
                    <option value="exclusiva">Exclusiva</option>
                    <option value="compartilhada">Compartilhada</option>
                  </select>

                </div>
                <div className="field">
                  <label htmlFor="metrOrc">Metragem aproximada (m³)</label>
                  <input
                    id="metrOrc"
                    inputMode="decimal"
                    value={metragem}
                    onChange={(e) => setMetragem(e.target.value)}
                  />

                </div>
                <div className="field">
                  <label htmlFor="dataEntregaOrc">Data prevista para entrega</label>
                  <input
                    id="dataEntregaOrc"
                    type="date"
                    value={dataEntregaPrevista}
                    onChange={(e) => setDataEntregaPrevista(e.target.value)}
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
              <div className="form-row-3" style={{ marginTop: 16 }}>
                {/*
                  Reaproveita `dataColeta`, o mesmo estado que o orçamento
                  usa: "quando a coleta acontece" é a mesma informação nos
                  dois documentos, e dois campos separados para isso só
                  criariam chance de divergirem.
                */}
                <div className="field">
                  <label htmlFor="dataColetaCtr">Data prevista para coleta</label>
                  <input
                    id="dataColetaCtr"
                    type="date"
                    value={dataColeta}
                    onChange={(e) => setDataColeta(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="dataEntregaCtr">Data prevista para entrega</label>
                  <input
                    id="dataEntregaCtr"
                    type="date"
                    value={dataEntregaPrevista}
                    onChange={(e) => setDataEntregaPrevista(e.target.value)}
                  />

                </div>
                <div className="field">
                  <label htmlFor="saldoQuando">Saldo final</label>
                  <select
                    id="saldoQuando"
                    value={saldoAposDescarregamento ? 'depois' : 'antes'}
                    onChange={(e) => setSaldoAposDescarregamento(e.target.value === 'depois')}
                  >
                    <option value="antes">Antes do descarregamento</option>
                    <option value="depois">Depois do descarregamento e conferência</option>
                  </select>

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
              <div className="form-row" style={{ marginTop: 16 }}>
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
                {valorDoInventario > 0 && (
                  <span className={estilos.valorInventario}>
                    {formatarBRL(valorDoInventario)}
                  </span>
                )}
              </h3>

              {doLink.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={trazerDoLink}
                >
                  Trazer os {doLink.length} itens que o cliente preencheu
                </button>
              )}

              <div className={estilos.abasAmbiente}>
                {[...Object.keys(CATALOGO), AMBIENTE_MANUAL].map((ambiente) => (
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

              {ambienteAberto === AMBIENTE_MANUAL && (
                <div className={estilos.adicionarItem}>
                  <input
                    value={novoItem}
                    onChange={(e) => setNovoItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // Sem isto, o Enter enviaria o formulário do documento.
                        e.preventDefault();
                        acrescentarItemManual();
                      }
                    }}
                    placeholder="Item fora do catálogo…"
                    aria-label="Novo item do inventário"
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={acrescentarItemManual}
                    disabled={!novoItem.trim()}
                  >
                    Acrescentar
                  </button>
                </div>
              )}

              <div className={estilos.listaItens}>
                {(ambienteAberto === AMBIENTE_MANUAL
                  ? itensManuais
                  : (CATALOGO[ambienteAberto] ?? [])
                ).map((item) => {
                  const linha = itensInventario[chaveDe(ambienteAberto, item)];
                  const quantidade = linha?.quantidade ?? 0;

                  return (
                    <div key={item} className={estilos.linhaItem}>
                      <span className={estilos.nomeItem}>{item}</span>

                      {/* O campo de valor só aparece depois de haver o que
                          valorar — 153 campos vazios na tela seriam ruído. */}
                      {quantidade > 0 && (
                        <div className={estilos.valorDoItem}>
                          <span>R$</span>
                          <input
                            inputMode="decimal"
                            value={linha?.valor ?? ''}
                            onChange={(e) =>
                              mudarValorDoItem(ambienteAberto, item, e.target.value)
                            }
                            placeholder="0,00"
                            aria-label={`Valor da unidade de ${item}`}
                          />
                        </div>
                      )}

                      <div className={estilos.controleQuantidade}>
                        <button
                          type="button"
                          onClick={() => mudarQuantidade(ambienteAberto, item, -1)}
                          disabled={quantidade <= 0}
                          aria-label={`Remover um ${item}`}
                        >
                          −
                        </button>
                        <span>{quantidade}</span>
                        <button
                          type="button"
                          onClick={() => mudarQuantidade(ambienteAberto, item, 1)}
                          aria-label={`Adicionar um ${item}`}
                        >
                          +
                        </button>

                        {ambienteAberto === AMBIENTE_MANUAL && (
                          <button
                            type="button"
                            className={estilos.removerItem}
                            onClick={() => removerItemManual(item)}
                            aria-label={`Remover ${item} da lista`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {ambienteAberto === AMBIENTE_MANUAL && itensManuais.length === 0 && (
                  <p className={estilos.listaVazia}>
                    Nenhum item digitado. Use o campo acima para o que não está no catálogo.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ================= Pré-visualização ================= */}
        <div className={estilos.previa}>
          {!dadosCliente ? (
            <div className="card sem-impressao">
              <div className="estado-vazio">
                <strong>{avulso ? 'Informe o nome' : 'Selecione um cliente'}</strong>
                {avulso
                  ? 'O documento sai com o nome informado e linhas em branco no resto.'
                  : 'Escolha um cliente cadastrado, ou "Avulso" para gerar sem cadastro.'}
              </div>
            </div>
          ) : (
            <FolhaDocumento
              titulo={TITULO_DOCUMENTO[tipo]}
              subtitulo={SUBTITULO_DOCUMENTO[tipo]}
              selo={tipo === 'orcamento' ? `Válido por ${validadeDias} dias` : undefined}
              blocos={blocos}
              clienteNome={dadosCliente.nome}
              clienteDocumento={dadosCliente.documento}
              inventario={inventarioParaDocumento}
            />
          )}
        </div>
      </div>
    </>
  );
}

