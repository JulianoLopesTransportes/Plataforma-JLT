'use client';

/**
 * ROTAS — migrado de referencia/07-rotas_1.html (o maior módulo original)
 *
 * Preservado: kanban por status, linha do tempo de paradas, ocupação do
 * caminhão calculada parada a parada e o motor de alertas. Toda essa
 * lógica vive em lib/negocio/rotas.ts; aqui é só apresentação.
 *
 * O prefixo `rot_` que o original usava em todas as funções foi removido:
 * ele existia para evitar colisão de nomes num arquivo único e não faz
 * mais sentido com módulos.
 */

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, usandoBanco } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar } from '@/lib/permissoes';
import { formatarData, diasEntre } from '@/lib/utils/formato';
import {
  calcularOcupacao,
  ocupacaoDePico,
  volumeTotal,
  detectarAlertas,
  COLUNAS_KANBAN,
  ROTULO_STATUS_ROTA,
  type Alerta,
} from '@/lib/negocio/rotas';
import {
  TituloPagina,
  Modal,
  Badge,
  GradeMetricas,
  CardMetrica,
  useToast,
  type TomBadge,
} from '@/components/ui';
import Icone from '@/components/layout/Icone';
import FormularioRota from '@/components/modulos/FormularioRota';
import type { Rota, Veiculo, Motorista, Cliente } from '@/lib/tipos';
import estilos from './rotas.module.css';

const TOM_STATUS: Record<Rota['status'], TomBadge> = {
  planejada: 'neutro',
  carregando: 'warning',
  em_transito: 'info',
  concluida: 'success',
};

const ICONE_ALERTA: Record<Alerta['nivel'], string> = {
  danger: 'alerta',
  warning: 'alerta',
  info: 'guia',
};

export default function PaginaRotas() {
  return (
    <Suspense fallback={<TituloPagina titulo="Rotas" subtitulo="Carregando…" />}>
      <ConteudoRotas />
    </Suspense>
  );
}

function ConteudoRotas() {
  const usuario = useUsuario();
  const { mostrar } = useToast();
  const parametrosUrl = useSearchParams();

  const [rotas, setRotas] = useState<Rota[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [rotaAbertaId, setRotaAbertaId] = useState<string | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [formAberto, setFormAberto] = useState(false);

  const podeMexer = podeEditar(usuario.nivel, 'rotas');

  const recarregar = useCallback(async () => {
    try {
      setRotas(await api.rotas.listar());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([api.veiculos.listar(), api.motoristas.listar(), api.clientes.listar()]).then(
      ([v, m, c]) => {
        setVeiculos(v);
        setMotoristas(m);
        setClientes(c);
      },
    );
    recarregar();
  }, [recarregar]);

  // Abre direto a rota indicada na URL — é assim que o dashboard e a agenda
  // apontam para uma rota específica.
  useEffect(() => {
    const id = parametrosUrl.get('rota');
    if (id) setRotaAbertaId(id);
  }, [parametrosUrl]);

  const veiculoDe = (rota: Rota) => veiculos.find((v) => v.id === rota.veiculoId) ?? null;
  const motoristaDe = (rota: Rota) => motoristas.find((m) => m.id === rota.motoristaId) ?? null;

  const rotaAberta = rotas.find((r) => r.id === rotaAbertaId) ?? null;

  /* --- Métricas gerais -------------------------------------------------- */
  const ativas = rotas.filter((r) => r.status !== 'concluida');
  const volumeEmTransito = rotas
    .filter((r) => r.status === 'em_transito')
    .reduce((s, r) => s + volumeTotal(r), 0);

  const rotasComProblema = useMemo(
    () =>
      rotas.filter((r) =>
        detectarAlertas(r, veiculoDe(r)).some((a) => a.nivel === 'danger'),
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rotas, veiculos],
  );

  async function moverRota(rota: Rota, novoStatus: Rota['status']) {
    try {
      if (usandoBanco()) {
        await api.rotas.atualizarStatus(rota.id, novoStatus);
        await recarregar();
      } else {
        setRotas((lista) => lista.map((r) => (r.id === rota.id ? { ...r, status: novoStatus } : r)));
      }
      mostrar(`${rota.nome} movida para "${ROTULO_STATUS_ROTA[novoStatus]}".`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao mover a rota.', 'erro');
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Rotas"
        subtitulo="Planejamento de viagens, ocupação do caminhão e alertas de operação."
        acoes={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!podeMexer}
            title={podeMexer ? undefined : 'Seu nível não permite criar rotas'}
            onClick={() => setFormAberto(true)}
          >
            Nova rota
          </button>
        }
      />

      <GradeMetricas>
        <CardMetrica
          rotulo="Rotas ativas"
          valor={String(ativas.length)}
          detalhe={`${rotas.length} no total`}
          icone="rotas"
        />
        <CardMetrica
          rotulo="Volume em trânsito"
          valor={`${volumeEmTransito} m³`}
          detalhe="Carga na estrada agora"
          icone="veiculo"
        />
        <CardMetrica
          rotulo="Cargas planejadas"
          valor={String(ativas.reduce((s, r) => s + r.mudancas.length, 0))}
          detalhe="Mudanças em rotas não concluídas"
        />
        <CardMetrica
          rotulo="Rotas com problema"
          valor={String(rotasComProblema)}
          detalhe="Lotação estourada ou cadastro incompleto"
          icone="alerta"
          tom={rotasComProblema > 0 ? 'negativo' : undefined}
        />
      </GradeMetricas>

      {carregando ? (
        <div className="card">Carregando rotas…</div>
      ) : (
        <div className={estilos.kanban}>
          {COLUNAS_KANBAN.map((coluna) => {
            const daColuna = rotas.filter((r) => r.status === coluna.status);

            return (
              <div key={coluna.status} className={estilos.colunaKanban}>
                <div className={estilos.cabecalhoColuna}>
                  <span>{coluna.titulo}</span>
                  <span className={estilos.contadorColuna}>{daColuna.length}</span>
                </div>

                <div className={estilos.cartoes}>
                  {daColuna.length === 0 ? (
                    <p className={estilos.colunaVazia}>Nenhuma rota</p>
                  ) : (
                    daColuna.map((rota) => {
                      const veiculo = veiculoDe(rota);
                      const ocupacoes = calcularOcupacao(rota, veiculo?.capacidadeM3 ?? null);
                      const pico = ocupacaoDePico(ocupacoes);
                      const percentualPico = veiculo
                        ? (pico / veiculo.capacidadeM3) * 100
                        : null;
                      const alertas = detectarAlertas(rota, veiculo);
                      const graves = alertas.filter((a) => a.nivel === 'danger').length;

                      return (
                        <div key={rota.id} className={estilos.envolucroCartao}>
                        <button
                          type="button"
                          className={estilos.cartao}
                          onClick={() => setRotaAbertaId(rota.id)}
                        >
                          <strong className={estilos.cartaoTitulo}>{rota.nome}</strong>

                          <span className="texto-secundario">
                            {rota.origem} → {rota.destino}
                          </span>

                          <div className={estilos.cartaoMeta}>
                            <span>{formatarData(rota.dataSaida)}</span>
                            <span>·</span>
                            <span>{rota.mudancas.length} carga(s)</span>
                          </div>

                          {/* Barra de ocupação de pico */}
                          {percentualPico !== null ? (
                            <div className={estilos.barraOcupacao}>
                              <div
                                className={`${estilos.preenchimento} ${
                                  percentualPico > 100
                                    ? estilos.preenchimentoEstourado
                                    : percentualPico >= 90
                                      ? estilos.preenchimentoAlerta
                                      : ''
                                }`}
                                style={{ width: `${Math.min(100, percentualPico)}%` }}
                              />
                              <span className={estilos.rotuloOcupacao}>
                                {pico} / {veiculo!.capacidadeM3} m³ ({percentualPico.toFixed(0)}%)
                              </span>
                            </div>
                          ) : (
                            <span className={estilos.semVeiculo}>Sem veículo atribuído</span>
                          )}

                          {graves > 0 && (
                            <span className={estilos.marcaAlerta}>
                              <Icone nome="alerta" tamanho={14} />
                              {graves} problema{graves === 1 ? '' : 's'}
                            </span>
                          )}
                        </button>

                        {podeMexer && (
                          <select
                            className={estilos.seletorStatus}
                            value={rota.status}
                            onChange={(e) =>
                              moverRota(rota, e.target.value as Rota['status'])
                            }
                            aria-label={`Status de ${rota.nome}`}
                          >
                            {COLUNAS_KANBAN.map((c) => (
                              <option key={c.status} value={c.status}>
                                {c.titulo}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FormularioRota
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        aoSalvar={async () => {
          await recarregar();
          setFormAberto(false);
        }}
        clientes={clientes}
        veiculos={veiculos}
        motoristas={motoristas}
      />

      {/* ---------- Detalhe da rota ---------- */}
      <Modal
        titulo={rotaAberta?.nome ?? ''}
        aberto={rotaAberta !== null}
        aoFechar={() => setRotaAbertaId(null)}
        largo
        rodape={
          rotaAberta && (
            <>
              {podeMexer && (
                <label className={estilos.statusDetalhe}>
                  Status
                  <select
                    value={rotaAberta.status}
                    onChange={(e) => moverRota(rotaAberta, e.target.value as Rota['status'])}
                  >
                    {COLUNAS_KANBAN.map((c) => (
                      <option key={c.status} value={c.status}>
                        {c.titulo}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setRotaAbertaId(null)}
              >
                Fechar
              </button>
            </>
          )
        }
      >
        {rotaAberta && (
          <DetalheRota
            rota={rotaAberta}
            veiculo={veiculoDe(rotaAberta)}
            motorista={motoristaDe(rotaAberta)}
          />
        )}
      </Modal>
    </>
  );
}

/* ==========================================================================
   Detalhe: cabeçalho, alertas e linha do tempo
   ========================================================================== */

function DetalheRota({
  rota,
  veiculo,
  motorista,
}: {
  rota: Rota;
  veiculo: Veiculo | null;
  motorista: Motorista | null;
}) {
  const ocupacoes = calcularOcupacao(rota, veiculo?.capacidadeM3 ?? null);
  const pico = ocupacaoDePico(ocupacoes);
  const alertas = detectarAlertas(rota, veiculo);
  const duracao = diasEntre(rota.dataSaida, rota.dataPrevistaRetorno);

  return (
    <>
      <dl className={estilos.resumoRota}>
        <ItemResumo rotulo="Status">
          <Badge texto={ROTULO_STATUS_ROTA[rota.status]} tom={TOM_STATUS[rota.status]} />
        </ItemResumo>
        <ItemResumo rotulo="Trajeto">
          {rota.origem} → {rota.destino}
        </ItemResumo>
        <ItemResumo rotulo="Saída">{formatarData(rota.dataSaida)}</ItemResumo>
        <ItemResumo rotulo="Retorno previsto">
          {formatarData(rota.dataPrevistaRetorno)}
          {duracao > 0 && <span className="texto-secundario"> ({duracao} dias)</span>}
        </ItemResumo>
        <ItemResumo rotulo="Veículo">
          {veiculo ? `${veiculo.placa} — ${veiculo.modelo}` : 'Não atribuído'}
        </ItemResumo>
        <ItemResumo rotulo="Motorista">{motorista?.nome ?? 'Não atribuído'}</ItemResumo>
        <ItemResumo rotulo="Volume total">{volumeTotal(rota)} m³</ItemResumo>
        <ItemResumo rotulo="Ocupação de pico">
          {veiculo ? (
            <>
              {pico} m³ de {veiculo.capacidadeM3} m³{' '}
              <strong
                className={
                  pico > veiculo.capacidadeM3 ? estilos.textoEstourado : estilos.textoNormal
                }
              >
                ({((pico / veiculo.capacidadeM3) * 100).toFixed(0)}%)
              </strong>
            </>
          ) : (
            'Sem capacidade definida'
          )}
        </ItemResumo>
      </dl>

      {/* ---------- Alertas ---------- */}
      {alertas.length > 0 && (
        <>
          <h3 className={estilos.subtitulo}>Alertas da operação</h3>
          <ul className={estilos.listaAlertas}>
            {alertas.map((a, i) => (
              <li key={i} className={`${estilos.alerta} ${estilos[`alerta_${a.nivel}`]}`}>
                <Icone nome={ICONE_ALERTA[a.nivel]} tamanho={17} />
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---------- Linha do tempo ---------- */}
      <h3 className={estilos.subtitulo}>Linha do tempo</h3>
      <ol className={estilos.timeline}>
        {ocupacoes.map(({ parada, ocupacaoApos, percentual, aBordo }) => {
          const embarcam = parada.embarcam
            .map((id) => rota.mudancas.find((m) => m.id === id))
            .filter(Boolean);
          const desembarcam = parada.desembarcam
            .map((id) => rota.mudancas.find((m) => m.id === id))
            .filter(Boolean);

          return (
            <li key={parada.id} className={estilos.parada}>
              <div className={`${estilos.marcador} ${estilos[`marcador_${parada.tipo}`]}`} />

              <div className={estilos.corpoParada}>
                <div className={estilos.cabecalhoParada}>
                  <strong>
                    {parada.cidade} — {parada.uf}
                  </strong>
                  <span className="texto-secundario">{formatarData(parada.data)}</span>
                </div>

                <span className="texto-secundario">{parada.endereco}</span>

                {embarcam.length > 0 && (
                  <div className={estilos.movimento}>
                    <span className={estilos.rotuloEmbarque}>Embarca</span>
                    {embarcam.map((m) => (
                      <span key={m!.id} className={estilos.carga}>
                        {m!.clienteNome} ({m!.volumeM3} m³)
                      </span>
                    ))}
                  </div>
                )}

                {desembarcam.length > 0 && (
                  <div className={estilos.movimento}>
                    <span className={estilos.rotuloDesembarque}>Desembarca</span>
                    {desembarcam.map((m) => (
                      <span key={m!.id} className={estilos.carga}>
                        {m!.clienteNome} ({m!.volumeM3} m³)
                      </span>
                    ))}
                  </div>
                )}

                <div className={estilos.ocupacaoParada}>
                  A bordo depois desta parada: <strong>{ocupacaoApos} m³</strong>
                  {percentual !== null && (
                    <span
                      className={
                        percentual > 100
                          ? estilos.textoEstourado
                          : percentual >= 90
                            ? estilos.textoAlerta
                            : ''
                      }
                    >
                      {' '}
                      ({percentual.toFixed(0)}% da capacidade)
                    </span>
                  )}
                  {aBordo.length > 0 && (
                    <span className="texto-secundario">
                      {' '}
                      — {aBordo.length} carga(s) no caminhão
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ---------- Cargas ---------- */}
      <h3 className={estilos.subtitulo}>Cargas da rota</h3>
      <div className={estilos.tabelaEnvolucro}>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contato</th>
              <th style={{ textAlign: 'right' }}>Volume</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {rota.mudancas.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.clienteNome}</strong>
                </td>
                <td>{m.telefone}</td>
                <td className="numerico">{m.volumeM3} m³</td>
                <td>{m.observacao || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ItemResumo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
