'use client';

/**
 * RELATÓRIOS — módulo novo, não existia nos arquivos originais.
 *
 * Filtros por período, origem do cliente, motorista, veículo e status;
 * quatro visualizações e exportação em CSV.
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
import { ORIGENS_CLIENTE, STATUS_CLIENTE } from '@/lib/tipos';
import type {
  Lancamento,
  Cliente,
  Veiculo,
  Motorista,
  Rota,
  Orcamento,
  MembroEquipe,
  EventoStatus,
  StatusCliente,
} from '@/lib/tipos';
import estilos from './relatorios.module.css';

/** Linha consolidada do relatório — uma operação de transporte. */
type LinhaRelatorio = {
  id: string;
  rotaNome: string;
  clienteNome: string;
  /** De onde veio o cliente: MudaMuda, Instagram, WhatsApp… */
  origem: string;
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
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [eventos, setEventos] = useState<EventoStatus[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');
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
      /* A equipe traduz responsavel_id em nome. Falhar aqui não pode
         derrubar o relatório inteiro, então cai para lista vazia e o
         quadro de carteira mostra "Fora da equipe" em vez de sumir. */
      api.equipe.listar().catch(() => [] as MembroEquipe[]),
      /* A trilha de etapas. Idem: falhar aqui tira o tempo de ciclo, não
         o relatório. */
      api.relatorios.eventosDeStatus().catch(() => [] as EventoStatus[]),
    ]).then(([r, c, v, m, l, o, e, ev]) => {
      setRotas(r);
      setClientes(c);
      setVeiculos(v);
      setMotoristas(m);
      setLancamentos(l);
      setOrcamentos(o);
      setEquipe(e);
      setEventos(ev);
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
        origem: clienteVinculado?.origem ?? '',
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
          (!filtroOrigem || l.origem === filtroOrigem) &&
          (!filtroMotorista || l.motoristaId === filtroMotorista) &&
          (!filtroVeiculo || l.veiculoId === filtroVeiculo) &&
          (!filtroStatus || l.status === filtroStatus),
      ),
    [linhas, de, ate, filtroOrigem, filtroMotorista, filtroVeiculo, filtroStatus],
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

  /** Distribuição por canal de origem — de onde vêm as operações. */
  const porOrigem = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of filtradas) {
      const chave = l.origem || 'Sem origem';
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtradas]);

  /* ======================================================================
     Funil comercial
     ======================================================================

     Mede CLIENTE, não rota — e por isso vive fora de `filtradas` e fora do
     bloco de gráficos, que só desenha quando há rota no filtro. Era isso
     que deixava o Relatórios em branco com 61 clientes e 33 orçamentos no
     banco e uma única rota cadastrada.

     Recorte pela data de CADASTRO do cliente, igual ao quadro de carteira:
     é quando ele entrou no funil. */
  const comercial = useMemo(() => {
    const noPeriodo = clientes.filter((c) => {
      const dia = (c.criadoEm || '').slice(0, 10);
      return (!de || dia >= de) && (!ate || dia <= ate);
    });

    const quantos = (s: StatusCliente) => noPeriodo.filter((c) => c.status === s).length;

    const ganhos = noPeriodo.filter((c) => c.status === 'Fechada' || c.status === 'Finalizada');
    const perdidos = noPeriodo.filter((c) => c.status === 'Perdida');
    const semResposta = noPeriodo.filter((c) => c.status === 'Sem resposta');
    const abertos = noPeriodo.filter((c) => c.status === 'Novo' || c.status === 'Em andamento');

    /*
     * O DENOMINADOR da taxa de fechamento, dito por extenso.
     *
     * Fechados sobre tudo que ENCERROU — ganhos mais perdidos mais sem
     * resposta. Cliente ainda em Novo ou Em andamento não entra: ele não
     * decidiu nada, e contá-lo como derrota faria a taxa cair só por haver
     * trabalho em andamento. É a armadilha clássica desse número, e é por
     * isso que a tela escreve a conta ao lado dela.
     */
    const encerrados = ganhos.length + perdidos.length + semResposta.length;
    const taxaFechamento = encerrados > 0 ? (ganhos.length / encerrados) * 100 : null;

    /*
     * O valor de um cliente: o orçamento vigente MAIS RECENTE.
     *
     * Não é a soma, e não é o primeiro da lista. Vários clientes têm dois
     * ou três orçamentos vigentes, alguns com valor idêntico, porque antes
     * de existir revisão cada correção de preço criava um orçamento NOVO.
     * Somá-los contaria a mesma mudança várias vezes; pegar o primeiro da
     * lista dependeria da ordem que a consulta devolveu.
     *
     * Então: o mais recente por data, e empate fica com a versão maior.
     * Determinístico e defensável — é o preço que vale hoje.
     */
    const valorDe = (clienteId: string) => {
      const doCliente = orcamentos.filter((o) => o.clienteId === clienteId);
      if (doCliente.length === 0) return 0;
      return doCliente.reduce((a, b) =>
        b.data > a.data || (b.data === a.data && b.versao > a.versao) ? b : a,
      ).valorFinal;
    };

    /* Quantos clientes têm orçamento duplicado — o número acima é uma
       escolha entre eles, e a tela avisa quando isso está acontecendo. */
    const comDuplicados = noPeriodo.filter(
      (c) => orcamentos.filter((o) => o.clienteId === c.id).length > 1,
    ).length;

    const faturamento = ganhos.reduce((s, c) => s + valorDe(c.id), 0);
    const comValor = ganhos.filter((c) => valorDe(c.id) > 0).length;
    const ticket = comValor > 0 ? faturamento / comValor : null;
    // Quanto saiu pela porta: dinheiro que foi orçado e não fechou.
    const perdido = perdidos.reduce((s, c) => s + valorDe(c.id), 0);

    /*
     * TEMPO DE CICLO — mediana, não média.
     *
     * A distribuição é torta para a direita: a maioria fecha em dias e um
     * punhado arrasta por meses, e a média sobe atrás desses poucos. Quem
     * olha o número quer saber "quanto costuma levar", que é a mediana.
     *
     * Só cadeias com evento REAL entram. Os 61 clientes que já existiam
     * têm apenas o evento retroativo da carga inicial — deles sabe-se o
     * status de hoje e a data de cadastro, e nada de quando mudaram. Medir
     * com isso seria inventar.
     */
    const reais = eventos.filter((e) => !e.retroativo);
    const entrada = new Map<string, string>();
    const fechamento = new Map<string, string>();
    for (const e of reais) {
      if (e.de === null && !entrada.has(e.clienteId)) entrada.set(e.clienteId, e.em);
      if (e.para === 'Fechada' && !fechamento.has(e.clienteId)) {
        fechamento.set(e.clienteId, e.em);
      }
    }

    const dias: number[] = [];
    for (const [clienteId, abriu] of entrada) {
      const fechou = fechamento.get(clienteId);
      if (!fechou) continue;
      const d = (new Date(fechou).getTime() - new Date(abriu).getTime()) / 86400000;
      if (Number.isFinite(d) && d >= 0) dias.push(d);
    }
    dias.sort((a, b) => a - b);
    const meio = Math.floor(dias.length / 2);
    const cicloMediano =
      dias.length === 0
        ? null
        : dias.length % 2 === 1
          ? dias[meio]
          : (dias[meio - 1] + dias[meio]) / 2;

    /* Por canal de origem: volume e quanto cada canal fecha. */
    const porOrigem = [...new Set(noPeriodo.map((c) => c.origem))]
      .map((origem) => {
        const doCanal = noPeriodo.filter((c) => c.origem === origem);
        const g = doCanal.filter((c) => c.status === 'Fechada' || c.status === 'Finalizada');
        const enc = doCanal.filter((c) =>
          ['Fechada', 'Finalizada', 'Perdida', 'Sem resposta'].includes(c.status),
        );
        return {
          origem,
          total: doCanal.length,
          ganhos: g.length,
          encerrados: enc.length,
          taxa: enc.length > 0 ? (g.length / enc.length) * 100 : null,
          valor: g.reduce((s, c) => s + valorDe(c.id), 0),
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      total: noPeriodo.length,
      etapas: STATUS_CLIENTE.map((s) => ({ status: s, quantos: quantos(s) })),
      abertos: abertos.length,
      ganhos: ganhos.length,
      perdidos: perdidos.length,
      semResposta: semResposta.length,
      encerrados,
      taxaFechamento,
      faturamento,
      comValor,
      ticket,
      perdido,
      cicloMediano,
      cicloMedidos: dias.length,
      porOrigem,
      comDuplicados,
    };
  }, [clientes, orcamentos, eventos, de, ate]);

  /* ======================================================================
     Carteira por responsável
     ======================================================================

     Conta CLIENTES, não operações, e por isso fica fora de `filtradas` e
     do bloco de gráficos: aquele bloco só desenha quando há rota no
     filtro, e um quadro de carteira que some porque ninguém rodou rota
     no mês não serviria para nada.

     Respeita o De/Até pela data de CADASTRO do cliente — é quando ele
     entrou para a carteira de alguém. */
  const porResponsavel = useMemo(() => {
    const dentroDoFiltro = clientes.filter((c) => {
      const dia = (c.criadoEm || '').slice(0, 10);
      return (!de || dia >= de) && (!ate || dia <= ate);
    });

    const SEM_DONO = 'Sem responsável';
    const mapa = new Map<string, { total: number; fechados: number }>();

    for (const c of dentroDoFiltro) {
      const chave = c.responsavelId
        ? (equipe.find((m) => m.id === c.responsavelId)?.nome ?? 'Fora da equipe')
        : SEM_DONO;
      const atual = mapa.get(chave) ?? { total: 0, fechados: 0 };
      atual.total += 1;
      // "Fechou" = chegou em Fechada ou passou dela. Novo e Em andamento
      // ainda são promessa, e contá-los como resultado inflaria todo mundo.
      if (c.status === 'Fechada' || c.status === 'Finalizada') atual.fechados += 1;
      mapa.set(chave, atual);
    }

    const total = dentroDoFiltro.length;
    const totalFechados = dentroDoFiltro.filter(
      (c) => c.status === 'Fechada' || c.status === 'Finalizada',
    ).length;

    const linhas = [...mapa.entries()]
      .map(([nome, d]) => ({
        nome,
        total: d.total,
        fechados: d.fechados,
        /* Percentuais sobre bases DIFERENTES, de propósito: "% da
           carteira" é fatia do bolo todo, "% dos fechamentos" é fatia de
           quem fechou. Dividir os dois pelo mesmo total faria a segunda
           coluna responder a uma pergunta que ninguém fez. */
        pctCarteira: total > 0 ? (d.total / total) * 100 : 0,
        pctFechados: totalFechados > 0 ? (d.fechados / totalFechados) * 100 : 0,
      }))
      // Sem responsável por último: é pendência, não pessoa.
      .sort((a, b) =>
        a.nome === SEM_DONO ? 1 : b.nome === SEM_DONO ? -1 : b.total - a.total,
      );

    return { linhas, total, totalFechados };
  }, [clientes, equipe, de, ate]);

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
      'Origem',
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
      l.origem,
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
    {
      chave: 'origem',
      rotulo: 'Origem',
      ordenarPor: (l) => l.origem,
      render: (l) => l.origem || <span className="texto-secundario">—</span>,
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

      <BarraFiltros>
        <CampoFiltro rotulo="De">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </CampoFiltro>

        <CampoFiltro rotulo="Até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </CampoFiltro>

        <CampoFiltro rotulo="Origem do cliente">
          <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)}>
            <option value="">Todas</option>
            {ORIGENS_CLIENTE.map((o) => (
              <option key={o} value={o}>
                {o}
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
              setFiltroOrigem('');
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

      {/* ---------- Funil comercial ----------
           Primeiro bloco da página de propósito: é a pergunta que a
           empresa faz todo dia — quanto entrou, quanto fechou, quanto
           saiu pela porta. O de rotas vem depois. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="card-title">Funil comercial</h2>

        {comercial.total === 0 ? (
          <div className="estado-vazio">
            <strong>Nenhum cliente no período</strong>
            {de || ate
              ? 'Ajuste as datas — o filtro conta pela data de cadastro do cliente.'
              : 'Cadastre clientes para o funil começar a medir.'}
          </div>
        ) : (
          <>
            <GradeMetricas>
              <CardMetrica
                rotulo="Clientes no período"
                valor={String(comercial.total)}
                detalhe={`${comercial.abertos} ainda em aberto`}
                icone="clientes"
              />
              <CardMetrica
                rotulo="Taxa de fechamento"
                valor={
                  comercial.taxaFechamento === null
                    ? null
                    : `${comercial.taxaFechamento.toFixed(1).replace('.', ',')}%`
                }
                /* O denominador escrito na tela. É onde todo relatório de
                   funil mente, e escondê-lo faria o número não valer nada. */
                detalhe={
                  comercial.taxaFechamento === null
                    ? 'Nada encerrou ainda no período'
                    : `${comercial.ganhos} de ${comercial.encerrados} que encerraram ` +
                      '(fechadas + finalizadas + perdidas + sem resposta)'
                }
                tom={
                  comercial.taxaFechamento === null
                    ? undefined
                    : comercial.taxaFechamento >= 50
                      ? 'positivo'
                      : undefined
                }
                icone="relatorios"
              />
              <CardMetrica
                rotulo="Tempo de fechamento"
                valor={
                  comercial.cicloMediano === null
                    ? null
                    : `${comercial.cicloMediano.toFixed(1).replace('.', ',')} dias`
                }
                /* Mediana e não média, e a tela diz isso: a distribuição é
                   torta e a média sobe atrás de uns poucos casos longos. */
                detalhe={
                  comercial.cicloMediano === null
                    ? 'Precisa de clientes que entrem e fechem a partir de agora'
                    : `Mediana de ${comercial.cicloMedidos} ${
                        comercial.cicloMedidos === 1 ? 'cliente' : 'clientes'
                      } medidos`
                }
                icone="agenda"
              />
              {verFaturamento && (
                <CardMetrica
                  rotulo="Fechado no período"
                  valor={comercial.faturamento > 0 ? formatarBRL(comercial.faturamento) : null}
                  detalhe={
                    comercial.faturamento > 0
                      ? `${comercial.comValor} de ${comercial.ganhos} fechadas têm orçamento` +
                        (comercial.ticket ? ` · ticket ${formatarBRL(comercial.ticket)}` : '')
                      : 'Nenhuma cliente fechada tem orçamento vinculado'
                  }
                  tom="positivo"
                  icone="financeiro"
                />
              )}
              {verFaturamento && comercial.perdido > 0 && (
                <CardMetrica
                  rotulo="Perdido no período"
                  valor={formatarBRL(comercial.perdido)}
                  detalhe={`${comercial.perdidos} cliente(s) em Perdida, pelo valor orçado`}
                  tom="negativo"
                  icone="financeiro"
                />
              )}
            </GradeMetricas>

            <h3 className={estilos.tituloTabela} style={{ marginTop: 20 }}>
              Onde estão hoje
            </h3>
            <div className={estilos.carteira}>
              <Grafico
                tipo="doughnut"
                rotulos={comercial.etapas.filter((e) => e.quantos > 0).map((e) => e.status)}
                series={[
                  {
                    rotulo: 'Clientes',
                    dados: comercial.etapas.filter((e) => e.quantos > 0).map((e) => e.quantos),
                  },
                ]}
                corPorItem
                altura={260}
              />

              <table className={estilos.tabelaCarteira}>
                <thead>
                  <tr>
                    <th>Canal de origem</th>
                    <th>Clientes</th>
                    <th>Fechadas</th>
                    <th>Taxa</th>
                    {verFaturamento && <th>Valor</th>}
                  </tr>
                </thead>
                <tbody>
                  {comercial.porOrigem.map((o) => (
                    <tr key={o.origem}>
                      <td>{o.origem}</td>
                      <td>{o.total}</td>
                      <td>{o.ganhos}</td>
                      <td>
                        {o.taxa === null ? '—' : `${o.taxa.toFixed(0)}%`}
                        {o.encerrados > 0 && o.encerrados < o.total && (
                          <span className="texto-secundario"> de {o.encerrados}</span>
                        )}
                      </td>
                      {verFaturamento && <td>{o.valor > 0 ? formatarBRL(o.valor) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {comercial.cicloMediano === null && (
              <p className="field-hint" style={{ marginTop: 12 }}>
                O tempo de fechamento começa a contar agora. Os clientes cadastrados antes de
                11/11/2026 têm só a etapa de hoje e a data de cadastro gravadas — quando cada um
                mudou de etapa não existe em lugar nenhum, e eu não vou estimar isso.
              </p>
            )}

            {comercial.comDuplicados > 0 && (
              <p className="field-hint" style={{ marginTop: 8 }}>
                {comercial.comDuplicados} cliente(s) têm mais de um orçamento vigente, de quando
                não havia como revisar e cada correção criava um novo. O valor acima usa o mais
                recente de cada um. Para limpar, abra a ficha e apague os repetidos — agora o
                botão Editar revisa em vez de criar outro.
              </p>
            )}
          </>
        )}
      </div>

      {/* ---------- Carteira por responsável ----------
           Fora do bloco de gráficos de propósito: aquele só desenha
           quando há ROTA no filtro, e este quadro é sobre clientes. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="card-title">Clientes por responsável</h2>

        {porResponsavel.total === 0 ? (
          <div className="estado-vazio">
            <strong>Nenhum cliente no período</strong>
            {de || ate
              ? 'Ajuste as datas — o filtro conta pela data de cadastro do cliente.'
              : 'Cadastre clientes para ver a divisão da carteira.'}
          </div>
        ) : (
          <div className={estilos.carteira}>
            <Grafico
              tipo="doughnut"
              rotulos={porResponsavel.linhas.map((l) => l.nome)}
              series={[
                { rotulo: 'Clientes', dados: porResponsavel.linhas.map((l) => l.total) },
              ]}
              corPorItem
              altura={260}
            />

            <table className={estilos.tabelaCarteira}>
              <thead>
                <tr>
                  <th>Responsável</th>
                  <th>Clientes</th>
                  <th>% da carteira</th>
                  <th>Fechados</th>
                  <th>% dos fechamentos</th>
                </tr>
              </thead>
              <tbody>
                {porResponsavel.linhas.map((l) => (
                  <tr key={l.nome}>
                    <td>{l.nome}</td>
                    <td>{l.total}</td>
                    <td>{l.pctCarteira.toFixed(1).replace('.', ',')}%</td>
                    <td>{l.fechados}</td>
                    <td>
                      {porResponsavel.totalFechados > 0
                        ? `${l.pctFechados.toFixed(1).replace('.', ',')}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{porResponsavel.total}</td>
                  <td>100,0%</td>
                  <td>{porResponsavel.totalFechados}</td>
                  <td>{porResponsavel.totalFechados > 0 ? '100,0%' : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Operação (rotas) ----------
           Este bloco mede ROTA, e por isso continua vazio quando não há
           rota no filtro — o que é correto AQUI. O problema era ele ser a
           página inteira: com uma única rota cadastrada, 61 clientes e 33
           orçamentos ficavam invisíveis atrás deste "sem dados". Agora ele
           é a última seção, e o funil acima não depende dele. */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="card-title">Operação</h2>
        <Abas
          abas={[
            { chave: 'evolucao', rotulo: 'Evolução temporal' },
            { chave: 'veiculo', rotulo: 'Comparativo por veículo' },
            { chave: 'status', rotulo: 'Distribuição por status' },
            { chave: 'origem', rotulo: 'Origem dos clientes' },
          ]}
          ativa={visao}
          aoTrocar={setVisao}
        />

        {filtradas.length === 0 ? (
          <div className="estado-vazio">
            <strong>Sem rota no filtro</strong>
            Estes gráficos medem rotas. O funil comercial acima não depende delas.
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

            {visao === 'origem' && (
              <Grafico
                tipo="doughnut"
                rotulos={porOrigem.map(([o]) => o)}
                series={[{ rotulo: 'Operações', dados: porOrigem.map(([, q]) => q) }]}
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

    </>
  );
}

const ROTULO_STATUS: Record<string, string> = {
  planejada: 'Planejada',
  carregando: 'Carregando',
  em_transito: 'Em trânsito',
  concluida: 'Concluída',
};
