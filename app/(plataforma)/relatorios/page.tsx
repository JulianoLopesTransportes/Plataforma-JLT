'use client';

/**
 * RELATÓRIOS — módulo novo, não existia nos arquivos originais.
 *
 * Filtros por período, cliente, motorista, veículo e status; três formas de
 * visualização (evolução temporal, comparativo por categoria e distribuição)
 * e exportação em CSV.
 *
 * RECORTE POR NÍVEL — a regra que o briefing fixa:
 *   Comercial   não vê custo.
 *   Operacional não vê faturamento.
 * Isso não é um `if` solto aqui: sai de podeFazer('ver_custos') e
 * podeFazer('ver_faturamento'), e vale para as métricas, as séries do
 * gráfico, as colunas da tabela E as colunas do CSV exportado — não
 * adianta esconder na tela e deixar vazar na exportação.
 */

import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeFazer } from '@/lib/permissoes';
import { formatarBRL, formatarData, nomeDoMes } from '@/lib/utils/formato';
import { baixarCSV, numeroParaCSV } from '@/lib/utils/csv';
import { volumeTotal } from '@/lib/negocio/rotas';
import {
  TituloPagina,
  Tabela,
  Badge,
  BarraFiltros,
  CampoFiltro,
  AcoesFiltro,
  GradeMetricas,
  CardMetrica,
  Abas,
  useToast,
  EstadoVazio,
  type Coluna,
} from '@/components/ui';
import Grafico from '@/components/ui/Grafico';
import type { Lancamento, Cliente, Veiculo, Motorista, Rota, Orcamento } from '@/lib/tipos';
import estilos from './relatorios.module.css';

/** Linha consolidada do relatório — uma operação de transporte. */
type LinhaRelatorio = {
  id: string;
  rotaNome: string;
  clienteNome: string;
  clienteId: string | null;
  veiculoId: string | null;
  veiculoLabel: string;
  motoristaId: string | null;
  motoristaLabel: string;
  status: string;
  data: string;
  volumeM3: number;
  /** Receita atribuída — só para quem pode ver faturamento. */
  receita: number;
  /** Custo atribuído — só para quem pode ver custos. */
  custo: number;
};

export default function PaginaRelatorios() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [rotas, setRotas] = useState<Rota[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroMotorista, setFiltroMotorista] = useState('');
  const [filtroVeiculo, setFiltroVeiculo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [visao, setVisao] = useState('evolucao');

  const verCustos = podeFazer(usuario.nivel, 'ver_custos');
  const verFaturamento = podeFazer(usuario.nivel, 'ver_faturamento');
  const podeExportar = podeFazer(usuario.nivel, 'exportar');

  useEffect(() => {
    Promise.all([
      api.rotas.listar(),
      api.clientes.listar(),
      api.veiculos.listar(),
      api.motoristas.listar(),
      api.financeiro.listar(),
      api.orcamentos.listar(),
    ]).then(([r, c, v, m, l, o]) => {
      setRotas(r);
      setClientes(c);
      setVeiculos(v);
      setMotoristas(m);
      setLancamentos(l);
      setOrcamentos(o);
      setCarregando(false);
    });
  }, []);

  /* ======================================================================
     Consolidação: cada rota vira uma linha, com receita e custo atribuídos
     ====================================================================== */
  const linhas: LinhaRelatorio[] = useMemo(() => {
    return rotas.map((rota) => {
      const veiculo = veiculos.find((v) => v.id === rota.veiculoId);
      const motorista = motoristas.find((m) => m.id === rota.motoristaId);

      // Nomes dos clientes que têm carga nesta rota.
      const nomesClientes = rota.mudancas.map((m) => m.clienteNome);

      // Cliente da plataforma correspondente à primeira carga, quando existe.
      const clienteVinculado = clientes.find((c) => nomesClientes.includes(c.nome));

      // Receita: orçamentos aprovados dos clientes desta rota.
      const receita = orcamentos
        .filter((o) => o.status === 'aprovado' && nomesClientes.includes(o.clienteNome))
        .reduce((s, o) => s + o.valorFinal, 0);

      // Custo: lançamentos de gasto vinculados ao veículo ou motorista da rota
      // dentro da janela de datas dela. É uma atribuição aproximada, e por
      // isso está declarada como tal na tela — não inventamos rateio.
      const custo = lancamentos
        .filter(
          (l) =>
            l.tipo === 'gasto' &&
            l.data >= rota.dataSaida &&
            l.data <= rota.dataPrevistaRetorno &&
            ((rota.veiculoId && l.veiculoId === rota.veiculoId) ||
              (rota.motoristaId && l.motoristaId === rota.motoristaId)),
        )
        .reduce((s, l) => s + l.valor, 0);

      return {
        id: rota.id,
        rotaNome: rota.nome,
        clienteNome: nomesClientes.join(', ') || '—',
        clienteId: clienteVinculado?.id ?? null,
        veiculoId: rota.veiculoId,
        veiculoLabel: veiculo ? `${veiculo.placa} — ${veiculo.modelo}` : 'Não atribuído',
        motoristaId: rota.motoristaId,
        motoristaLabel: motorista?.nome ?? 'Não atribuído',
        status: rota.status,
        data: rota.dataSaida,
        volumeM3: volumeTotal(rota),
        receita,
        custo,
      };
    });
  }, [rotas, veiculos, motoristas, clientes, orcamentos, lancamentos]);

  const filtradas = useMemo(
    () =>
      linhas.filter(
        (l) =>
          (!de || l.data >= de) &&
          (!ate || l.data <= ate) &&
          (!filtroCliente || l.clienteId === filtroCliente) &&
          (!filtroMotorista || l.motoristaId === filtroMotorista) &&
          (!filtroVeiculo || l.veiculoId === filtroVeiculo) &&
          (!filtroStatus || l.status === filtroStatus),
      ),
    [linhas, de, ate, filtroCliente, filtroMotorista, filtroVeiculo, filtroStatus],
  );

  /* ======================================================================
     Séries dos gráficos
     ====================================================================== */

  /** Evolução temporal — agrupa por mês. */
  const evolucao = useMemo(() => {
    const meses = [...new Set(filtradas.map((l) => l.data.slice(0, 7)))].sort();
    return {
      rotulos: meses.map((m) => {
        const [ano, mes] = m.split('-');
        return `${nomeDoMes(Number(mes) - 1).slice(0, 3)}/${ano.slice(2)}`;
      }),
      receita: meses.map((m) =>
        filtradas.filter((l) => l.data.startsWith(m)).reduce((s, l) => s + l.receita, 0),
      ),
      custo: meses.map((m) =>
        filtradas.filter((l) => l.data.startsWith(m)).reduce((s, l) => s + l.custo, 0),
      ),
      volume: meses.map((m) =>
        filtradas.filter((l) => l.data.startsWith(m)).reduce((s, l) => s + l.volumeM3, 0),
      ),
    };
  }, [filtradas]);

  /** Comparativo por veículo. */
  const porVeiculo = useMemo(() => {
    const mapa = new Map<string, { volume: number; receita: number; custo: number }>();
    for (const l of filtradas) {
      const atual = mapa.get(l.veiculoLabel) ?? { volume: 0, receita: 0, custo: 0 };
      mapa.set(l.veiculoLabel, {
        volume: atual.volume + l.volumeM3,
        receita: atual.receita + l.receita,
        custo: atual.custo + l.custo,
      });
    }
    return [...mapa.entries()].sort((a, b) => b[1].volume - a[1].volume);
  }, [filtradas]);

  /** Distribuição por status de rota. */
  const porStatus = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of filtradas) mapa.set(l.status, (mapa.get(l.status) ?? 0) + 1);
    return [...mapa.entries()];
  }, [filtradas]);

  /* ======================================================================
     Totais
     ====================================================================== */
  const totalReceita = filtradas.reduce((s, l) => s + l.receita, 0);
  const totalCusto = filtradas.reduce((s, l) => s + l.custo, 0);
  const totalVolume = filtradas.reduce((s, l) => s + l.volumeM3, 0);

  /* ======================================================================
     Exportação — respeita o mesmo recorte da tela
     ====================================================================== */
  function exportar() {
    const cabecalho = [
      'Rota',
      'Data de saída',
      'Cliente(s)',
      'Veículo',
      'Motorista',
      'Status',
      'Volume (m³)',
      ...(verFaturamento ? ['Receita (R$)'] : []),
      ...(verCustos ? ['Custo (R$)'] : []),
      ...(verFaturamento && verCustos ? ['Resultado (R$)'] : []),
    ];

    const corpo = filtradas.map((l) => [
      l.rotaNome,
      formatarData(l.data),
      l.clienteNome,
      l.veiculoLabel,
      l.motoristaLabel,
      l.status,
      numeroParaCSV(l.volumeM3),
      ...(verFaturamento ? [numeroParaCSV(l.receita)] : []),
      ...(verCustos ? [numeroParaCSV(l.custo)] : []),
      ...(verFaturamento && verCustos ? [numeroParaCSV(l.receita - l.custo)] : []),
    ]);

    baixarCSV('relatorio-operacoes-jlt', [cabecalho, ...corpo]);
    mostrar(`${filtradas.length} operações exportadas.`, 'sucesso');
  }

  /* ======================================================================
     Colunas — montadas conforme o nível
     ====================================================================== */
  const colunas: Coluna<LinhaRelatorio>[] = [
    {
      chave: 'rotaNome',
      rotulo: 'Rota',
      ordenarPor: (l) => l.rotaNome,
      render: (l) => (
        <div className={estilos.celulaDupla}>
          <strong>{l.rotaNome}</strong>
          <span className="texto-secundario">{l.clienteNome}</span>
        </div>
      ),
    },
    {
      chave: 'data',
      rotulo: 'Saída',
      ordenarPor: (l) => l.data,
      render: (l) => formatarData(l.data),
    },
    { chave: 'veiculoLabel', rotulo: 'Veículo', ordenarPor: (l) => l.veiculoLabel },
    { chave: 'motoristaLabel', rotulo: 'Motorista', ordenarPor: (l) => l.motoristaLabel },
    {
      chave: 'volumeM3',
      rotulo: 'Volume',
      numerico: true,
      ordenarPor: (l) => l.volumeM3,
      render: (l) => `${l.volumeM3} m³`,
    },
    ...(verFaturamento
      ? ([
          {
            chave: 'receita',
            rotulo: 'Receita',
            numerico: true,
            ordenarPor: (l: LinhaRelatorio) => l.receita,
            render: (l: LinhaRelatorio) =>
              l.receita > 0 ? formatarBRL(l.receita) : <span className="texto-secundario">—</span>,
          },
        ] as Coluna<LinhaRelatorio>[])
      : []),
    ...(verCustos
      ? ([
          {
            chave: 'custo',
            rotulo: 'Custo',
            numerico: true,
            ordenarPor: (l: LinhaRelatorio) => l.custo,
            render: (l: LinhaRelatorio) =>
              l.custo > 0 ? formatarBRL(l.custo) : <span className="texto-secundario">—</span>,
          },
        ] as Coluna<LinhaRelatorio>[])
      : []),
    ...(verFaturamento && verCustos
      ? ([
          {
            chave: 'resultado',
            rotulo: 'Resultado',
            numerico: true,
            ordenarPor: (l: LinhaRelatorio) => l.receita - l.custo,
            render: (l: LinhaRelatorio) => {
              const r = l.receita - l.custo;
              if (l.receita === 0 && l.custo === 0)
                return <span className="texto-secundario">—</span>;
              return (
                <strong className={r >= 0 ? estilos.positivo : estilos.negativo}>
                  {formatarBRL(r)}
                </strong>
              );
            },
          },
        ] as Coluna<LinhaRelatorio>[])
      : []),
    {
      chave: 'status',
      rotulo: 'Status',
      ordenarPor: (l) => l.status,
      render: (l) => <Badge texto={ROTULO_STATUS[l.status] ?? l.status} tom="neutro" />,
    },
  ];

  const semRecorteFinanceiro = !verCustos || !verFaturamento;

  return (
    <>
      <TituloPagina
        titulo="Relatórios"
        subtitulo="Consolidação das operações por período, cliente, motorista e veículo."
        acoes={
          <button
            type="button"
            className="btn btn-outline"
            onClick={exportar}
            disabled={!podeExportar || filtradas.length === 0}
          >
            Exportar CSV
          </button>
        }
      />

      {semRecorteFinanceiro && (
        <p className={estilos.avisoRecorte}>
          {!verCustos && !verFaturamento
            ? 'Seu nível de acesso não exibe dados financeiros neste relatório.'
            : !verCustos
              ? 'Seu nível de acesso não exibe custo interno — o relatório mostra volume e faturamento.'
              : 'Seu nível de acesso não exibe faturamento — o relatório mostra volume e custos operacionais.'}{' '}
          O mesmo recorte se aplica ao arquivo exportado.
        </p>
      )}

      <BarraFiltros>
        <CampoFiltro rotulo="De">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </CampoFiltro>

        <CampoFiltro rotulo="Até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </CampoFiltro>

        <CampoFiltro rotulo="Cliente">
          <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </CampoFiltro>

        <CampoFiltro rotulo="Motorista">
          <select value={filtroMotorista} onChange={(e) => setFiltroMotorista(e.target.value)}>
            <option value="">Todos</option>
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </CampoFiltro>

        <CampoFiltro rotulo="Veículo">
          <select value={filtroVeiculo} onChange={(e) => setFiltroVeiculo(e.target.value)}>
            <option value="">Todos</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa} — {v.modelo}
              </option>
            ))}
          </select>
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
              setDe('');
              setAte('');
              setFiltroCliente('');
              setFiltroMotorista('');
              setFiltroVeiculo('');
              setFiltroStatus('');
            }}
          >
            Limpar
          </button>
        </AcoesFiltro>
      </BarraFiltros>

      <GradeMetricas>
        <CardMetrica
          rotulo="Operações"
          valor={String(filtradas.length)}
          detalhe={`de ${linhas.length} no total`}
          icone="rotas"
        />
        <CardMetrica
          rotulo="Volume transportado"
          valor={`${totalVolume} m³`}
          detalhe="Soma das cargas no período"
          icone="veiculo"
        />
        {verFaturamento && (
          <CardMetrica
            rotulo="Faturamento"
            valor={totalReceita > 0 ? formatarBRL(totalReceita) : null}
            detalhe={
              totalReceita > 0
                ? 'Orçamentos aprovados das cargas'
                : 'Nenhum orçamento aprovado no filtro'
            }
            tom="positivo"
            icone="financeiro"
          />
        )}
        {verCustos && (
          <CardMetrica
            rotulo="Custo atribuído"
            valor={totalCusto > 0 ? formatarBRL(totalCusto) : null}
            detalhe={
              totalCusto > 0
                ? 'Lançamentos ligados ao veículo/motorista'
                : 'Sem custo vinculado no período'
            }
            tom="negativo"
            icone="financeiro"
          />
        )}
        {verFaturamento && verCustos && (
          <CardMetrica
            rotulo="Resultado"
            valor={formatarBRL(totalReceita - totalCusto)}
            detalhe="Faturamento menos custo atribuído"
            tom={totalReceita - totalCusto >= 0 ? 'positivo' : 'negativo'}
            icone="relatorios"
          />
        )}
      </GradeMetricas>

      {/* ---------- Visualizações ---------- */}
      <div className="card" style={{ marginBottom: 20 }}>
        <Abas
          abas={[
            { chave: 'evolucao', rotulo: 'Evolução temporal' },
            { chave: 'veiculo', rotulo: 'Comparativo por veículo' },
            { chave: 'status', rotulo: 'Distribuição por status' },
          ]}
          ativa={visao}
          aoTrocar={setVisao}
        />

        {filtradas.length === 0 ? (
          <div className="estado-vazio">
            <strong>Sem dados no filtro</strong>
            Nenhuma operação corresponde aos filtros aplicados.
          </div>
        ) : (
          <>
            {visao === 'evolucao' && (
              <Grafico
                tipo="line"
                rotulos={evolucao.rotulos}
                series={[
                  ...(verFaturamento
                    ? [{ rotulo: 'Faturamento', dados: evolucao.receita, cor: 3 }]
                    : []),
                  ...(verCustos ? [{ rotulo: 'Custo', dados: evolucao.custo, cor: 0 }] : []),
                  // Sem dado financeiro nenhum, o volume vira a série principal.
                  ...(!verFaturamento && !verCustos
                    ? [{ rotulo: 'Volume (m³)', dados: evolucao.volume, cor: 2 }]
                    : []),
                ]}
                formatarValor={verFaturamento || verCustos ? formatarBRL : undefined}
                altura={300}
              />
            )}

            {visao === 'veiculo' && (
              <Grafico
                tipo="bar"
                rotulos={porVeiculo.map(([nome]) => nome)}
                series={[
                  { rotulo: 'Volume (m³)', dados: porVeiculo.map(([, d]) => d.volume), cor: 2 },
                  ...(verFaturamento
                    ? [
                        {
                          rotulo: 'Faturamento',
                          dados: porVeiculo.map(([, d]) => d.receita),
                          cor: 3,
                        },
                      ]
                    : []),
                  ...(verCustos
                    ? [{ rotulo: 'Custo', dados: porVeiculo.map(([, d]) => d.custo), cor: 0 }]
                    : []),
                ]}
                altura={300}
              />
            )}

            {visao === 'status' && (
              <Grafico
                tipo="doughnut"
                rotulos={porStatus.map(([s]) => ROTULO_STATUS[s] ?? s)}
                series={[{ rotulo: 'Operações', dados: porStatus.map(([, q]) => q) }]}
                corPorItem
                altura={300}
              />
            )}
          </>
        )}
      </div>

      {/* ---------- Detalhamento ---------- */}
      <h2 className={estilos.tituloTabela}>Detalhamento das operações</h2>

      {!carregando && linhas.length === 0 ? (
        <EstadoVazio
          titulo="Sem operações"
          descricao="Nenhuma rota cadastrada para consolidar no relatório."
        />
      ) : (
        <Tabela
          colunas={colunas}
          registros={filtradas}
          carregando={carregando}
          mensagemVazio="Nenhuma operação corresponde aos filtros aplicados."
          porPagina={10}
        />
      )}

      <p className={estilos.notaMetodologia}>
        <strong>Como estes números são apurados.</strong> O faturamento vem dos orçamentos
        aprovados dos clientes com carga em cada rota. O custo reúne os lançamentos de gasto
        vinculados ao veículo ou ao motorista da rota, dentro da janela entre a saída e o retorno
        previsto. É uma atribuição direta, não um rateio contábil: despesas gerais da empresa
        (folha, impostos, seguro da frota) não entram no custo por operação. Um rateio próprio
        exige regra definida e entra junto com o banco de dados.
      </p>
    </>
  );
}

const ROTULO_STATUS: Record<string, string> = {
  planejada: 'Planejada',
  carregando: 'Carregando',
  em_transito: 'Em trânsito',
  concluida: 'Concluída',
};
