'use client';

/**
 * FROTA — migrado de referencia/04-veiculos-motoristas_3.html
 *
 * Os dois cadastros ficam sob o mesmo módulo, em abas, como no original.
 * Lógica preservada: vínculo motorista↔veículo, máscara de placa Mercosul,
 * status de disponibilidade e alerta de vencimento de CNH.
 */

import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar, podeFazer } from '@/lib/permissoes';
import { formatarData, diasEntre, hojeISO, mascararPlaca } from '@/lib/utils/formato';
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

  const podeMexer = podeEditar(usuario.nivel, 'frota');
  const podeExcluir = podeFazer(usuario.nivel, 'excluir');

  useEffect(() => {
    Promise.all([api.veiculos.listar(), api.motoristas.listar()]).then(([v, m]) => {
      setVeiculos(v);
      setMotoristas(m);
      setCarregando(false);
    });
  }, []);

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

  function excluirVeiculo(v: Veiculo) {
    if (!confirm(`Excluir o veículo ${v.placa}?`)) return;
    setVeiculos((lista) => lista.filter((x) => x.id !== v.id));
    setVeiculoDetalhe(null);
    mostrar(`Veículo ${v.placa} excluído.`, 'sucesso');
  }

  function excluirMotorista(m: Motorista) {
    if (!confirm(`Excluir o motorista ${m.nome}?`)) return;
    setMotoristas((lista) => lista.filter((x) => x.id !== m.id));
    setMotoristaDetalhe(null);
    mostrar(`${m.nome} excluído.`, 'sucesso');
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
            onClick={() =>
              mostrar(
                'O cadastro grava no banco de dados — disponível quando a persistência entrar.',
                'aviso',
              )
            }
          >
            {aba === 'veiculos' ? 'Novo veículo' : 'Novo motorista'}
          </button>
        }
      />

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
          aoClicarLinha={setVeiculoDetalhe}
          mensagemVazio="Nenhum veículo corresponde aos filtros."
          porPagina={8}
        />
      ) : (
        <Tabela
          colunas={colunasMotorista}
          registros={motoristasFiltrados}
          carregando={carregando}
          aoClicarLinha={setMotoristaDetalhe}
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
