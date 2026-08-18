'use client';

/**
 * CLIENTES — migrado de referencia/01-cadastro-clientes_5.html
 *
 * Lógica preservada: máscaras de CPF/CNPJ/telefone, classificação de porte
 * pelo volume, funil de status Novo → Em andamento → Concluído, anexos e
 * histórico de alterações.
 *
 * Persistência: quando o Supabase está configurado, criar, alterar status e
 * excluir gravam no banco e o histórico vira registro em cliente_historico.
 * Sem as variáveis de ambiente, a tela cai no modo da Fase A — alterações
 * vivem só em memória e somem no refresh. Ver usandoBanco() em lib/api.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { api, usandoBanco } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar, podeFazer } from '@/lib/permissoes';
import {
  formatarData,
  mascararDocumento,
  mascararTelefone,
  novoId,
  hojeISO,
} from '@/lib/utils/formato';
import {
  descreverVolume,
  proximoStatus,
  statusFinal,
  tomDoStatus,
} from '@/lib/negocio/clientes';
import {
  TituloPagina,
  Tabela,
  Badge,
  Modal,
  Abas,
  BarraFiltros,
  CampoFiltro,
  AcoesFiltro,
  GradeMetricas,
  CardMetrica,
  useToast,
  type Coluna,
} from '@/components/ui';
import { STATUS_CLIENTE, ORIGENS_CLIENTE, type Cliente, type StatusCliente } from '@/lib/tipos';
import PainelAnexos from '@/components/modulos/PainelAnexos';
import estilos from './clientes.module.css';

const CLIENTE_VAZIO: Omit<Cliente, 'id' | 'criadoEm' | 'anexos' | 'historico'> = {
  tipo: 'PF',
  nome: '',
  documento: '',
  telefone: '',
  email: '',
  status: 'Novo',
  origem: 'WhatsApp',
  origemDetalhe: '',
  enderecoColeta: '',
  enderecoEntrega: '',
  volumeM3: null,
  dataPrevista: '',
  observacoes: '',
};

export default function PaginaClientes() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');

  const [detalhe, setDetalhe] = useState<Cliente | null>(null);
  const [abaDetalhe, setAbaDetalhe] = useState('dados');
  const [formAberto, setFormAberto] = useState(false);
  const [formulario, setFormulario] = useState(CLIENTE_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erroCarga, setErroCarga] = useState('');

  const podeMexer = podeEditar(usuario.nivel, 'clientes');
  const podeExcluir = podeFazer(usuario.nivel, 'excluir');

  const recarregar = useCallback(async () => {
    try {
      setClientes(await api.clientes.listar());
      setErroCarga('');
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Falha ao carregar clientes.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  /* --- Filtro em memória ------------------------------------------------ */
  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return clientes.filter((c) => {
      const casaTermo =
        !termo ||
        c.nome.toLowerCase().includes(termo) ||
        c.documento.includes(termo) ||
        c.email.toLowerCase().includes(termo) ||
        c.telefone.includes(termo);
      return (
        casaTermo &&
        (!filtroStatus || c.status === filtroStatus) &&
        (!filtroOrigem || c.origem === filtroOrigem)
      );
    });
  }, [clientes, busca, filtroStatus, filtroOrigem]);

  /* --- Ações ------------------------------------------------------------ */

  function registrarHistorico(cliente: Cliente, descricao: string): Cliente {
    return {
      ...cliente,
      historico: [
        ...cliente.historico,
        {
          id: novoId('hist'),
          em: new Date().toISOString(),
          autor: usuario.nome,
          descricao,
        },
      ],
    };
  }

  async function avancarStatus(cliente: Cliente) {
    const novo = proximoStatus(cliente.status);
    const descricao = `Status alterado de ${cliente.status} para ${novo}.`;

    try {
      if (usandoBanco()) {
        await api.clientes.atualizar(cliente.id, { status: novo });
        await api.clientes.registrarHistorico(cliente.id, usuario.nome, descricao);
        await recarregar();
      } else {
        // Sem banco, a mudança vive só nesta tela e some no refresh.
        const atualizado = registrarHistorico({ ...cliente, status: novo }, descricao);
        setClientes((lista) => lista.map((c) => (c.id === cliente.id ? atualizado : c)));
      }

      setDetalhe(null);
      mostrar(`${cliente.nome} agora está em "${novo}".`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao alterar o status.', 'erro');
    }
  }

  async function excluirCliente(cliente: Cliente) {
    if (!confirm(`Excluir o cliente ${cliente.nome}? Esta ação não pode ser desfeita.`)) return;

    try {
      if (usandoBanco()) {
        await api.clientes.excluir(cliente.id);
        await recarregar();
      } else {
        setClientes((lista) => lista.filter((c) => c.id !== cliente.id));
      }

      setDetalhe(null);
      mostrar(`${cliente.nome} foi excluído.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao excluir.', 'erro');
    }
  }

  function abrirEdicao(cliente: Cliente) {
    setEditandoId(cliente.id);
    const { id: _i, criadoEm: _c, anexos: _a, historico: _h, ...campos } = cliente;
    setFormulario(campos);
    setDetalhe(null);
    setFormAberto(true);
  }

  function abrirNovo() {
    setEditandoId(null);
    setFormulario(CLIENTE_VAZIO);
    setFormAberto(true);
  }

  async function salvarNovo(evento: React.FormEvent) {
    evento.preventDefault();

    if (!formulario.nome.trim()) {
      mostrar('Informe o nome do cliente.', 'erro');
      return;
    }

    setSalvando(true);

    try {
      if (editandoId) {
        await api.clientes.atualizar(editandoId, formulario);
        await api.clientes.registrarHistorico(editandoId, usuario.nome, 'Cadastro atualizado.');
        await recarregar();
      } else if (usandoBanco()) {
        const criado = await api.clientes.criar(formulario);
        await api.clientes.registrarHistorico(criado.id, usuario.nome, 'Cliente cadastrado.');
        await recarregar();
      } else {
        const cliente: Cliente = {
          ...formulario,
          id: novoId('cli'),
          criadoEm: new Date().toISOString(),
          anexos: [],
          historico: [
            {
              id: novoId('hist'),
              em: new Date().toISOString(),
              autor: usuario.nome,
              descricao: 'Cliente cadastrado.',
            },
          ],
        };
        setClientes((lista) => [cliente, ...lista]);
      }

      setFormAberto(false);
      setFormulario(CLIENTE_VAZIO);
      setEditandoId(null);
      mostrar(`${formulario.nome} ${editandoId ? 'atualizado' : 'cadastrado'} com sucesso.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Troca o status direto pelo menu da tabela, sem abrir o detalhe.
   * Registra no histórico igual ao botão de avançar — a origem da mudança
   * não altera a necessidade de rastro.
   */
  async function mudarStatus(cliente: Cliente, novo: StatusCliente) {
    if (novo === cliente.status) return;
    const descricao = `Status alterado de ${cliente.status} para ${novo}.`;

    try {
      if (usandoBanco()) {
        await api.clientes.atualizar(cliente.id, { status: novo });
        await api.clientes.registrarHistorico(cliente.id, usuario.nome, descricao);
        await recarregar();
      } else {
        const atualizado = registrarHistorico({ ...cliente, status: novo }, descricao);
        setClientes((lista) => lista.map((c) => (c.id === cliente.id ? atualizado : c)));
      }
      mostrar(`${cliente.nome}: ${novo}.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao alterar o status.', 'erro');
    }
  }

  /* --- Colunas ---------------------------------------------------------- */
  const colunas: Coluna<Cliente>[] = [
    {
      chave: 'nome',
      rotulo: 'Cliente',
      ordenarPor: (c) => c.nome,
      render: (c) => (
        <div className={estilos.celulaCliente}>
          <strong>{c.nome}</strong>
          <span className="texto-secundario">
            {c.tipo} · {c.documento}
          </span>
        </div>
      ),
    },
    {
      chave: 'contato',
      rotulo: 'Contato',
      render: (c) => (
        <div className={estilos.celulaCliente}>
          <span>{c.telefone}</span>
          <span className="texto-secundario">{c.email || '—'}</span>
        </div>
      ),
    },
    {
      chave: 'volumeM3',
      rotulo: 'Volume',
      ordenarPor: (c) => c.volumeM3 ?? 0,
      render: (c) => descreverVolume(c.volumeM3),
    },
    {
      chave: 'dataPrevista',
      rotulo: 'Data prevista',
      ordenarPor: (c) => c.dataPrevista || '9999',
      render: (c) => (c.dataPrevista ? formatarData(c.dataPrevista) : 'A definir'),
    },
    {
      chave: 'origem',
      rotulo: 'Origem',
      ordenarPor: (c) => c.origem,
    },
    {
      chave: 'status',
      rotulo: 'Status',
      ordenarPor: (c) => c.status,
      render: (c) =>
        podeMexer ? (
          <select
            className={`${estilos.seletorStatus} ${estilos[`status_${tomDoStatus(c.status)}`]}`}
            value={c.status}
            // Sem isto, o clique no menu abriria o detalhe do cliente.
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              mudarStatus(c, e.target.value as StatusCliente);
            }}
            aria-label={`Status de ${c.nome}`}
          >
            {STATUS_CLIENTE.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <Badge texto={c.status} tom={tomDoStatus(c.status)} />
        ),
    },
  ];

  /* --- Métricas --------------------------------------------------------- */
  const porStatus = (s: StatusCliente) => clientes.filter((c) => c.status === s).length;

  return (
    <>
      <TituloPagina
        titulo="Clientes"
        subtitulo="Cadastro, funil comercial e histórico de atendimento."
        acoes={
          <button
            type="button"
            className="btn btn-primary"
            onClick={abrirNovo}
            disabled={!podeMexer}
            title={podeMexer ? undefined : 'Seu nível não permite cadastrar clientes'}
          >
            Novo cliente
          </button>
        }
      />

      {erroCarga && <div className={estilos.erroCarga}>{erroCarga}</div>}

      <GradeMetricas>
        <CardMetrica rotulo="Total de clientes" valor={String(clientes.length)} icone="clientes" />
        <CardMetrica rotulo="Novos" valor={String(porStatus('Novo'))} detalhe="Aguardando contato" />
        <CardMetrica
          rotulo="Em andamento"
          valor={String(porStatus('Em andamento'))}
          detalhe="Mudança contratada ou em negociação"
        />
        <CardMetrica
          rotulo="Concluídos"
          valor={String(porStatus('Concluído'))}
          detalhe="Atendimento finalizado"
          tom="positivo"
        />
      </GradeMetricas>

      <BarraFiltros>
        <CampoFiltro rotulo="Buscar">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, documento, e-mail ou telefone"
          />
        </CampoFiltro>

        <CampoFiltro rotulo="Status">
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_CLIENTE.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </CampoFiltro>

        <CampoFiltro rotulo="Origem">
          <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)}>
            <option value="">Todas</option>
            {ORIGENS_CLIENTE.map((o) => (
              <option key={o} value={o}>
                {o}
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
              setFiltroOrigem('');
            }}
          >
            Limpar
          </button>
        </AcoesFiltro>
      </BarraFiltros>

      <Tabela
        colunas={colunas}
        registros={filtrados}
        carregando={carregando}
        aoClicarLinha={(c) => {
          setDetalhe(c);
          setAbaDetalhe('dados');
        }}
        mensagemVazio="Nenhum cliente corresponde aos filtros aplicados."
        porPagina={8}
      />

      {/* ---------- Modal de detalhe ---------- */}
      <Modal
        titulo={detalhe?.nome ?? ''}
        aberto={detalhe !== null}
        aoFechar={() => setDetalhe(null)}
        largo
        rodape={
          detalhe && (
            <>
              {podeExcluir && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => excluirCliente(detalhe)}
                >
                  Excluir
                </button>
              )}
              {podeMexer && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => abrirEdicao(detalhe)}
                >
                  Editar
                </button>
              )}
              {podeMexer && !statusFinal(detalhe.status) && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => avancarStatus(detalhe)}
                >
                  Avançar para {proximoStatus(detalhe.status)}
                </button>
              )}
              <button type="button" className="btn btn-outline" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
            </>
          )
        }
      >
        {detalhe && (
          <>
            <Abas
              abas={[
                { chave: 'dados', rotulo: 'Dados' },
                { chave: 'anexos', rotulo: `Anexos (${detalhe.anexos.length})` },
                { chave: 'historico', rotulo: `Histórico (${detalhe.historico.length})` },
              ]}
              ativa={abaDetalhe}
              aoTrocar={setAbaDetalhe}
            />

            {abaDetalhe === 'dados' && (
              <dl className={estilos.listaDados}>
                <Dado rotulo="Tipo">{detalhe.tipo === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}</Dado>
                <Dado rotulo={detalhe.tipo === 'PF' ? 'CPF' : 'CNPJ'}>{detalhe.documento}</Dado>
                <Dado rotulo="Telefone">{detalhe.telefone}</Dado>
                <Dado rotulo="E-mail">{detalhe.email || '—'}</Dado>
                <Dado rotulo="Status">
                  <Badge texto={detalhe.status} tom={tomDoStatus(detalhe.status)} />
                </Dado>
                <Dado rotulo="Origem">
                  {detalhe.origem}
                  {detalhe.origemDetalhe ? ` — ${detalhe.origemDetalhe}` : ''}
                </Dado>
                <Dado rotulo="Volume estimado">{descreverVolume(detalhe.volumeM3)}</Dado>
                <Dado rotulo="Data prevista">
                  {detalhe.dataPrevista ? formatarData(detalhe.dataPrevista) : 'A definir'}
                </Dado>
                <Dado rotulo="Endereço de coleta" largo>
                  {detalhe.enderecoColeta || '—'}
                </Dado>
                <Dado rotulo="Endereço de entrega" largo>
                  {detalhe.enderecoEntrega || '—'}
                </Dado>
                <Dado rotulo="Observações" largo>
                  {detalhe.observacoes || '—'}
                </Dado>
              </dl>
            )}

            {abaDetalhe === 'anexos' && (
              <PainelAnexos
                dono="clientes"
                donoId={detalhe.id}
                anexos={detalhe.anexos.map((a) => ({
                  id: a.id,
                  nome: a.nome,
                  caminho: a.caminho ?? '',
                  tipo: a.tipo,
                  tamanho: a.tamanho,
                  enviadoEm: a.enviadoEm,
                }))}
                podeEnviar={podeMexer}
                podeExcluir={podeExcluir}
                aoMudar={async () => {
                  await recarregar();
                  const atualizado = await api.clientes.obter(detalhe.id);
                  if (atualizado) setDetalhe(atualizado);
                }}
              />
            )}

            {abaDetalhe === 'historico' && (
              <ol className={estilos.historico}>
                {[...detalhe.historico].reverse().map((h) => (
                  <li key={h.id}>
                    <div className={estilos.historicoMarcador} />
                    <div>
                      <strong>{h.descricao}</strong>
                      <span className="texto-secundario">
                        {formatarData(h.em.slice(0, 10))} · {h.autor}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Modal>

      {/* ---------- Modal de cadastro ---------- */}
      <Modal
        titulo={editandoId ? 'Editar cliente' : 'Novo cliente'}
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        largo
        rodape={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setFormAberto(false);
                setEditandoId(null);
              }}
            >
              Cancelar
            </button>
            <button type="submit" form="form-cliente" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Salvar cliente'}
            </button>
          </>
        }
      >
        <form id="form-cliente" onSubmit={salvarNovo}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="tipo">Tipo de pessoa</label>
              <select
                id="tipo"
                value={formulario.tipo}
                onChange={(e) =>
                  setFormulario({ ...formulario, tipo: e.target.value as 'PF' | 'PJ', documento: '' })
                }
              >
                <option value="PF">Pessoa física</option>
                <option value="PJ">Pessoa jurídica</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="nome">Nome / Razão social</label>
              <input
                id="nome"
                value={formulario.nome}
                onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="documento">{formulario.tipo === 'PF' ? 'CPF' : 'CNPJ'}</label>
              <input
                id="documento"
                value={formulario.documento}
                onChange={(e) =>
                  setFormulario({
                    ...formulario,
                    documento: mascararDocumento(e.target.value, formulario.tipo),
                  })
                }
                inputMode="numeric"
              />
            </div>

            <div className="field">
              <label htmlFor="telefone">Telefone</label>
              <input
                id="telefone"
                value={formulario.telefone}
                onChange={(e) =>
                  setFormulario({ ...formulario, telefone: mascararTelefone(e.target.value) })
                }
                inputMode="tel"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                value={formulario.email}
                onChange={(e) => setFormulario({ ...formulario, email: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="origem">Origem do contato</label>
              <select
                id="origem"
                value={formulario.origem}
                onChange={(e) =>
                  setFormulario({ ...formulario, origem: e.target.value as Cliente['origem'] })
                }
              >
                {ORIGENS_CLIENTE.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="volume">Volume estimado (m³)</label>
              <input
                id="volume"
                type="number"
                min="0"
                step="0.5"
                value={formulario.volumeM3 ?? ''}
                onChange={(e) =>
                  setFormulario({
                    ...formulario,
                    volumeM3: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              {formulario.volumeM3 !== null && (
                <p className="field-hint">Porte: {descreverVolume(formulario.volumeM3)}</p>
              )}
            </div>

            <div className="field">
              <label htmlFor="dataPrevista">Data prevista</label>
              <input
                id="dataPrevista"
                type="date"
                min={hojeISO()}
                value={formulario.dataPrevista}
                onChange={(e) => setFormulario({ ...formulario, dataPrevista: e.target.value })}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label htmlFor="coleta">Endereço de coleta</label>
            <input
              id="coleta"
              value={formulario.enderecoColeta}
              onChange={(e) => setFormulario({ ...formulario, enderecoColeta: e.target.value })}
            />
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label htmlFor="entrega">Endereço de entrega</label>
            <input
              id="entrega"
              value={formulario.enderecoEntrega}
              onChange={(e) => setFormulario({ ...formulario, enderecoEntrega: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="observacoes">Observações</label>
            <textarea
              id="observacoes"
              value={formulario.observacoes}
              onChange={(e) => setFormulario({ ...formulario, observacoes: e.target.value })}
              placeholder="Andar, elevador, itens frágeis, restrições de acesso…"
            />
          </div>
        </form>
      </Modal>
    </>
  );
}

function Dado({
  rotulo,
  children,
  largo = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  largo?: boolean;
}) {
  return (
    <div className={largo ? estilos.dadoLargo : undefined}>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
