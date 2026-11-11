'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type ParametrosPrecificacao } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeFazer } from '@/lib/permissoes';
import { formatarBRL, formatarData } from '@/lib/utils/formato';
import {
  calcularOrcamento,
  margemDoFator,
  fatorDaMargem,
  descreverFator,
  FATOR_MAX,
  FATOR_MIN,
  FATOR_PASSO,
  type ResultadoOrcamento,
} from '@/lib/negocio/precificacao';
import { TituloPagina, useToast } from '@/components/ui';
import {
  valorDoOrcamento,
  STATUS_ORCAMENTO,
  type Cliente,
  type Orcamento,
  type StatusOrcamento,
} from '@/lib/tipos';
import PainelPrecificacao from '@/components/modulos/PainelPrecificacao';
import estilos from './orcamentos.module.css';

/** Rótulo legível do status. Record: status novo sem rótulo não compila. */
const ROTULO_ORCAMENTO: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
};

export default function PaginaOrcamentos() {
  const usuario = useUsuario();
  const { mostrar } = useToast();
  const router = useRouter();
  const parametrosUrl = useSearchParams();

  const [parametros, setParametros] = useState<ParametrosPrecificacao | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [volume, setVolume] = useState('');
  const [distancia, setDistancia] = useState('');
  const [fator, setFator] = useState(5);
  /*
      * Quantidade como TEXTO, não número.
      *
      * Guardando número, marcar um serviço escrevia 1 no campo e era
      * preciso apagar esse 1 antes de digitar. Guardando o texto cru, o
      * campo nasce vazio e aceita o valor direto.
      *
      * Vazio continua valendo 1 no cálculo — mesma regra que
      * preco_do_orcamento() já aplica no banco com coalesce(nullif(...)).
      */
     const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoOrcamento | null>(null);

  /*
   * Preço de quem NÃO vê custo, vindo pronto do banco.
   *
   * Separado de `resultado` de propósito. Para esse usuário as visões
   * devolvem valor nulo — que vira 0 na conversão — então calcular aqui
   * produziria um preço errado e baixo, sem nada indicando o erro. Manter
   * os dois caminhos em variáveis distintas torna impossível exibir por
   * engano um número calculado com valores zerados.
   */
  const [precoSemCusto, setPrecoSemCusto] = useState<number | null>(null);
  const [calculando, setCalculando] = useState(false);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [vinculando, setVinculando] = useState(false);

  /** null = calculando um orçamento novo; id = corrigindo um gravado. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /*
   * Valor negociado como TEXTO, pelo mesmo motivo das quantidades: o campo
   * precisa nascer vazio, e vazio significa "não houve negociação" — que é
   * diferente de zero.
   */
  const [valorNegociado, setValorNegociado] = useState('');

  const [lista, setLista] = useState<Orcamento[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');

  const verCustos = podeFazer(usuario.nivel, 'ver_custos');
  const editarParametros = podeFazer(usuario.nivel, 'editar_parametros_precificacao');
  const podeExcluirOrcamento = podeFazer(usuario.nivel, 'excluir');

  useEffect(() => {
    api.clientes.listar().then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    api.orcamentos.parametros().then((p) => {
      setParametros(p);
      setFator(fatorDaMargem((p.margemMinima + p.margemMaxima) / 2, p.margemMinima, p.margemMaxima));
      setCarregando(false);
    });
  }, []);

  const recarregarLista = useCallback(async () => {
    try {
      setLista(await api.orcamentos.listar());
    } catch {
      setLista([]);
    } finally {
      setCarregandoLista(false);
    }
  }, []);

  useEffect(() => {
    recarregarLista();
  }, [recarregarLista]);

  /*
   * Carrega um orçamento na calculadora quando a ficha do cliente manda
   * `?editar=<id>`.
   *
   * Espera `parametros`: o fator é derivado da margem gravada pela faixa
   * mínima/máxima, e sem a faixa a régua cairia num lugar errado — um
   * preço diferente do que foi orçado, sem nada avisando.
   */
  useEffect(() => {
    const id = parametrosUrl.get('editar');
    if (!id || !parametros || editandoId === id) return;

    api.orcamentos
      .obter(id)
      .then((o) => {
        if (!o) {
          mostrar('Orçamento não encontrado.', 'erro');
          return;
        }
        setEditandoId(o.id);
        setClienteId(o.clienteId);
        setVolume(String(o.volumeM3));
        setDistancia(String(o.distanciaKm));
        setValorNegociado(o.valorNegociado === null ? '' : String(o.valorNegociado));
        setQuantidades(
          Object.fromEntries(o.adicionais.map((a) => [a.id, String(a.quantidade)])),
        );
        /*
         * Sem ver_custos a margem volta nula da visão, e derivar o fator
         * dela jogaria a régua para o extremo. Nesse caso a régua fica
         * onde está e a tela diz que ela não foi restaurada.
         */
        if (verCustos && o.margemPercentual) {
          setFator(
            fatorDaMargem(o.margemPercentual, parametros.margemMinima, parametros.margemMaxima),
          );
        }
        setResultado(null);
        setPrecoSemCusto(null);
      })
      .catch((e) => mostrar(e instanceof Error ? e.message : 'Falha ao abrir o orçamento.', 'erro'));
  }, [parametrosUrl, parametros, editandoId, verCustos, mostrar]);

  const margem = parametros
    ? margemDoFator(fator, parametros.margemMinima, parametros.margemMaxima)
    : 0;

  const clienteEscolhido = clientes.find((c) => c.id === clienteId) ?? null;

  /**
   * Escolher o cliente traz o volume do cadastro, se o campo estiver vazio.
   *
   * Só se estiver vazio: o volume digitado aqui pode ser uma reavaliação
   * mais recente que a do cadastro, e sobrescrever apagaria o trabalho de
   * quem acabou de medir.
   */
  function escolherCliente(id: string) {
    setClienteId(id);

    const c = clientes.find((x) => x.id === id);
    if (c?.volumeM3 && !volume.trim()) setVolume(String(c.volumeM3));
  }

  /**
   * Grava o cálculo: cria um orçamento novo, ou corrige o que está aberto.
   *
   * Orçamento novo nasce 'rascunho' — vincular é registrar o que foi
   * calculado, não afirmar que o cliente aceitou. Corrigir NÃO mexe no
   * status: um orçamento aprovado que teve o valor ajustado continua
   * aprovado, e rebaixá-lo em silêncio tiraria a venda do faturamento.
   */
  async function salvarOrcamento() {
    if (!resultado || !clienteEscolhido) return;

    const adicionais = Object.keys(quantidades).map((adicionalId) => ({
      adicionalId,
      quantidade: quantidadeDe(adicionalId),
    }));

    /* Campo vazio = sem negociação, e isso é `null`, não zero. */
    const negociado = valorNegociado.trim()
      ? Number(valorNegociado.replace(',', '.')) || null
      : null;

    setVinculando(true);
    try {
      if (editandoId) {
        await api.orcamentos.atualizar({
          id: editandoId,
          volumeM3: Number(volume) || 0,
          distanciaKm: Number(distancia) || 0,
          custoBase: resultado.custoTotal,
          margemPercentual: resultado.margemPercentual,
          valorFinal: resultado.precoRedondo,
          valorNegociado: negociado,
          adicionais,
        });
        mostrar(`Orçamento de ${clienteEscolhido.nome} corrigido.`, 'sucesso');
      } else {
        const id = await api.orcamentos.criar({
          clienteId: clienteEscolhido.id,
          volumeM3: Number(volume) || 0,
          distanciaKm: Number(distancia) || 0,
          custoBase: resultado.custoTotal,
          margemPercentual: resultado.margemPercentual,
          valorFinal: resultado.precoRedondo,
          observacoes: '',
          adicionais,
        });

        /* O negociado não cabe no criar_orcamento da migration 29; quando
           preenchido, entra num segundo passo pela função de correção. */
        if (negociado !== null) {
          await api.orcamentos.atualizar({ id, valorNegociado: negociado });
        }

        mostrar(
          `Orçamento vinculado a ${clienteEscolhido.nome}. Está na ficha dele, em Clientes.`,
          'sucesso',
        );
      }

      await recarregarLista();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao gravar o orçamento.', 'erro');
    } finally {
      setVinculando(false);
    }
  }

  /** Abandona a correção e devolve a tela ao estado de orçamento novo. */
  function sairDaEdicao() {
    setEditandoId(null);
    setValorNegociado('');
    setQuantidades({});
    setVolume('');
    setDistancia('');
    setResultado(null);
    setPrecoSemCusto(null);
    router.replace('/orcamentos');
  }

  async function mudarStatus(o: Orcamento, status: StatusOrcamento) {
    if (status === 'aprovado') {
      const outro = lista.find(
        (x) => x.status === 'aprovado' && x.clienteId === o.clienteId && x.id !== o.id,
      );
      if (
        outro &&
        !confirm(
          `${o.clienteNome} já tem um orçamento aprovado de ${formatarBRL(valorDoOrcamento(outro))}.\n\n` +
            'Aprovar este vai RECUSAR aquele — um cliente só pode ter um aprovado, senão o ' +
            'faturamento conta a receita duas vezes.\n\nContinuar?',
        )
      ) {
        return;
      }
    }

    try {
      await api.orcamentos.mudarStatus(o.id, status);
      await recarregarLista();
      mostrar(`Orçamento marcado como ${status}.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao mudar o status.', 'erro');
    }
  }

  async function excluirOrcamento(o: Orcamento) {
    if (!confirm(`Excluir o orçamento de ${o.clienteNome}, ${formatarBRL(valorDoOrcamento(o))}?`))
      return;
    try {
      await api.orcamentos.excluir(o.id);
      if (editandoId === o.id) sairDaEdicao();
      await recarregarLista();
      mostrar('Orçamento excluído.', 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao excluir.', 'erro');
    }
  }

  const listaFiltrada = useMemo(
    () =>
      lista.filter(
        (o) =>
          (!filtroStatus || o.status === filtroStatus) &&
          (!filtroCliente || o.clienteId === filtroCliente),
      ),
    [lista, filtroStatus, filtroCliente],
  );

  function alternarAdicional(id: string) {
    setQuantidades((atual) => {
      const copia = { ...atual };
      if (id in copia) delete copia[id];
      // Vazio, e não '1': o campo abre pronto para receber o número.
      else copia[id] = '';
      return copia;
    });
  }

  function mudarQuantidade(id: string, texto: string) {
    // Só dígitos. O campo é number, mas colar texto ou usar o teclado do
    // celular ainda entrega coisa que não é número.
    setQuantidades((atual) => ({ ...atual, [id]: texto.replace(/[^0-9]/g, '') }));
  }

  /** Quantidade para o cálculo: vazio e zero valem 1. */
  function quantidadeDe(id: string): number {
    return Number(quantidades[id]) || 1;
  }

  async function calcular() {
    if (!parametros) return;

    const volumeNum = Number(volume);
    if (!volumeNum || volumeNum <= 0) {
      mostrar('Informe o volume estimado para calcular.', 'erro');
      return;
    }

    /*
     * Sem `ver_custos`, a conta roda no banco e volta só o valor final.
     * É a mesma matemática — portada para SQL na migration 33 e conferida
     * contra esta em 29 casos de borda —, mas a composição nunca sai do
     * Postgres.
     */
    if (!verCustos) {
      setCalculando(true);
      try {
        const preco = await api.orcamentos.precoDoOrcamento({
          volumeM3: volumeNum,
          distanciaKm: Number(distancia) || 0,
          fator,
          adicionais: Object.keys(quantidades).map((id) => ({
            id,
            quantidade: quantidadeDe(id),
          })),
        });

        setPrecoSemCusto(preco);
        setResultado(null);
        if (preco === null) mostrar('Não foi possível calcular com os valores informados.', 'erro');
      } catch (e) {
        mostrar(e instanceof Error ? e.message : 'Falha ao calcular o preço.', 'erro');
      } finally {
        setCalculando(false);
      }
      return;
    }

    const saida = calcularOrcamento({
      volumeM3: volumeNum,
      distanciaKm: Number(distancia) || 0,
      custoPorKm: parametros.custoPorKm,
      margemPercentual: margem,
      faixas: parametros.faixasVolume,
      adicionais: parametros.adicionais,
      adicionaisSelecionados: Object.keys(quantidades).map((id) => ({
        id,
        quantidade: quantidadeDe(id),
      })),
    });

    setResultado(saida);
    setPrecoSemCusto(null);
    if (!saida) mostrar('Não foi possível calcular com os valores informados.', 'erro');
  }

  function limpar() {
    setClienteId('');
    setVolume('');
    setDistancia('');
    setQuantidades({});
    setResultado(null);
    setPrecoSemCusto(null);
    if (parametros) {
      setFator(
        fatorDaMargem(
          (parametros.margemMinima + parametros.margemMaxima) / 2,
          parametros.margemMinima,
          parametros.margemMaxima,
        ),
      );
    }
  }

  const marcasFator = useMemo(
    () => Array.from({ length: FATOR_MAX + 1 }, (_, i) => i),
    [],
  );

  if (carregando || !parametros) {
    return (
      <>
        <TituloPagina titulo="Orçamentos" subtitulo="Carregando parâmetros…" />
      </>
    );
  }

  return (
    <>
      <TituloPagina
        titulo="Orçamentos"
        subtitulo="Calculadora de precificação da mudança."
        acoes={
          <button type="button" className="btn btn-ghost" onClick={limpar}>
            Limpar
          </button>
        }
      />

      <div className={estilos.gradeCalculadora}>
        {/* ---------------- Entrada ---------------- */}
        <div className="card">
          <h2 className="card-title">Dados da mudança</h2>

          <div className="field" style={{ marginBottom: 20 }}>
            <label htmlFor="clienteOrc">Cliente</label>
            <select
              id="clienteOrc"
              value={clienteId}
              onChange={(e) => escolherCliente(e.target.value)}
            >
              <option value="">Nenhum — só calcular</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nome}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Escolher um cliente permite guardar o cálculo na ficha dele. Sem
              cliente, a calculadora funciona igual e nada é gravado.
            </p>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="volume">Volume estimado (m³)</label>
              <input
                id="volume"
                type="number"
                min="0"
                step="0.5"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder="Ex.: 32"
              />
            </div>

            <div className="field">
              <label htmlFor="distancia">Distância (km)</label>
              <input
                id="distancia"
                type="number"
                min="0"
                value={distancia}
                onChange={(e) => setDistancia(e.target.value)}
                placeholder="Ex.: 98"
              />
            </div>
          </div>

          <h3 className={estilos.subtituloBloco}>Serviços adicionais</h3>
          <div className={estilos.listaAdicionais}>
            {parametros.adicionais.map((a) => {
              const marcado = a.id in quantidades;
              const porUnidade = a.tipo === 'por_unidade';

              return (
                <div key={a.id} className={estilos.adicional}>
                  <label className={estilos.adicionalRotulo}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarAdicional(a.id)}
                    />
                    <span className={estilos.adicionalNome}>{a.nome}</span>
                  </label>

                  {marcado && porUnidade && (
                    <div className={estilos.controleUnidade}>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={quantidades[a.id]}
                        onChange={(e) => mudarQuantidade(a.id, e.target.value)}
                        placeholder="1"
                        aria-label={`Quantidade de ${a.nome}`}
                      />
                      <span>{a.unidade || 'un'}</span>
                    </div>
                  )}

                  {verCustos && (
                    <span className={estilos.adicionalValor}>
                      {a.tipo === 'fixo' && formatarBRL(a.valor)}
                      {a.tipo === 'percentual' && `+${a.valor}%`}
                      {porUnidade && `${formatarBRL(a.valor)} / ${a.unidade || 'un'}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---------------- Fator oportunidade ---------------- */}
          <h3 className={estilos.subtituloBloco}>Fator oportunidade</h3>

          <div className={estilos.controleFator}>
            <div className={estilos.fatorTopo}>
              <strong className={estilos.fatorValor}>{fator.toFixed(1).replace('.', ',')}</strong>
              <span className={estilos.fatorDescricao}>{descreverFator(fator)}</span>
            </div>

            <input
              type="range"
              min={FATOR_MIN}
              max={FATOR_MAX}
              step={FATOR_PASSO}
              value={fator}
              onChange={(e) => setFator(Number(e.target.value))}
              className={estilos.slider}
              aria-label="Fator oportunidade"
            />

            <div className={estilos.marcas}>
              {marcasFator.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>

            <div className={estilos.escalaRotulos}>
              <span>0 — preço cheio</span>
              <span>10 — máxima concessão</span>
            </div>

            {verCustos && (
              <p className={estilos.margemResultante}>
                Margem resultante:{' '}
                <strong className={margem < 0 ? estilos.margemNegativa : undefined}>
                  {margem.toFixed(1).replace('.', ',')}%
                </strong>
                {margem < 0 && ' — preço abaixo do custo'}
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={calcular}
            disabled={calculando}
            style={{ marginTop: 20 }}
          >
            {calculando ? 'Calculando…' : 'Calcular'}
          </button>
        </div>

        {/* ---------------- Resultado ---------------- */}
        <div className="card">
          <h2 className="card-title">Resultado</h2>

          {!resultado && precoSemCusto === null ? (
            <div className="estado-vazio">
              <strong>Aguardando cálculo</strong>
              Informe o volume e clique em calcular.
            </div>
          ) : precoSemCusto !== null ? (
            /*
             * Caminho de quem não vê custo: só o preço, calculado no banco.
             * Sem composição, sem parcelamento derivado daqui — o que a tela
             * não recebeu, ela não inventa.
             */
            <>
              <div className={estilos.precoFinal}>
                <span className={estilos.precoRotulo}>Preço sugerido</span>
                <strong className={estilos.precoValor}>{formatarBRL(precoSemCusto)}</strong>
              </div>

              <p className={estilos.notaSemCusto}>
                O cálculo roda no servidor e devolve apenas o valor final. A
                composição do preço é dado interno e não fica disponível no seu
                nível de acesso.
              </p>
            </>
          ) : resultado ? (
            <>
              {verCustos && (
                <div className={estilos.composicao}>
                  {resultado.linhas.map((linha, i) => (
                    <div key={i} className={estilos.linhaComposicao}>
                      <span>{linha.rotulo}</span>
                      <span>{formatarBRL(linha.valor)}</span>
                    </div>
                  ))}

                  <div className={`${estilos.linhaComposicao} ${estilos.linhaSubtotal}`}>
                    <span>Custo total estimado</span>
                    <span>{formatarBRL(resultado.custoTotal)}</span>
                  </div>

                  <div
                    className={`${estilos.linhaComposicao} ${
                      resultado.valorMargem >= 0 ? estilos.linhaMargem : estilos.linhaPrejuizo
                    }`}
                  >
                    <span>
                      {resultado.valorMargem >= 0 ? 'Margem aplicada' : 'Desconto aplicado'} (
                      {resultado.margemPercentual.toFixed(1).replace('.', ',')}%)
                    </span>
                    <span>
                      {resultado.valorMargem >= 0 ? '+ ' : '− '}
                      {formatarBRL(Math.abs(resultado.valorMargem))}
                    </span>
                  </div>
                </div>
              )}

              <div className={estilos.precoFinal}>
                <span className={estilos.precoRotulo}>Preço ao cliente</span>
                <strong className={estilos.precoValor}>
                  {formatarBRL(resultado.precoRedondo)}
                </strong>
                {resultado.precoRedondo !== Math.round(resultado.precoFinal) && (
                  <span>Calculado: {formatarBRL(resultado.precoFinal)}</span>
                )}
              </div>

              <h3 className={estilos.subtituloBloco}>Parcelamento</h3>
              <div className={estilos.parcelas}>
                <Parcela
                  rotulo="Sinal"
                  valor={resultado.parcelamento.sinal}
                  quando="Na assinatura"
                />
                <Parcela
                  rotulo="1ª parcela"
                  valor={resultado.parcelamento.primeiraParcela}
                  quando="No carregamento"
                />
                <Parcela
                  rotulo="2ª parcela"
                  valor={resultado.parcelamento.segundaParcela}
                  quando="Antes do descarregamento"
                />
              </div>

              {/*
                Valor negociado: o desconto de telefone sem mentir sobre a
                margem. Vazio significa "não houve negociação" e o preço
                vale o calculado — por isso o campo nasce vazio e não com
                o valor sugerido dentro.
              */}
              <div className="field" style={{ marginTop: 16, marginBottom: 4 }}>
                <label htmlFor="valorNegociado">Valor negociado (opcional)</label>
                <input
                  id="valorNegociado"
                  inputMode="decimal"
                  value={valorNegociado}
                  onChange={(e) => setValorNegociado(e.target.value)}
                  placeholder={`Deixe vazio para cobrar ${formatarBRL(resultado.precoRedondo)}`}
                />
                <p className="field-hint">
                  Preencha só se você fechou por um valor diferente do calculado. O
                  relatório guarda os dois, então a sua margem continua dizendo a
                  verdade.
                </p>
              </div>

              {/* Guardar o cálculo na ficha do cliente. */}
              <div className={estilos.vinculo}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={salvarOrcamento}
                  disabled={!clienteEscolhido || vinculando}
                  title={
                    clienteEscolhido
                      ? undefined
                      : 'Escolha um cliente no topo para poder vincular'
                  }
                >
                  {vinculando
                    ? 'Salvando…'
                    : editandoId
                      ? 'Salvar correção'
                      : 'Vincular valor ao cliente'}
                </button>

                {editandoId && (
                  <button type="button" className="btn btn-ghost" onClick={sairDaEdicao}>
                    Cancelar correção
                  </button>
                )}

                <span className={estilos.explicacaoVinculo}>
                  {editandoId
                    ? 'Corrigindo um orçamento já gravado. O status dele não muda.'
                    : clienteEscolhido
                      ? `Guarda este cálculo na ficha de ${clienteEscolhido.nome}, com tudo que entrou na conta.`
                      : 'Sem cliente escolhido, o cálculo não é gravado em lugar nenhum.'}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ---------- Os orçamentos gravados ----------
           Esta tela só calculava e gravava: nunca mostrou um orçamento.
           Os 33 que existiam no banco só apareciam na ficha do cliente. */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2 className="card-title">Orçamentos gravados</h2>

        <div className={estilos.filtrosLista}>
          <div className="field">
            <label htmlFor="filtroStatusOrc">Status</label>
            <select
              id="filtroStatusOrc"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="">Todos</option>
              {STATUS_ORCAMENTO.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_ORCAMENTO[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="filtroClienteOrc">Cliente</label>
            <select
              id="filtroClienteOrc"
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {carregandoLista ? (
          <div className="estado-vazio">Carregando orçamentos…</div>
        ) : listaFiltrada.length === 0 ? (
          <div className="estado-vazio">
            <strong>Nenhum orçamento no filtro</strong>
            {lista.length === 0
              ? 'Calcule acima e use "Vincular valor ao cliente".'
              : `Há ${lista.length} gravado(s) fora deste filtro.`}
          </div>
        ) : (
          <ul className={estilos.listaOrcamentos}>
            {listaFiltrada.map((o) => (
              <li
                key={o.id}
                className={`${estilos.itemOrcamento} ${
                  editandoId === o.id ? estilos.itemEmEdicao : ''
                }`}
              >
                <div className={estilos.linhaTopo}>
                  <strong className={estilos.valorItem}>{formatarBRL(valorDoOrcamento(o))}</strong>
                  {o.valorNegociado !== null && (
                    <span className={estilos.calculadoItem}>
                      negociado · calculado {formatarBRL(o.valorFinal)}
                    </span>
                  )}
                  <span className={`${estilos.pastilhaStatus} ${estilos[o.status]}`}>
                    {ROTULO_ORCAMENTO[o.status]}
                  </span>
                </div>

                <div className={estilos.linhaDados}>
                  <span>{o.clienteNome}</span>
                  <span className="texto-secundario">
                    {o.volumeM3} m³ · {o.distanciaKm} km · {formatarData(o.data)}
                  </span>
                </div>

                <div className={estilos.acoesItem}>
                  {o.status !== 'enviado' && o.status !== 'aprovado' && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => mudarStatus(o, 'enviado')}
                    >
                      Marcar enviado
                    </button>
                  )}
                  {o.status !== 'aprovado' && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => mudarStatus(o, 'aprovado')}
                    >
                      Aprovar
                    </button>
                  )}
                  {o.status !== 'recusado' && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => mudarStatus(o, 'recusado')}
                    >
                      Recusar
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => router.push(`/orcamentos?editar=${o.id}`)}
                  >
                    Editar
                  </button>
                  {podeExcluirOrcamento && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => excluirOrcamento(o)}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editarParametros && (
        <div style={{ marginTop: 20 }}>
          <PainelPrecificacao />
        </div>
      )}
    </>
  );
}

function Parcela({ rotulo, valor, quando }: { rotulo: string; valor: number; quando: string }) {
  return (
    <div className={estilos.parcela}>
      <span className={estilos.parcelaRotulo}>{rotulo}</span>
      <strong className={estilos.parcelaValor}>{formatarBRL(valor)}</strong>
      <span className="texto-secundario">{quando}</span>
    </div>
  );
}
