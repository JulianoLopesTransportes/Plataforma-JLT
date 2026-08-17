'use client';

/**
 * FINANCEIRO — migrado de referencia/05-gastos-ganhos_5.html
 *
 * Lógica preservada: lançamentos de gasto e ganho com categoria livre,
 * vínculo opcional a cliente/veículo/motorista, filtro por período e os
 * gráficos de composição.
 *
 * Acesso: apenas admin e financeiro (ver MATRIZ_PERMISSOES). Operacional e
 * comercial nem veem o item na sidebar.
 */

import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
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
import type { Lancamento, Cliente, Veiculo, Motorista, TipoLancamento } from '@/lib/tipos';
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
  const [categorias, setCategorias] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [visaoGrafico, setVisaoGrafico] = useState<'categoria' | 'evolucao'>('categoria');

  const [formAberto, setFormAberto] = useState(false);
  const [formulario, setFormulario] = useState(LANCAMENTO_VAZIO);

  const podeMexer = podeEditar(usuario.nivel, 'financeiro');
  const podeExcluir = podeFazer(usuario.nivel, 'excluir');
  const podeExportar = podeFazer(usuario.nivel, 'exportar');

  useEffect(() => {
    Promise.all([
      api.financeiro.listar(),
      api.clientes.listar(),
      api.veiculos.listar(),
      api.motoristas.listar(),
      api.financeiro.categorias(),
    ]).then(([l, c, v, m, cat]) => {
      setLancamentos(l);
      setClientes(c);
      setVeiculos(v);
      setMotoristas(m);
      setCategorias(cat);
      setCarregando(false);
    });
  }, []);

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

  function excluirLancamento(l: Lancamento) {
    if (!confirm(`Excluir o lançamento "${l.descricao}"?`)) return;
    setLancamentos((lista) => lista.filter((x) => x.id !== l.id));
    mostrar('Lançamento excluído.', 'sucesso');
  }

  function salvar(evento: React.FormEvent) {
    evento.preventDefault();

    const valor = paraNumero(formulario.valor);
    if (!valor || !formulario.data || !formulario.categoria.trim()) {
      mostrar('Preencha valor, data e categoria.', 'erro');
      return;
    }

    const lancamento: Lancamento = {
      id: novoId('lan'),
      tipo: formulario.tipo,
      data: formulario.data,
      valor,
      categoria: formulario.categoria.trim(),
      descricao: formulario.descricao.trim(),
      veiculoId: formulario.veiculoId || null,
      motoristaId: formulario.motoristaId || null,
      clienteId: formulario.clienteId || null,
    };

    setLancamentos((lista) => [lancamento, ...lista]);
    if (!categorias.includes(lancamento.categoria)) {
      setCategorias((c) => [...c, lancamento.categoria].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    }
    setFormAberto(false);
    setFormulario(LANCAMENTO_VAZIO);
    mostrar('Lançamento registrado.', 'sucesso');
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
      render: (l) =>
        podeExcluir ? (
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
        ) : null,
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
              className="btn btn-primary"
              onClick={() => setFormAberto(true)}
              disabled={!podeMexer}
            >
              Novo lançamento
            </button>
          </>
        }
      />

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
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
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
        titulo="Novo lançamento"
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        largo
        rodape={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFormAberto(false)}>
              Cancelar
            </button>
            <button type="submit" form="form-lancamento" className="btn btn-primary">
              Salvar lançamento
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
                onChange={(e) =>
                  setFormulario({ ...formulario, tipo: e.target.value as 'gasto' | 'ganho' })
                }
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
              <input
                id="categoriaLan"
                list="lista-categorias"
                value={formulario.categoria}
                onChange={(e) => setFormulario({ ...formulario, categoria: e.target.value })}
                placeholder="Combustível, Manutenção, Frete…"
                required
              />
              <datalist id="lista-categorias">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="field-hint">Categoria livre — escolha uma existente ou crie outra.</p>
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
    </>
  );
}

