'use client';

/**
 * FINANCEIRO — migrado de referencia/05-gastos-ganhos_5.html
 *
 * Lógica preservada: lançamentos de gasto e ganho com categoria livre,
 * vínculo opcional a cliente/veículo/motorista, filtro por período e os
 * gráficos de composição.
 *
 * Acesso: apenas admin e financeiro, pela matriz. Operacional e
 * comercial nem veem o item na sidebar.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { api, usandoBanco } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar, podeFazer } from '@/lib/permissoes';
import { formatarBRL, formatarData, hojeISO, novoId, paraNumero } from '@/lib/utils/formato';
import { baixarCSV, numeroParaCSV } from '@/lib/utils/csv';
import {
  TituloPagina,
  Tabela,
  Badge,
  Modal,
  BarraFiltros,
  CampoFiltro,
  AcoesFiltro,
  GradeMetricas,
  CardMetrica,
  useToast,
  type Coluna,
} from '@/components/ui';
import Grafico from '@/components/ui/Grafico';
import type {
  Lancamento,
  Cliente,
  Veiculo,
  Motorista,
  TipoLancamento,
  CategoriaLancamento,
  AplicaA,
} from '@/lib/tipos';
import estilos from './financeiro.module.css';

/** Primeiro dia do mês corrente, em ISO. */
function inicioDoMes(): string {
  return `${hojeISO().slice(0, 7)}-01`;
}

const LANCAMENTO_VAZIO: {
  tipo: TipoLancamento;
  data: string;
  valor: string;
  categoria: string;
  descricao: string;
  veiculoId: string;
  motoristaId: string;
  clienteId: string;
} = {
  tipo: 'gasto',
  data: hojeISO(),
  valor: '',
  categoria: '',
  descricao: '',
  veiculoId: '',
  motoristaId: '',
  clienteId: '',
};

export default function PaginaFinanceiro() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [categorias, setCategorias] = useState<CategoriaLancamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [visaoGrafico, setVisaoGrafico] = useState<'categoria' | 'evolucao'>('categoria');

  const [formAberto, setFormAberto] = useState(false);
  const [formulario, setFormulario] = useState(LANCAMENTO_VAZIO);
  /** null = lançamento novo; id = corrigindo um que já está gravado. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');

  /* Gerenciador de categorias — modal próprio, sobre a mesma tela. */
  const [gerenciarAberto, setGerenciarAberto] = useState(false);

  /**
   * As categorias que podem ser escolhidas para o tipo em edição.
   *
   * Inativa não entra: ela sai de circulação mas continua no histórico.
   * A exceção é a já gravada no lançamento que está aberto — sem ela o
   * seletor viria vazio e salvar trocaria a categoria sem querer.
   */
  const categoriasDoTipo = useMemo(
    () =>
      categorias.filter(
        (c) =>
          (c.ativo || c.nome === formulario.categoria) &&
          (c.aplicaA === 'ambos' || c.aplicaA === formulario.tipo),
      ),
    [categorias, formulario.tipo, formulario.categoria],
  );

  const podeMexer = podeEditar(usuario.nivel, 'financeiro');
  const podeExcluir = podeFazer(usuario.nivel, 'excluir');
  const podeExportar = podeFazer(usuario.nivel, 'exportar');

  const recarregar = useCallback(async () => {
    try {
      const [l, cat] = await Promise.all([api.financeiro.listar(), api.financeiro.categorias()]);
      setLancamentos(l);
      setCategorias(cat);
      setErroCarga('');
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Falha ao carregar lançamentos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([api.clientes.listar(), api.veiculos.listar(), api.motoristas.listar()]).then(
      ([c, v, m]) => {
        setClientes(c);
        setVeiculos(v);
        setMotoristas(m);
      },
    );
    recarregar();
  }, [recarregar]);

  /* --- Nomes dos vínculos ----------------------------------------------- */
  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome ?? null;
  const nomeVeiculo = (id: string | null) => {
    const v = veiculos.find((x) => x.id === id);
    return v ? `${v.placa} (${v.modelo})` : null;
  };
  const nomeMotorista = (id: string | null) => motoristas.find((m) => m.id === id)?.nome ?? null;

  /** Texto do vínculo, ou traço quando o lançamento é geral da empresa. */
  function vinculo(l: Lancamento): string {
    const partes = [nomeCliente(l.clienteId), nomeVeiculo(l.veiculoId), nomeMotorista(l.motoristaId)]
      .filter(Boolean)
      .join(' · ');
    return partes || '—';
  }

  /* --- Filtro ----------------------------------------------------------- */
  const filtrados = useMemo(
    () =>
      lancamentos.filter(
        (l) =>
          (!de || l.data >= de) &&
          (!ate || l.data <= ate) &&
          (!filtroTipo || l.tipo === filtroTipo) &&
          (!filtroCategoria || l.categoria === filtroCategoria),
      ),
    [lancamentos, de, ate, filtroTipo, filtroCategoria],
  );

  const ganhos = filtrados.filter((l) => l.tipo === 'ganho').reduce((s, l) => s + l.valor, 0);
  const gastos = filtrados.filter((l) => l.tipo === 'gasto').reduce((s, l) => s + l.valor, 0);
  const resultado = ganhos - gastos;

  /* --- Séries dos gráficos ---------------------------------------------- */

  /** Composição por categoria, do tipo selecionado (ou gastos por padrão). */
  const porCategoria = useMemo(() => {
    const tipoAlvo = filtroTipo || 'gasto';
    const mapa = new Map<string, number>();
    for (const l of filtrados.filter((x) => x.tipo === tipoAlvo)) {
      mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) + l.valor);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtrados, filtroTipo]);

  const evolucao = useMemo(() => {
    const meses = [...new Set(filtrados.map((l) => l.data.slice(0, 7)))].sort();
    const soma = (tipo: 'ganho' | 'gasto', mes: string) =>
      filtrados
        .filter((l) => l.tipo === tipo && l.data.startsWith(mes))
        .reduce((s, l) => s + l.valor, 0);

    return {
      meses,
      ganhos: meses.map((m) => soma('ganho', m)),
      gastos: meses.map((m) => soma('gasto', m)),
    };
  }, [filtrados]);

  /* --- Ações ------------------------------------------------------------ */

  async function excluirLancamento(l: Lancamento) {
    if (!confirm(`Excluir o lançamento "${l.descricao}"?`)) return;

    try {
      if (usandoBanco()) {
        await api.financeiro.excluir(l.id);
        await recarregar();
      } else {
        setLancamentos((lista) => lista.filter((x) => x.id !== l.id));
      }
      mostrar('Lançamento excluído.', 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao excluir.', 'erro');
    }
  }

  function abrirNovo() {
    setEditandoId(null);
    setFormulario(LANCAMENTO_VAZIO);
    setFormAberto(true);
  }

  /** Abre o mesmo modal com o lançamento gravado dentro. */
  function abrirEdicao(l: Lancamento) {
    setEditandoId(l.id);
    setFormulario({
      tipo: l.tipo,
      data: l.data,
      // O formulário trabalha com texto; o número só volta no salvar.
      valor: String(l.valor).replace('.', ','),
      categoria: l.categoria,
      descricao: l.descricao,
      veiculoId: l.veiculoId ?? '',
      motoristaId: l.motoristaId ?? '',
      clienteId: l.clienteId ?? '',
    });
    setFormAberto(true);
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();

    const valor = paraNumero(formulario.valor);
    if (!valor || !formulario.data || !formulario.categoria.trim()) {
      mostrar('Preencha valor, data e categoria.', 'erro');
      return;
    }

    const dados = {
      tipo: formulario.tipo,
      data: formulario.data,
      valor,
      categoria: formulario.categoria.trim(),
      descricao: formulario.descricao.trim(),
      veiculoId: formulario.veiculoId || null,
      motoristaId: formulario.motoristaId || null,
      clienteId: formulario.clienteId || null,
    };

    setSalvando(true);

    try {
      if (usandoBanco()) {
        if (editandoId) {
          await api.financeiro.atualizar(editandoId, dados);
        } else {
          await api.financeiro.criar(dados);
        }
        await recarregar();
      } else if (editandoId) {
        setLancamentos((lista) =>
          lista.map((x) => (x.id === editandoId ? { ...dados, id: editandoId } : x)),
        );
      } else {
        const lancamento: Lancamento = { ...dados, id: novoId('lan') };
        setLancamentos((lista) => [lancamento, ...lista]);
      }

      setFormAberto(false);
      setFormulario(LANCAMENTO_VAZIO);
      mostrar(editandoId ? 'Lançamento corrigido.' : 'Lançamento registrado.', 'sucesso');
      setEditandoId(null);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  /* --- Categorias ------------------------------------------------------- */

  async function recarregarCategorias() {
    setCategorias(await api.financeiro.categorias());
  }

  async function criarCategoria(nome: string, aplicaA: AplicaA) {
    const limpo = nome.trim();
    if (!limpo) {
      mostrar('Dê um nome à categoria.', 'erro');
      return;
    }
    if (categorias.some((c) => c.nome.toLowerCase() === limpo.toLowerCase())) {
      mostrar(`"${limpo}" já existe.`, 'erro');
      return;
    }

    try {
      // Entra no fim da lista: a ordem das seis originais é a que o
      // Juliano ditou, e empurrar a nova para o meio mexeria nela.
      const ordem = Math.max(0, ...categorias.map((c) => c.ordem)) + 10;
      await api.financeiro.criarCategoria({ nome: limpo, aplicaA, ativo: true, ordem });
      await recarregarCategorias();
      mostrar(`Categoria "${limpo}" criada.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao criar a categoria.', 'erro');
    }
  }

  /**
   * Renomear mexe no HISTÓRICO, e o aviso é explícito por isso.
   *
   * A FK é `on update cascade`: todo lançamento passado passa a mostrar o
   * nome novo. É o que faz "editável" valer, mas não é operação inocente —
   * um relatório tirado ontem não vai bater com um tirado depois.
   */
  async function renomearCategoria(c: CategoriaLancamento) {
    const novo = prompt(`Renomear "${c.nome}" para:`, c.nome)?.trim();
    if (!novo || novo === c.nome) return;

    const emUso = lancamentos.filter((l) => l.categoria === c.nome).length;
    if (
      emUso > 0 &&
      !confirm(
        `${emUso} lançamento(s) estão em "${c.nome}".\n\n` +
          `Renomear passa todos eles para "${novo}" — inclusive os antigos.\n\nContinuar?`,
      )
    ) {
      return;
    }

    try {
      await api.financeiro.atualizarCategoria(c.nome, { nome: novo });
      await Promise.all([recarregarCategorias(), recarregar()]);
      mostrar(`"${c.nome}" agora é "${novo}".`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao renomear.', 'erro');
    }
  }

  async function alternarCategoria(c: CategoriaLancamento) {
    try {
      await api.financeiro.atualizarCategoria(c.nome, { ativo: !c.ativo });
      await recarregarCategorias();
      mostrar(c.ativo ? `"${c.nome}" desativada.` : `"${c.nome}" reativada.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao alterar.', 'erro');
    }
  }

  async function mudarAplicacao(c: CategoriaLancamento, aplicaA: AplicaA) {
    try {
      await api.financeiro.atualizarCategoria(c.nome, { aplicaA });
      await recarregarCategorias();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao alterar.', 'erro');
    }
  }

  async function excluirCategoria(c: CategoriaLancamento) {
    const emUso = lancamentos.filter((l) => l.categoria === c.nome).length;
    if (emUso > 0) {
      // O banco recusaria de qualquer forma (on delete restrict). Dizer
      // isso aqui, com o número, é melhor que deixar vir o erro cru.
      mostrar(
        `"${c.nome}" tem ${emUso} lançamento(s) e não pode ser apagada. Desative-a.`,
        'erro',
      );
      return;
    }
    if (!confirm(`Apagar a categoria "${c.nome}"?`)) return;

    try {
      await api.financeiro.excluirCategoria(c.nome);
      await recarregarCategorias();
      mostrar(`Categoria "${c.nome}" apagada.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao apagar.', 'erro');
    }
  }

  function exportarCSV() {
    const cabecalho = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Vínculo', 'Valor'];
    const linhas = filtrados.map((l) => [
      formatarData(l.data),
      l.tipo === 'ganho' ? 'Ganho' : 'Gasto',
      l.categoria,
      l.descricao,
      vinculo(l),
      numeroParaCSV(l.valor),
    ]);

    baixarCSV('lancamentos-jlt', [cabecalho, ...linhas]);
    mostrar(`${filtrados.length} lançamentos exportados.`, 'sucesso');
  }

  /* --- Colunas ---------------------------------------------------------- */
  const colunas: Coluna<Lancamento>[] = [
    {
      chave: 'data',
      rotulo: 'Data',
      ordenarPor: (l) => l.data,
      render: (l) => formatarData(l.data),
    },
    {
      chave: 'tipo',
      rotulo: 'Tipo',
      ordenarPor: (l) => l.tipo,
      render: (l) => (
        <Badge texto={l.tipo === 'ganho' ? 'Ganho' : 'Gasto'} tom={l.tipo === 'ganho' ? 'success' : 'danger'} />
      ),
    },
    { chave: 'categoria', rotulo: 'Categoria', ordenarPor: (l) => l.categoria },
    {
      chave: 'descricao',
      rotulo: 'Descrição',
      render: (l) => (
        <div className={estilos.celulaDupla}>
          <span>{l.descricao}</span>
          <span className="texto-secundario">{vinculo(l)}</span>
        </div>
      ),
    },
    {
      chave: 'valor',
      rotulo: 'Valor',
      numerico: true,
      ordenarPor: (l) => l.valor,
      render: (l) => (
        <span className={l.tipo === 'ganho' ? estilos.valorGanho : estilos.valorGasto}>
          {l.tipo === 'ganho' ? '+' : '−'} {formatarBRL(l.valor)}
        </span>
      ),
    },
    {
      chave: 'acoes',
      rotulo: '',
      render: (l) => (
        <span className={estilos.acoesLinha}>
          {podeMexer && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                abrirEdicao(l);
              }}
            >
              Editar
            </button>
          )}
          {podeExcluir && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                excluirLancamento(l);
              }}
            >
              Excluir
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <TituloPagina
        titulo="Gastos e Ganhos"
        subtitulo="Lançamentos financeiros, composição de custos e resultado do período."
        acoes={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={exportarCSV}
              disabled={!podeExportar || filtrados.length === 0}
            >
              Exportar CSV
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setGerenciarAberto(true)}
              disabled={!podeMexer}
            >
              Categorias
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={abrirNovo}
              disabled={!podeMexer}
            >
              Novo lançamento
            </button>
          </>
        }
      />

      {erroCarga && <div className={estilos.erroCarga}>{erroCarga}</div>}

      <GradeMetricas>
        <CardMetrica
          rotulo="Receitas"
          valor={formatarBRL(ganhos)}
          detalhe={`${filtrados.filter((l) => l.tipo === 'ganho').length} lançamentos`}
          tom="positivo"
          icone="financeiro"
        />
        <CardMetrica
          rotulo="Custos"
          valor={formatarBRL(gastos)}
          detalhe={`${filtrados.filter((l) => l.tipo === 'gasto').length} lançamentos`}
          tom="negativo"
          icone="financeiro"
        />
        <CardMetrica
          rotulo="Resultado"
          valor={formatarBRL(resultado)}
          detalhe={resultado >= 0 ? 'Período positivo' : 'Período negativo'}
          tom={resultado >= 0 ? 'positivo' : 'negativo'}
          icone="relatorios"
        />
        <CardMetrica
          rotulo="Margem do período"
          valor={ganhos > 0 ? `${((resultado / ganhos) * 100).toFixed(1)}%` : null}
          detalhe={ganhos > 0 ? 'Resultado sobre receita' : 'Sem receita no período filtrado'}
        />
      </GradeMetricas>

      <BarraFiltros>
        <CampoFiltro rotulo="De">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </CampoFiltro>

        <CampoFiltro rotulo="Até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </CampoFiltro>

        <CampoFiltro rotulo="Tipo">
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="ganho">Ganhos</option>
            <option value="gasto">Gastos</option>
          </select>
        </CampoFiltro>

        <CampoFiltro rotulo="Categoria">
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {/* Inativa continua no filtro: o histórico dela existe e você
                precisa conseguir achá-lo. */}
            {categorias.map((c) => (
              <option key={c.nome} value={c.nome}>
                {c.nome}
                {c.ativo ? '' : ' (inativa)'}
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
              setFiltroTipo('');
              setFiltroCategoria('');
            }}
          >
            Limpar
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setDe(inicioDoMes())}>
            Este mês
          </button>
        </AcoesFiltro>
      </BarraFiltros>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="entre" style={{ marginBottom: 16 }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            {visaoGrafico === 'categoria'
              ? `Composição por categoria — ${filtroTipo === 'ganho' ? 'receitas' : 'custos'}`
              : 'Evolução mensal'}
          </h2>
          <div className="linha-acoes">
            <button
              type="button"
              className={`btn btn-sm ${visaoGrafico === 'categoria' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setVisaoGrafico('categoria')}
            >
              Categoria
            </button>
            <button
              type="button"
              className={`btn btn-sm ${visaoGrafico === 'evolucao' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setVisaoGrafico('evolucao')}
            >
              Evolução
            </button>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="estado-vazio">
            <strong>Sem lançamentos</strong>
            Nenhum lançamento no período filtrado.
          </div>
        ) : visaoGrafico === 'categoria' ? (
          <Grafico
            tipo="doughnut"
            rotulos={porCategoria.map(([c]) => c)}
            series={[{ rotulo: 'Valor', dados: porCategoria.map(([, v]) => v) }]}
            corPorItem
            formatarValor={formatarBRL}
            altura={300}
          />
        ) : (
          <Grafico
            tipo="bar"
            rotulos={evolucao.meses.map((m) => `${m.slice(5)}/${m.slice(2, 4)}`)}
            series={[
              { rotulo: 'Receitas', dados: evolucao.ganhos, cor: 3 },
              { rotulo: 'Custos', dados: evolucao.gastos, cor: 0 },
            ]}
            formatarValor={formatarBRL}
            altura={300}
          />
        )}
      </div>

      <Tabela
        colunas={colunas}
        registros={filtrados}
        carregando={carregando}
        mensagemVazio="Nenhum lançamento no período filtrado."
        porPagina={10}
      />

      {/* ---------- Modal de lançamento ---------- */}
      <Modal
        titulo={editandoId ? 'Corrigir lançamento' : 'Novo lançamento'}
        aberto={formAberto}
        aoFechar={() => {
          setFormAberto(false);
          setEditandoId(null);
        }}
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
            <button
              type="submit"
              form="form-lancamento"
              className="btn btn-primary"
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : editandoId ? 'Salvar correção' : 'Salvar lançamento'}
            </button>
          </>
        }
      >
        <form id="form-lancamento" onSubmit={salvar}>
          <div className="form-row-3">
            <div className="field">
              <label htmlFor="tipoLan">Tipo</label>
              <select
                id="tipoLan"
                value={formulario.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as 'gasto' | 'ganho';
                  /*
                   * Trocar o tipo limpa a categoria que não vale no novo.
                   * Sem isto o campo ficaria exibindo "Combustível" num
                   * ganho — e o seletor, que não tem essa opção, mandaria
                   * o valor antigo no submit.
                   */
                  const vale = categorias.some(
                    (c) =>
                      c.nome === formulario.categoria &&
                      (c.aplicaA === 'ambos' || c.aplicaA === tipo),
                  );
                  setFormulario({
                    ...formulario,
                    tipo,
                    categoria: vale ? formulario.categoria : '',
                  });
                }}
              >
                <option value="gasto">Gasto</option>
                <option value="ganho">Ganho</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="dataLan">Data</label>
              <input
                id="dataLan"
                type="date"
                value={formulario.data}
                onChange={(e) => setFormulario({ ...formulario, data: e.target.value })}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="valorLan">Valor (R$)</label>
              <input
                id="valorLan"
                inputMode="decimal"
                value={formulario.valor}
                onChange={(e) => setFormulario({ ...formulario, valor: e.target.value })}
                placeholder="0,00"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="categoriaLan">Categoria</label>
              {/*
                Era campo de texto livre com sugestões, e foi assim que
                "Combustivel" sem acento entrou no banco ao lado de
                "Diesel". Seletor fechado é o conserto: categoria nova se
                cria no gerenciador, de propósito, uma vez.
              */}
              <select
                id="categoriaLan"
                value={formulario.categoria}
                onChange={(e) => setFormulario({ ...formulario, categoria: e.target.value })}
                required
              >
                <option value="">Selecione…</option>
                {categoriasDoTipo.map((c) => (
                  <option key={c.nome} value={c.nome}>
                    {c.nome}
                    {c.ativo ? '' : ' (inativa)'}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                {categoriasDoTipo.length === 0
                  ? `Nenhuma categoria vale para ${formulario.tipo}. Crie uma em "Categorias".`
                  : 'Para criar ou renomear, use o botão "Categorias" no topo da tela.'}
              </p>
            </div>

            <div className="field">
              <label htmlFor="descricaoLan">Descrição</label>
              <input
                id="descricaoLan"
                value={formulario.descricao}
                onChange={(e) => setFormulario({ ...formulario, descricao: e.target.value })}
              />
            </div>
          </div>

          <p className={estilos.rotuloVinculos}>
            Vínculos (opcionais) — permitem apurar custo por veículo, motorista ou cliente
          </p>

          <div className="form-row-3">
            <div className="field">
              <label htmlFor="veiculoLan">Veículo</label>
              <select
                id="veiculoLan"
                value={formulario.veiculoId}
                onChange={(e) => setFormulario({ ...formulario, veiculoId: e.target.value })}
              >
                <option value="">Nenhum</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {v.modelo}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="motoristaLan">Motorista</label>
              <select
                id="motoristaLan"
                value={formulario.motoristaId}
                onChange={(e) => setFormulario({ ...formulario, motoristaId: e.target.value })}
              >
                <option value="">Nenhum</option>
                {motoristas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clienteLan">Cliente</label>
              <select
                id="clienteLan"
                value={formulario.clienteId}
                onChange={(e) => setFormulario({ ...formulario, clienteId: e.target.value })}
              >
                <option value="">Nenhum</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* ---------- Gerenciador de categorias ---------- */}
      <Modal
        titulo="Categorias de lançamento"
        aberto={gerenciarAberto}
        aoFechar={() => setGerenciarAberto(false)}
        largo
        rodape={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setGerenciarAberto(false)}
          >
            Fechar
          </button>
        }
      >
        <form
          className={estilos.novaCategoria}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const nome = (form.elements.namedItem('novoNome') as HTMLInputElement).value;
            const aplicaA = (form.elements.namedItem('novoAplicaA') as HTMLSelectElement)
              .value as AplicaA;
            await criarCategoria(nome, aplicaA);
            form.reset();
          }}
        >
          <div className="field">
            <label htmlFor="novoNome">Nova categoria</label>
            <input id="novoNome" name="novoNome" placeholder="Ex.: Pedágio" />
          </div>
          <div className="field">
            <label htmlFor="novoAplicaA">Vale para</label>
            <select id="novoAplicaA" name="novoAplicaA" defaultValue="gasto">
              <option value="gasto">Gasto</option>
              <option value="ganho">Ganho</option>
              <option value="ambos">Os dois</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            Adicionar
          </button>
        </form>

        <table className={estilos.tabelaCategorias}>
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Vale para</th>
              <th>Lançamentos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categorias.map((c) => {
              const emUso = lancamentos.filter((l) => l.categoria === c.nome).length;
              return (
                <tr key={c.nome} className={c.ativo ? '' : estilos.categoriaInativa}>
                  <td>
                    {c.nome}
                    {c.ativo ? '' : ' (inativa)'}
                  </td>
                  <td>
                    <select
                      value={c.aplicaA}
                      onChange={(e) => mudarAplicacao(c, e.target.value as AplicaA)}
                      aria-label={`Onde "${c.nome}" vale`}
                    >
                      <option value="gasto">Gasto</option>
                      <option value="ganho">Ganho</option>
                      <option value="ambos">Os dois</option>
                    </select>
                  </td>
                  <td>{emUso}</td>
                  <td className={estilos.acoesCategoria}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => renomearCategoria(c)}
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => alternarCategoria(c)}
                    >
                      {c.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                    {/*
                      Apagar só aparece sem histórico. O banco recusaria de
                      qualquer forma — on delete restrict —, e oferecer um
                      botão que sempre dá erro é pior que não oferecer.
                    */}
                    {emUso === 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => excluirCategoria(c)}
                      >
                        Apagar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="field-hint" style={{ marginTop: 12 }}>
          Renomear alcança o histórico: os lançamentos antigos passam a
          mostrar o nome novo. Categoria com lançamento não pode ser apagada —
          desative-a para tirá-la do seletor sem perder o histórico.
        </p>
      </Modal>
    </>
  );
}

