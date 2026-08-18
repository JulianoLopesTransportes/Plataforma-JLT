'use client';

/**
 * FROTA — migrado de referencia/04-veiculos-motoristas_3.html
 *
 * Os dois cadastros ficam sob o mesmo módulo, em abas, como no original.
 * Lógica preservada: vínculo motorista↔veículo, máscara de placa Mercosul,
 * status de disponibilidade e alerta de vencimento de CNH.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { api, usandoBanco } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar, podeFazer } from '@/lib/permissoes';
import {
  formatarData,
  diasEntre,
  hojeISO,
  mascararPlaca,
  mascararCPF,
  mascararTelefone,
  placaValida,
} from '@/lib/utils/formato';
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
  type TomBadge,
} from '@/components/ui';
import type { Veiculo, Motorista } from '@/lib/tipos';
import PainelAnexos from '@/components/modulos/PainelAnexos';
import estilos from './frota.module.css';

/** Quantos dias antes do vencimento a CNH já entra em alerta. */
const DIAS_ALERTA_CNH = 60;

const TOM_VEICULO: Record<Veiculo['status'], TomBadge> = {
  Disponível: 'success',
  'Em rota': 'info',
  Manutenção: 'warning',
  Inativo: 'neutro',
};

const TOM_MOTORISTA: Record<Motorista['status'], TomBadge> = {
  Ativo: 'success',
  'Em rota': 'info',
  Férias: 'warning',
  Inativo: 'neutro',
};

const VEICULO_VAZIO: Omit<Veiculo, 'id' | 'anexos'> = {
  placa: '',
  modelo: '',
  marca: '',
  ano: new Date().getFullYear(),
  capacidadeM3: 0,
  capacidadeKg: 0,
  status: 'Disponível',
  proximaManutencao: '',
  observacoes: '',
};

const MOTORISTA_VAZIO: Omit<Motorista, 'id' | 'anexos'> = {
  nome: '',
  cpf: '',
  telefone: '',
  cnh: '',
  categoriaCnh: 'D',
  validadeCnh: '',
  status: 'Ativo',
  veiculoId: null,
  admissao: '',
  observacoes: '',
};

export default function PaginaFrota() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [aba, setAba] = useState('veiculos');
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const [veiculoDetalhe, setVeiculoDetalhe] = useState<Veiculo | null>(null);
  const [motoristaDetalhe, setMotoristaDetalhe] = useState<Motorista | null>(null);

  const [formVeiculo, setFormVeiculo] = useState<Omit<Veiculo, 'id' | 'anexos'> | null>(null);
  const [formMotorista, setFormMotorista] = useState<Omit<Motorista, 'id' | 'anexos'> | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abaVeiculo, setAbaVeiculo] = useState('dados');
  const [abaMotorista, setAbaMotorista] = useState('dados');

  const podeMexer = podeEditar(usuario.nivel, 'frota');
  const podeExcluir = podeFazer(usuario.nivel, 'excluir');

  const recarregar = useCallback(async () => {
    try {
      const [v, m] = await Promise.all([api.veiculos.listar(), api.motoristas.listar()]);
      setVeiculos(v);
      setMotoristas(m);
      setErroCarga('');
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Falha ao carregar a frota.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Trocar de aba com filtros da outra aplicados só confunde.
  useEffect(() => {
    setBusca('');
    setFiltroStatus('');
  }, [aba]);

  const hoje = hojeISO();

  /** Nome do veículo para exibir na linha do motorista. */
  function nomeVeiculo(id: string | null): string {
    if (!id) return 'Sem veículo fixo';
    const v = veiculos.find((x) => x.id === id);
    return v ? `${v.placa} — ${v.modelo}` : 'Veículo não encontrado';
  }

  /** Dias até o vencimento da CNH. Negativo quando já venceu. */
  function diasParaVencerCnh(motorista: Motorista): number {
    return diasEntre(hoje, motorista.validadeCnh);
  }

  const veiculosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return veiculos.filter(
      (v) =>
        (!termo ||
          v.placa.toLowerCase().includes(termo) ||
          v.modelo.toLowerCase().includes(termo) ||
          v.marca.toLowerCase().includes(termo)) &&
        (!filtroStatus || v.status === filtroStatus),
    );
  }, [veiculos, busca, filtroStatus]);

  const motoristasFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return motoristas.filter(
      (m) =>
        (!termo || m.nome.toLowerCase().includes(termo) || m.cpf.includes(termo)) &&
        (!filtroStatus || m.status === filtroStatus),
    );
  }, [motoristas, busca, filtroStatus]);

  async function excluirVeiculo(v: Veiculo) {
    if (!confirm(`Excluir o veículo ${v.placa}?`)) return;
    try {
      if (usandoBanco()) {
        await api.veiculos.excluir(v.id);
        await recarregar();
      } else {
        setVeiculos((lista) => lista.filter((x) => x.id !== v.id));
      }
      setVeiculoDetalhe(null);
      mostrar(`Veículo ${v.placa} excluído.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao excluir.', 'erro');
    }
  }

  async function excluirMotorista(m: Motorista) {
    if (!confirm(`Excluir o motorista ${m.nome}?`)) return;
    try {
      if (usandoBanco()) {
        await api.motoristas.excluir(m.id);
        await recarregar();
      } else {
        setMotoristas((lista) => lista.filter((x) => x.id !== m.id));
      }
      setMotoristaDetalhe(null);
      mostrar(`${m.nome} excluído.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao excluir.', 'erro');
    }
  }

  /* --- Abrir formulários --- */
  function novoRegistro() {
    setEditandoId(null);
    if (aba === 'veiculos') setFormVeiculo(VEICULO_VAZIO);
    else setFormMotorista(MOTORISTA_VAZIO);
  }

  function editarVeiculo(v: Veiculo) {
    setEditandoId(v.id);
    setFormVeiculo({ ...v });
    setVeiculoDetalhe(null);
  }

  function editarMotorista(m: Motorista) {
    setEditandoId(m.id);
    setFormMotorista({ ...m });
    setMotoristaDetalhe(null);
  }

  /* --- Salvar --- */
  async function salvarVeiculo(evento: React.FormEvent) {
    evento.preventDefault();
    if (!formVeiculo) return;

    if (!placaValida(formVeiculo.placa)) {
      mostrar('Placa inválida. Use o padrão Mercosul (ABC1D23) ou o antigo (ABC1234).', 'erro');
      return;
    }
    if (!formVeiculo.modelo.trim()) {
      mostrar('Informe o modelo do veículo.', 'erro');
      return;
    }

    setSalvando(true);
    try {
      if (editandoId) await api.veiculos.atualizar(editandoId, formVeiculo);
      else await api.veiculos.criar(formVeiculo);
      await recarregar();
      setFormVeiculo(null);
      setEditandoId(null);
      mostrar(`Veículo ${formVeiculo.placa} salvo.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarMotorista(evento: React.FormEvent) {
    evento.preventDefault();
    if (!formMotorista) return;

    if (!formMotorista.nome.trim()) {
      mostrar('Informe o nome do motorista.', 'erro');
      return;
    }

    setSalvando(true);
    try {
      if (editandoId) await api.motoristas.atualizar(editandoId, formMotorista);
      else await api.motoristas.criar(formMotorista);
      await recarregar();
      setFormMotorista(null);
      setEditandoId(null);
      mostrar(`${formMotorista.nome} salvo.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  /* --- Colunas ---------------------------------------------------------- */

  const colunasVeiculo: Coluna<Veiculo>[] = [
    {
      chave: 'placa',
      rotulo: 'Placa',
      ordenarPor: (v) => v.placa,
      render: (v) => <span className={estilos.placa}>{mascararPlaca(v.placa)}</span>,
    },
    {
      chave: 'modelo',
      rotulo: 'Veículo',
      ordenarPor: (v) => v.modelo,
      render: (v) => (
        <div className={estilos.celulaDupla}>
          <strong>{v.modelo}</strong>
          <span className="texto-secundario">
            {v.marca} · {v.ano}
          </span>
        </div>
      ),
    },
    {
      chave: 'capacidadeM3',
      rotulo: 'Capacidade',
      numerico: true,
      ordenarPor: (v) => v.capacidadeM3,
      render: (v) => (
        <div className={estilos.celulaDupla}>
          <span>{v.capacidadeM3} m³</span>
          <span className="texto-secundario">{v.capacidadeKg.toLocaleString('pt-BR')} kg</span>
        </div>
      ),
    },
    {
      chave: 'proximaManutencao',
      rotulo: 'Próxima manutenção',
      ordenarPor: (v) => v.proximaManutencao || '9999',
      render: (v) => {
        if (!v.proximaManutencao) return <span className="texto-secundario">Não agendada</span>;
        const dias = diasEntre(hoje, v.proximaManutencao);
        return (
          <span className={dias <= 15 ? estilos.alerta : undefined}>
            {formatarData(v.proximaManutencao)}
            {dias <= 15 && dias >= 0 && <small> · em {dias} dia(s)</small>}
            {dias < 0 && <small> · atrasada</small>}
          </span>
        );
      },
    },
    {
      chave: 'status',
      rotulo: 'Status',
      ordenarPor: (v) => v.status,
      render: (v) => <Badge texto={v.status} tom={TOM_VEICULO[v.status]} />,
    },
  ];

  const colunasMotorista: Coluna<Motorista>[] = [
    {
      chave: 'nome',
      rotulo: 'Motorista',
      ordenarPor: (m) => m.nome,
      render: (m) => (
        <div className={estilos.celulaDupla}>
          <strong>{m.nome}</strong>
          <span className="texto-secundario">{m.cpf}</span>
        </div>
      ),
    },
    { chave: 'telefone', rotulo: 'Telefone' },
    {
      chave: 'cnh',
      rotulo: 'CNH',
      render: (m) => {
        const dias = diasParaVencerCnh(m);
        const emAlerta = dias <= DIAS_ALERTA_CNH;
        return (
          <div className={estilos.celulaDupla}>
            <span>Categoria {m.categoriaCnh}</span>
            <span className={emAlerta ? estilos.alerta : 'texto-secundario'}>
              {dias < 0 ? 'Vencida em ' : 'Vence '}
              {formatarData(m.validadeCnh)}
            </span>
          </div>
        );
      },
    },
    {
      chave: 'veiculoId',
      rotulo: 'Veículo vinculado',
      render: (m) => nomeVeiculo(m.veiculoId),
    },
    {
      chave: 'status',
      rotulo: 'Status',
      ordenarPor: (m) => m.status,
      render: (m) => <Badge texto={m.status} tom={TOM_MOTORISTA[m.status]} />,
    },
  ];

  /* --- Métricas --------------------------------------------------------- */
  const disponiveis = veiculos.filter((v) => v.status === 'Disponível').length;
  const capacidadeTotal = veiculos
    .filter((v) => v.status !== 'Inativo')
    .reduce((s, v) => s + v.capacidadeM3, 0);
  const motoristasAtivos = motoristas.filter((m) => m.status !== 'Inativo').length;
  const cnhVencendo = motoristas.filter(
    (m) => m.status !== 'Inativo' && diasParaVencerCnh(m) <= DIAS_ALERTA_CNH,
  ).length;

  const statusDisponiveis =
    aba === 'veiculos'
      ? ['Disponível', 'Em rota', 'Manutenção', 'Inativo']
      : ['Ativo', 'Em rota', 'Férias', 'Inativo'];

  return (
    <>
      <TituloPagina
        titulo="Frota"
        subtitulo="Veículos, motoristas e seus vínculos."
        acoes={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!podeMexer}
            title={podeMexer ? undefined : 'Seu nível não permite alterar a frota'}
            onClick={novoRegistro}
          >
            {aba === 'veiculos' ? 'Novo veículo' : 'Novo motorista'}
          </button>
        }
      />

      {erroCarga && <div className={estilos.erroCarga}>{erroCarga}</div>}

      <GradeMetricas>
        <CardMetrica
          rotulo="Veículos disponíveis"
          valor={`${disponiveis} de ${veiculos.length}`}
          detalhe="Prontos para escala"
          icone="veiculo"
        />
        <CardMetrica
          rotulo="Capacidade da frota"
          valor={`${capacidadeTotal} m³`}
          detalhe="Somando veículos não inativos"
        />
        <CardMetrica
          rotulo="Motoristas ativos"
          valor={String(motoristasAtivos)}
          detalhe={`${motoristas.length} cadastrados`}
          icone="motorista"
        />
        <CardMetrica
          rotulo="CNH a vencer"
          valor={String(cnhVencendo)}
          detalhe={`Nos próximos ${DIAS_ALERTA_CNH} dias`}
          icone="alerta"
          tom={cnhVencendo > 0 ? 'negativo' : undefined}
        />
      </GradeMetricas>

      <Abas
        abas={[
          { chave: 'veiculos', rotulo: `Veículos (${veiculos.length})` },
          { chave: 'motoristas', rotulo: `Motoristas (${motoristas.length})` },
        ]}
        ativa={aba}
        aoTrocar={setAba}
      />

      <BarraFiltros>
        <CampoFiltro rotulo="Buscar">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={aba === 'veiculos' ? 'Placa, modelo ou marca' : 'Nome ou CPF'}
          />
        </CampoFiltro>

        <CampoFiltro rotulo="Status">
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            {statusDisponiveis.map((s) => (
              <option key={s} value={s}>
                {s}
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

      {aba === 'veiculos' ? (
        <Tabela
          colunas={colunasVeiculo}
          registros={veiculosFiltrados}
          carregando={carregando}
          aoClicarLinha={(v) => {
            setVeiculoDetalhe(v);
            setAbaVeiculo('dados');
          }}
          mensagemVazio="Nenhum veículo corresponde aos filtros."
          porPagina={8}
        />
      ) : (
        <Tabela
          colunas={colunasMotorista}
          registros={motoristasFiltrados}
          carregando={carregando}
          aoClicarLinha={(m) => {
            setMotoristaDetalhe(m);
            setAbaMotorista('dados');
          }}
          mensagemVazio="Nenhum motorista corresponde aos filtros."
          porPagina={8}
        />
      )}

      {/* ---------- Detalhe do veículo ---------- */}
      <Modal
        titulo={veiculoDetalhe ? `${veiculoDetalhe.placa} — ${veiculoDetalhe.modelo}` : ''}
        aberto={veiculoDetalhe !== null}
        aoFechar={() => setVeiculoDetalhe(null)}
        rodape={
          veiculoDetalhe && (
            <>
              {podeExcluir && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => excluirVeiculo(veiculoDetalhe)}
                >
                  Excluir
                </button>
              )}
              {podeMexer && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => editarVeiculo(veiculoDetalhe)}
                >
                  Editar
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setVeiculoDetalhe(null)}
              >
                Fechar
              </button>
            </>
          )
        }
      >
        {veiculoDetalhe && (
          <>
            <Abas
              abas={[
                { chave: 'dados', rotulo: 'Dados' },
                { chave: 'anexos', rotulo: `Anexos (${veiculoDetalhe.anexos.length})` },
              ]}
              ativa={abaVeiculo}
              aoTrocar={setAbaVeiculo}
            />

            {abaVeiculo === 'anexos' ? (
              <PainelAnexos
                dono="veiculos"
                donoId={veiculoDetalhe.id}
                anexos={veiculoDetalhe.anexos.map((a) => ({
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
                  const atualizado = await api.veiculos.obter(veiculoDetalhe.id);
                  if (atualizado) setVeiculoDetalhe(atualizado);
                }}
              />
            ) : (
          <dl className={estilos.listaDados}>
            <Dado rotulo="Placa">{veiculoDetalhe.placa}</Dado>
            <Dado rotulo="Status">
              <Badge texto={veiculoDetalhe.status} tom={TOM_VEICULO[veiculoDetalhe.status]} />
            </Dado>
            <Dado rotulo="Marca / modelo">
              {veiculoDetalhe.marca} {veiculoDetalhe.modelo}
            </Dado>
            <Dado rotulo="Ano">{veiculoDetalhe.ano}</Dado>
            <Dado rotulo="Capacidade em volume">{veiculoDetalhe.capacidadeM3} m³</Dado>
            <Dado rotulo="Capacidade em peso">
              {veiculoDetalhe.capacidadeKg.toLocaleString('pt-BR')} kg
            </Dado>
            <Dado rotulo="Próxima manutenção">
              {veiculoDetalhe.proximaManutencao
                ? formatarData(veiculoDetalhe.proximaManutencao)
                : 'Não agendada'}
            </Dado>
            <Dado rotulo="Motorista vinculado">
              {motoristas.find((m) => m.veiculoId === veiculoDetalhe.id)?.nome ?? 'Nenhum'}
            </Dado>
            <Dado rotulo="Observações" largo>
              {veiculoDetalhe.observacoes || '—'}
            </Dado>
          </dl>
            )}
          </>
        )}
      </Modal>

      {/* ---------- Detalhe do motorista ---------- */}
      <Modal
        titulo={motoristaDetalhe?.nome ?? ''}
        aberto={motoristaDetalhe !== null}
        aoFechar={() => setMotoristaDetalhe(null)}
        rodape={
          motoristaDetalhe && (
            <>
              {podeExcluir && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => excluirMotorista(motoristaDetalhe)}
                >
                  Excluir
                </button>
              )}
              {podeMexer && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => editarMotorista(motoristaDetalhe)}
                >
                  Editar
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setMotoristaDetalhe(null)}
              >
                Fechar
              </button>
            </>
          )
        }
      >
        {motoristaDetalhe && (
          <>
            <Abas
              abas={[
                { chave: 'dados', rotulo: 'Dados' },
                { chave: 'anexos', rotulo: `Anexos (${motoristaDetalhe.anexos.length})` },
              ]}
              ativa={abaMotorista}
              aoTrocar={setAbaMotorista}
            />

            {abaMotorista === 'anexos' ? (
              <PainelAnexos
                dono="motoristas"
                donoId={motoristaDetalhe.id}
                anexos={motoristaDetalhe.anexos.map((a) => ({
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
                  const atualizado = await api.motoristas.obter(motoristaDetalhe.id);
                  if (atualizado) setMotoristaDetalhe(atualizado);
                }}
              />
            ) : (
          <dl className={estilos.listaDados}>
            <Dado rotulo="CPF">{motoristaDetalhe.cpf}</Dado>
            <Dado rotulo="Status">
              <Badge texto={motoristaDetalhe.status} tom={TOM_MOTORISTA[motoristaDetalhe.status]} />
            </Dado>
            <Dado rotulo="Telefone">{motoristaDetalhe.telefone}</Dado>
            <Dado rotulo="Admissão">{formatarData(motoristaDetalhe.admissao)}</Dado>
            <Dado rotulo="CNH">
              {motoristaDetalhe.cnh} · categoria {motoristaDetalhe.categoriaCnh}
            </Dado>
            <Dado rotulo="Validade da CNH">
              {formatarData(motoristaDetalhe.validadeCnh)}
              {diasParaVencerCnh(motoristaDetalhe) <= DIAS_ALERTA_CNH && (
                <span className={estilos.alerta}> · atenção</span>
              )}
            </Dado>
            <Dado rotulo="Veículo vinculado" largo>
              {nomeVeiculo(motoristaDetalhe.veiculoId)}
            </Dado>
            <Dado rotulo="Observações" largo>
              {motoristaDetalhe.observacoes || '—'}
            </Dado>
          </dl>
            )}
          </>
        )}
      </Modal>

      {/* ---------- Formulário de veículo ---------- */}
      <Modal
        titulo={editandoId ? 'Editar veículo' : 'Novo veículo'}
        aberto={formVeiculo !== null}
        aoFechar={() => setFormVeiculo(null)}
        largo
        rodape={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFormVeiculo(null)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="form-veiculo"
              className="btn btn-primary"
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : 'Salvar veículo'}
            </button>
          </>
        }
      >
        {formVeiculo && (
          <form id="form-veiculo" onSubmit={salvarVeiculo}>
            <div className="form-row-3">
              <div className="field">
                <label htmlFor="placa">Placa</label>
                <input
                  id="placa"
                  value={formVeiculo.placa}
                  onChange={(e) =>
                    setFormVeiculo({ ...formVeiculo, placa: mascararPlaca(e.target.value) })
                  }
                  placeholder="ABC1D23"
                  required
                />
                <p className="field-hint">Mercosul ou padrão antigo.</p>
              </div>

              <div className="field">
                <label htmlFor="marca">Marca</label>
                <input
                  id="marca"
                  value={formVeiculo.marca}
                  onChange={(e) => setFormVeiculo({ ...formVeiculo, marca: e.target.value })}
                  placeholder="Mercedes-Benz"
                />
              </div>

              <div className="field">
                <label htmlFor="modelo">Modelo</label>
                <input
                  id="modelo"
                  value={formVeiculo.modelo}
                  onChange={(e) => setFormVeiculo({ ...formVeiculo, modelo: e.target.value })}
                  placeholder="Accelo 1016"
                  required
                />
              </div>
            </div>

            <div className="form-row-3">
              <div className="field">
                <label htmlFor="ano">Ano</label>
                <input
                  id="ano"
                  type="number"
                  min="1970"
                  max={new Date().getFullYear() + 1}
                  value={formVeiculo.ano || ''}
                  onChange={(e) => setFormVeiculo({ ...formVeiculo, ano: Number(e.target.value) })}
                />
              </div>

              <div className="field">
                <label htmlFor="capM3">Capacidade (m³)</label>
                <input
                  id="capM3"
                  type="number"
                  min="0"
                  step="0.5"
                  value={formVeiculo.capacidadeM3 || ''}
                  onChange={(e) =>
                    setFormVeiculo({ ...formVeiculo, capacidadeM3: Number(e.target.value) })
                  }
                />
                <p className="field-hint">Usada no cálculo de ocupação das rotas.</p>
              </div>

              <div className="field">
                <label htmlFor="capKg">Capacidade (kg)</label>
                <input
                  id="capKg"
                  type="number"
                  min="0"
                  value={formVeiculo.capacidadeKg || ''}
                  onChange={(e) =>
                    setFormVeiculo({ ...formVeiculo, capacidadeKg: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="statusV">Status</label>
                <select
                  id="statusV"
                  value={formVeiculo.status}
                  onChange={(e) =>
                    setFormVeiculo({ ...formVeiculo, status: e.target.value as Veiculo['status'] })
                  }
                >
                  {(['Disponível', 'Em rota', 'Manutenção', 'Inativo'] as const).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="manut">Próxima manutenção</label>
                <input
                  id="manut"
                  type="date"
                  value={formVeiculo.proximaManutencao}
                  onChange={(e) =>
                    setFormVeiculo({ ...formVeiculo, proximaManutencao: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="obsV">Observações</label>
              <textarea
                id="obsV"
                value={formVeiculo.observacoes}
                onChange={(e) => setFormVeiculo({ ...formVeiculo, observacoes: e.target.value })}
              />
            </div>
          </form>
        )}
      </Modal>

      {/* ---------- Formulário de motorista ---------- */}
      <Modal
        titulo={editandoId ? 'Editar motorista' : 'Novo motorista'}
        aberto={formMotorista !== null}
        aoFechar={() => setFormMotorista(null)}
        largo
        rodape={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFormMotorista(null)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="form-motorista"
              className="btn btn-primary"
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : 'Salvar motorista'}
            </button>
          </>
        }
      >
        {formMotorista && (
          <form id="form-motorista" onSubmit={salvarMotorista}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="nomeM">Nome completo</label>
                <input
                  id="nomeM"
                  value={formMotorista.nome}
                  onChange={(e) => setFormMotorista({ ...formMotorista, nome: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="cpfM">CPF</label>
                <input
                  id="cpfM"
                  value={formMotorista.cpf}
                  onChange={(e) =>
                    setFormMotorista({ ...formMotorista, cpf: mascararCPF(e.target.value) })
                  }
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="telM">Telefone</label>
                <input
                  id="telM"
                  value={formMotorista.telefone}
                  onChange={(e) =>
                    setFormMotorista({ ...formMotorista, telefone: mascararTelefone(e.target.value) })
                  }
                  inputMode="tel"
                />
              </div>

              <div className="field">
                <label htmlFor="admM">Admissão</label>
                <input
                  id="admM"
                  type="date"
                  value={formMotorista.admissao}
                  onChange={(e) => setFormMotorista({ ...formMotorista, admissao: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row-3">
              <div className="field">
                <label htmlFor="cnhM">Número da CNH</label>
                <input
                  id="cnhM"
                  value={formMotorista.cnh}
                  onChange={(e) => setFormMotorista({ ...formMotorista, cnh: e.target.value })}
                  inputMode="numeric"
                />
              </div>

              <div className="field">
                <label htmlFor="catM">Categoria</label>
                <select
                  id="catM"
                  value={formMotorista.categoriaCnh ?? 'D'}
                  onChange={(e) =>
                    setFormMotorista({
                      ...formMotorista,
                      categoriaCnh: e.target.value as Motorista['categoriaCnh'],
                    })
                  }
                >
                  {(['B', 'C', 'D', 'E'] as const).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="valM">Validade da CNH</label>
                <input
                  id="valM"
                  type="date"
                  value={formMotorista.validadeCnh}
                  onChange={(e) =>
                    setFormMotorista({ ...formMotorista, validadeCnh: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="statusM">Status</label>
                <select
                  id="statusM"
                  value={formMotorista.status}
                  onChange={(e) =>
                    setFormMotorista({
                      ...formMotorista,
                      status: e.target.value as Motorista['status'],
                    })
                  }
                >
                  {(['Ativo', 'Em rota', 'Férias', 'Inativo'] as const).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="veicM">Veículo vinculado</label>
                <select
                  id="veicM"
                  value={formMotorista.veiculoId ?? ''}
                  onChange={(e) =>
                    setFormMotorista({ ...formMotorista, veiculoId: e.target.value || null })
                  }
                >
                  <option value="">Sem veículo fixo</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.placa} — {v.modelo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="obsM">Observações</label>
              <textarea
                id="obsM"
                value={formMotorista.observacoes}
                onChange={(e) =>
                  setFormMotorista({ ...formMotorista, observacoes: e.target.value })
                }
              />
            </div>
          </form>
        )}
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
