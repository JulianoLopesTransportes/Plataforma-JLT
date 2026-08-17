'use client';

/**
 * DASHBOARD — visão de abertura, recortada pelo nível do usuário.
 *
 * O que cada nível vê sai inteiro das capacidades da matriz:
 *  - faturamento aparece só com podeFazer('ver_faturamento')
 *  - custo aparece só com podeFazer('ver_custos')
 * O Operacional, portanto, abre a mesma tela e enxerga frota e agenda no
 * lugar dos números financeiros.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeFazer, podeVer } from '@/lib/permissoes';
import { formatarBRL, formatarData, hojeISO } from '@/lib/utils/formato';
import {
  TituloPagina,
  GradeMetricas,
  CardMetrica,
  Badge,
  useToast,
  EstadoVazio,
} from '@/components/ui';
import Grafico from '@/components/ui/Grafico';
import type { Cliente, Veiculo, Lancamento, Compromisso, Rota } from '@/lib/tipos';
import estilos from './dashboard.module.css';

type Dados = {
  clientes: Cliente[];
  veiculos: Veiculo[];
  lancamentos: Lancamento[];
  compromissos: Compromisso[];
  rotas: Rota[];
};

export default function PaginaDashboard() {
  const usuario = useUsuario();
  const { mostrar } = useToast();
  const [dados, setDados] = useState<Dados | null>(null);

  const verFaturamento = podeFazer(usuario.nivel, 'ver_faturamento');
  const verCustos = podeFazer(usuario.nivel, 'ver_custos');

  // Aviso deixado pela guarda de rota quando o usuário tentou abrir um
  // módulo fora do seu nível.
  useEffect(() => {
    const aviso = sessionStorage.getItem('jlt.aviso');
    if (aviso) {
      mostrar(aviso, 'aviso');
      sessionStorage.removeItem('jlt.aviso');
    }
  }, [mostrar]);

  useEffect(() => {
    let ativo = true;

    Promise.all([
      api.clientes.listar(),
      api.veiculos.listar(),
      api.financeiro.listar(),
      api.agenda.listar(),
      api.rotas.listar(),
    ]).then(([clientes, veiculos, lancamentos, compromissos, rotas]) => {
      if (!ativo) return;
      setDados({ clientes, veiculos, lancamentos, compromissos, rotas });
    });

    return () => {
      ativo = false;
    };
  }, []);

  if (!dados) {
    return (
      <>
        <TituloPagina titulo="Dashboard" subtitulo="Carregando indicadores…" />
      </>
    );
  }

  const hoje = hojeISO();

  /* --- Números derivados ------------------------------------------------ */
  const clientesAtivos = dados.clientes.filter((c) => c.status !== 'Concluído').length;
  const veiculosDisponiveis = dados.veiculos.filter((v) => v.status === 'Disponível').length;
  const rotasEmAndamento = dados.rotas.filter(
    (r) => r.status === 'em_transito' || r.status === 'carregando',
  ).length;

  const ganhos = dados.lancamentos
    .filter((l) => l.tipo === 'ganho')
    .reduce((soma, l) => soma + l.valor, 0);
  const gastos = dados.lancamentos
    .filter((l) => l.tipo === 'gasto')
    .reduce((soma, l) => soma + l.valor, 0);

  const proximos = dados.compromissos.filter((c) => c.data >= hoje).slice(0, 6);

  /* --- Série mensal para o gráfico -------------------------------------- */
  const meses = [...new Set(dados.lancamentos.map((l) => l.data.slice(0, 7)))].sort();
  const somaPorMes = (tipo: 'ganho' | 'gasto') =>
    meses.map((mes) =>
      dados.lancamentos
        .filter((l) => l.tipo === tipo && l.data.startsWith(mes))
        .reduce((soma, l) => soma + l.valor, 0),
    );

  const rotuloMes = (mes: string) => {
    const [ano, m] = mes.split('-');
    return `${m}/${ano.slice(2)}`;
  };

  const series = [
    ...(verFaturamento ? [{ rotulo: 'Receita', dados: somaPorMes('ganho'), cor: 3 }] : []),
    ...(verCustos ? [{ rotulo: 'Custos', dados: somaPorMes('gasto'), cor: 0 }] : []),
  ];

  return (
    <>
      <TituloPagina
        titulo={`Olá, ${usuario.nome.split(' ')[0]}`}
        subtitulo={`Visão geral da operação — ${formatarData(hoje)}`}
      />

      <GradeMetricas>
        <CardMetrica
          rotulo="Clientes ativos"
          valor={String(clientesAtivos)}
          detalhe={`${dados.clientes.length} cadastrados no total`}
          icone="clientes"
        />

        <CardMetrica
          rotulo="Rotas em andamento"
          valor={String(rotasEmAndamento)}
          detalhe={`${dados.rotas.length} rotas registradas`}
          icone="rotas"
        />

        <CardMetrica
          rotulo="Veículos disponíveis"
          valor={`${veiculosDisponiveis} de ${dados.veiculos.length}`}
          detalhe="Frota pronta para escala"
          icone="veiculo"
        />

        {verFaturamento && (
          <CardMetrica
            rotulo="Receita no período"
            valor={formatarBRL(ganhos)}
            detalhe="Soma dos lançamentos de ganho"
            icone="financeiro"
            tom="positivo"
          />
        )}

        {verCustos && (
          <CardMetrica
            rotulo="Custos no período"
            valor={formatarBRL(gastos)}
            detalhe="Soma dos lançamentos de gasto"
            icone="financeiro"
            tom="negativo"
          />
        )}

        {verFaturamento && verCustos && (
          <CardMetrica
            rotulo="Resultado"
            valor={formatarBRL(ganhos - gastos)}
            detalhe="Receita menos custos"
            icone="relatorios"
            tom={ganhos - gastos >= 0 ? 'positivo' : 'negativo'}
          />
        )}
      </GradeMetricas>

      <div className={estilos.duasColunas}>
        {/* O gráfico monta as séries que o nível pode ver: o Operacional
            enxerga a linha de custos mas não a de receita, e o Comercial o
            inverso. Se nenhuma série sobrar, o bloco inteiro não aparece —
            por isso a checagem é sobre as séries, não sobre o nível. */}
        {series.length > 0 && (
          <div className="card">
            <h2 className="card-title">Evolução mensal</h2>
            <Grafico
              tipo="line"
              rotulos={meses.map(rotuloMes)}
              series={series}
              formatarValor={(v) => formatarBRL(v)}
              altura={260}
            />
          </div>
        )}

        <div className="card">
          <h2 className="card-title">Próximos compromissos</h2>

          {proximos.length === 0 ? (
            <div className="estado-vazio">
              <strong>Agenda livre</strong>
              Nenhum compromisso a partir de hoje.
            </div>
          ) : (
            <ul className={estilos.listaAgenda}>
              {proximos.map((c) => (
                <li key={c.id} className={estilos.itemAgenda}>
                  <div className={estilos.dataAgenda}>
                    <span className={estilos.diaAgenda}>{c.data.slice(8, 10)}</span>
                    <span className={estilos.mesAgenda}>{c.data.slice(5, 7)}</span>
                  </div>
                  <div className={estilos.textoAgenda}>
                    <strong>{c.titulo}</strong>
                    <span className="texto-secundario">
                      {c.diaInteiro ? 'Dia inteiro' : c.horario}
                      {c.observacoes ? ` — ${c.observacoes}` : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {podeVer(usuario.nivel, 'agenda') && (
            <Link href="/agenda" className="btn btn-outline btn-sm" style={{ marginTop: 16 }}>
              Abrir agenda
            </Link>
          )}
        </div>
      </div>

      {podeVer(usuario.nivel, 'rotas') && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="entre" style={{ marginBottom: 16 }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>
              Rotas ativas
            </h2>
            <Link href="/rotas" className="btn btn-outline btn-sm">
              Ver todas
            </Link>
          </div>

          {dados.rotas.filter((r) => r.status !== 'concluida').length === 0 ? (
            <EstadoVazio titulo="Sem rotas ativas" descricao="Nenhuma rota planejada ou em curso." />
          ) : (
            <div className={estilos.gradeRotas}>
              {dados.rotas
                .filter((r) => r.status !== 'concluida')
                .map((rota) => {
                  const volume = rota.mudancas.reduce((s, m) => s + m.volumeM3, 0);
                  return (
                    <Link key={rota.id} href={`/rotas?rota=${rota.id}`} className={estilos.cardRota}>
                      <div className="entre">
                        <strong>{rota.nome}</strong>
                        <Badge
                          texto={ROTULO_STATUS_ROTA[rota.status]}
                          tom={TOM_STATUS_ROTA[rota.status]}
                        />
                      </div>
                      <span className="texto-secundario">
                        Saída {formatarData(rota.dataSaida)} — {rota.mudancas.length} carga(s),{' '}
                        {volume} m³
                      </span>
                    </Link>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const ROTULO_STATUS_ROTA: Record<string, string> = {
  planejada: 'Planejada',
  carregando: 'Carregando',
  em_transito: 'Em trânsito',
  concluida: 'Concluída',
};

const TOM_STATUS_ROTA: Record<string, 'info' | 'warning' | 'success' | 'neutro'> = {
  planejada: 'neutro',
  carregando: 'warning',
  em_transito: 'info',
  concluida: 'success',
};
