'use client';

/**
 * ORÇAMENTOS — migrado de referencia/06-orcamentos-calculadora_6.html
 *
 * O cálculo em si vive em lib/negocio/precificacao.ts, sem DOM. Esta tela
 * só coleta os campos e apresenta o resultado.
 *
 * RECORTE DE PERMISSÃO — é o ponto mais delicado da matriz:
 *   O Comercial usa a calculadora e vê o PREÇO FINAL, porque precisa
 *   negociar. Mas não vê a composição do custo, a margem aplicada nem os
 *   parâmetros de precificação, que são dado interno. Quem controla isso
 *   é podeFazer('ver_custos') / podeFazer('editar_parametros_precificacao').
 */

import { useEffect, useState, useMemo } from 'react';
import { api, type ParametrosPrecificacao } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar, podeFazer } from '@/lib/permissoes';
import { formatarBRL, formatarData } from '@/lib/utils/formato';
import {
  calcularOrcamento,
  margemSugerida,
  type ResultadoOrcamento,
} from '@/lib/negocio/precificacao';
import {
  TituloPagina,
  Tabela,
  Badge,
  Abas,
  BarraFiltros,
  CampoFiltro,
  AcoesFiltro,
  GradeMetricas,
  CardMetrica,
  useToast,
  EstadoVazio,
  type Coluna,
  type TomBadge,
} from '@/components/ui';
import type { Orcamento } from '@/lib/tipos';
import PainelPrecificacao from '@/components/modulos/PainelPrecificacao';
import estilos from './orcamentos.module.css';

const TOM_STATUS: Record<Orcamento['status'], TomBadge> = {
  rascunho: 'neutro',
  enviado: 'info',
  aprovado: 'success',
  recusado: 'danger',
};

const ROTULO_STATUS: Record<Orcamento['status'], string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
};

export default function PaginaOrcamentos() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [aba, setAba] = useState('calculadora');
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [parametros, setParametros] = useState<ParametrosPrecificacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [busca, setBusca] = useState('');

  // Campos da calculadora
  const [volume, setVolume] = useState('');
  const [distancia, setDistancia] = useState('');
  const [escala, setEscala] = useState(5);
  const [margem, setMargem] = useState(40);
  const [marcados, setMarcados] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<ResultadoOrcamento | null>(null);

  const verCustos = podeFazer(usuario.nivel, 'ver_custos');
  const editarParametros = podeFazer(usuario.nivel, 'editar_parametros_precificacao');
  const podeAprovar = podeFazer(usuario.nivel, 'aprovar');
  const podeMexer = podeEditar(usuario.nivel, 'orcamentos');

  useEffect(() => {
    Promise.all([api.orcamentos.listar(), api.orcamentos.parametros()]).then(([o, p]) => {
      setOrcamentos(o);
      setParametros(p);
      setMargem(Math.round((p.margemMinima + p.margemMaxima) / 2));
      setCarregando(false);
    });
  }, []);

  /* --- Calculadora ------------------------------------------------------ */

  /** Move a margem junto com a escala de agressividade (0 = cheia, 10 = mínima). */
  function aoMudarEscala(novaEscala: number) {
    if (!parametros) return;
    setEscala(novaEscala);
    setMargem(margemSugerida(novaEscala, parametros.margemMinima, parametros.margemMaxima));
  }

  function alternarAdicional(id: string) {
    setMarcados((atual) => {
      const copia = { ...atual };
      if (id in copia) delete copia[id];
      else copia[id] = 1;
      return copia;
    });
  }

  function calcular() {
    if (!parametros) return;

    const volumeNum = Number(volume);
    if (!volumeNum || volumeNum <= 0) {
      mostrar('Informe o volume estimado para calcular.', 'erro');
      return;
    }

    const saida = calcularOrcamento({
      volumeM3: volumeNum,
      distanciaKm: Number(distancia) || 0,
      custoPorKm: parametros.custoPorKm,
      margemPercentual: margem,
      faixas: parametros.faixasVolume,
      adicionais: parametros.adicionais,
      adicionaisSelecionados: Object.entries(marcados).map(([id, quantidade]) => ({
        id,
        quantidade,
      })),
    });

    setResultado(saida);
    if (!saida) mostrar('Não foi possível calcular com os valores informados.', 'erro');
  }

  /* --- Lista ------------------------------------------------------------ */
  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return orcamentos.filter(
      (o) =>
        (!termo || o.clienteNome.toLowerCase().includes(termo)) &&
        (!filtroStatus || o.status === filtroStatus),
    );
  }, [orcamentos, busca, filtroStatus]);

  function aprovar(o: Orcamento) {
    setOrcamentos((lista) =>
      lista.map((x) => (x.id === o.id ? { ...x, status: 'aprovado' as const } : x)),
    );
    mostrar(`Orçamento de ${o.clienteNome} aprovado.`, 'sucesso');
  }

  const colunas: Coluna<Orcamento>[] = [
    {
      chave: 'clienteNome',
      rotulo: 'Cliente',
      ordenarPor: (o) => o.clienteNome,
      render: (o) => <strong>{o.clienteNome}</strong>,
    },
    {
      chave: 'data',
      rotulo: 'Data',
      ordenarPor: (o) => o.data,
      render: (o) => formatarData(o.data),
    },
    {
      chave: 'volumeM3',
      rotulo: 'Volume',
      numerico: true,
      ordenarPor: (o) => o.volumeM3,
      render: (o) => `${o.volumeM3} m³`,
    },
    {
      chave: 'distanciaKm',
      rotulo: 'Distância',
      numerico: true,
      ordenarPor: (o) => o.distanciaKm,
      render: (o) => `${o.distanciaKm} km`,
    },
    // Colunas de custo e margem existem apenas para quem pode ver custos.
    ...(verCustos
      ? ([
          {
            chave: 'custoBase',
            rotulo: 'Custo',
            numerico: true,
            ordenarPor: (o: Orcamento) => o.custoBase,
            render: (o: Orcamento) => formatarBRL(o.custoBase),
          },
          {
            chave: 'margemPercentual',
            rotulo: 'Margem',
            numerico: true,
            ordenarPor: (o: Orcamento) => o.margemPercentual,
            render: (o: Orcamento) => `${o.margemPercentual}%`,
          },
        ] as Coluna<Orcamento>[])
      : []),
    {
      chave: 'valorFinal',
      rotulo: 'Valor final',
      numerico: true,
      ordenarPor: (o) => o.valorFinal,
      render: (o) => <strong>{formatarBRL(o.valorFinal)}</strong>,
    },
    {
      chave: 'status',
      rotulo: 'Status',
      ordenarPor: (o) => o.status,
      render: (o) => <Badge texto={ROTULO_STATUS[o.status]} tom={TOM_STATUS[o.status]} />,
    },
    {
      chave: 'acoes',
      rotulo: '',
      render: (o) =>
        podeAprovar && o.status === 'enviado' ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => aprovar(o)}>
            Aprovar
          </button>
        ) : null,
    },
  ];

  const aprovados = orcamentos.filter((o) => o.status === 'aprovado');
  const taxaAprovacao =
    orcamentos.length > 0 ? (aprovados.length / orcamentos.length) * 100 : null;

  return (
    <>
      <TituloPagina
        titulo="Orçamentos"
        subtitulo="Calculadora de precificação e histórico de propostas."
      />

      <GradeMetricas>
        <CardMetrica rotulo="Orçamentos" valor={String(orcamentos.length)} icone="orcamento" />
        <CardMetrica
          rotulo="Aprovados"
          valor={String(aprovados.length)}
          detalhe={taxaAprovacao !== null ? `${taxaAprovacao.toFixed(0)}% de aproveitamento` : ''}
          tom="positivo"
        />
        <CardMetrica
          rotulo="Valor aprovado"
          valor={formatarBRL(aprovados.reduce((s, o) => s + o.valorFinal, 0))}
          detalhe="Soma das propostas aceitas"
        />
        {verCustos && (
          <CardMetrica
            rotulo="Margem média"
            valor={
              aprovados.length > 0
                ? `${(aprovados.reduce((s, o) => s + o.margemPercentual, 0) / aprovados.length).toFixed(1)}%`
                : null
            }
            detalhe={aprovados.length > 0 ? 'Nas propostas aprovadas' : 'Sem propostas aprovadas'}
          />
        )}
      </GradeMetricas>

      <Abas
        abas={[
          { chave: 'calculadora', rotulo: 'Calculadora' },
          { chave: 'lista', rotulo: `Propostas (${orcamentos.length})` },
        ]}
        ativa={aba}
        aoTrocar={setAba}
      />

      {aba === 'calculadora' && (
        <>
          {!parametros ? (
            <div className="card">Carregando parâmetros…</div>
          ) : (
            <div className={estilos.gradeCalculadora}>
              <div className="card">
                <h2 className="card-title">Dados da mudança</h2>

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
                  {parametros.adicionais.map((a) => (
                    <label key={a.id} className={estilos.adicional}>
                      <input
                        type="checkbox"
                        checked={a.id in marcados}
                        onChange={() => alternarAdicional(a.id)}
                      />
                      <span className={estilos.adicionalNome}>{a.nome}</span>
                      {/* O valor do adicional é custo interno. */}
                      {verCustos && (
                        <span className={estilos.adicionalValor}>
                          {a.tipo === 'fixo' ? formatarBRL(a.valor) : `+${a.valor}%`}
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                {/* Controle de margem — some por completo para o Comercial. */}
                {verCustos && (
                  <>
                    <h3 className={estilos.subtituloBloco}>Margem aplicada</h3>
                    <div className={estilos.controleMargem}>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={escala}
                        onChange={(e) => aoMudarEscala(Number(e.target.value))}
                        className={estilos.slider}
                        aria-label="Agressividade do preço"
                      />
                      <div className={estilos.escalaRotulos}>
                        <span>Margem cheia</span>
                        <strong className={estilos.margemAtual}>{margem}%</strong>
                        <span>Preço agressivo</span>
                      </div>
                      <p className="field-hint">
                        Margem sobre o preço — preço = custo ÷ (1 − margem). Faixa permitida:{' '}
                        {parametros.margemMinima}% a {parametros.margemMaxima}%.
                      </p>
                    </div>
                  </>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={calcular}
                  style={{ marginTop: 20 }}
                >
                  Calcular orçamento
                </button>
              </div>

              {/* ---------- Resultado ---------- */}
              <div className="card">
                <h2 className="card-title">Resultado</h2>

                {!resultado ? (
                  <div className="estado-vazio">
                    <strong>Aguardando cálculo</strong>
                    Informe o volume e clique em calcular.
                  </div>
                ) : (
                  <>
                    {/* Composição do custo: só para quem pode ver custos. */}
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

                        <div className={`${estilos.linhaComposicao} ${estilos.linhaMargem}`}>
                          <span>Margem aplicada ({resultado.margemPercentual}%)</span>
                          <span>+ {formatarBRL(resultado.valorMargem)}</span>
                        </div>
                      </div>
                    )}

                    <div className={estilos.precoFinal}>
                      <span className={estilos.precoRotulo}>Preço ao cliente</span>
                      <strong className={estilos.precoValor}>
                        {formatarBRL(resultado.precoRedondo)}
                      </strong>
                      {resultado.precoRedondo !== Math.round(resultado.precoFinal) && (
                        <span className="texto-secundario">
                          Calculado: {formatarBRL(resultado.precoFinal)} — arredondado para passar
                          mais confiança ao cliente
                        </span>
                      )}
                    </div>

                    <h3 className={estilos.subtituloBloco}>Sugestão de parcelamento</h3>
                    <p className="field-hint" style={{ marginBottom: 12 }}>
                      Padrão da empresa: sinal de 10% (mínimo R$ 500), metade do saldo no
                      carregamento, restante antes do descarregamento.
                    </p>
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
                  </>
                )}
              </div>
            </div>
          )}

          {/* Painel editável — só quem tem editar_parametros_precificacao. */}
          {editarParametros && <PainelPrecificacao />}

        </>
      )}

      {aba === 'lista' && (
        <>
          <BarraFiltros>
            <CampoFiltro rotulo="Buscar cliente">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do cliente"
              />
            </CampoFiltro>

            <CampoFiltro rotulo="Status">
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(ROTULO_STATUS).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </CampoFiltro>

            <AcoesFiltro>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setBusca('');
                  setFiltroStatus('');
                }}
              >
                Limpar
              </button>
            </AcoesFiltro>
          </BarraFiltros>

          {!verCustos && (
            <p className={estilos.avisoRecorte}>
              Seu nível de acesso não exibe custo interno nem margem. Os valores mostrados são os
              preços finais apresentados ao cliente.
            </p>
          )}

          <Tabela
            colunas={colunas}
            registros={filtrados}
            carregando={carregando}
            mensagemVazio="Nenhuma proposta corresponde aos filtros."
            porPagina={10}
          />

          {!podeMexer && orcamentos.length === 0 && !carregando && (
            <EstadoVazio
              titulo="Sem propostas"
              descricao="Nenhum orçamento cadastrado até o momento."
            />
          )}
        </>
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
