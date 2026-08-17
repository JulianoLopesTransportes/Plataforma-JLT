'use client';

/**
 * AGENDA — migrado de referencia/03-agenda_8.html
 *
 * Lógica preservada: calendário mensal, seis tipos de compromisso com
 * campos próprios, vínculo com cliente/veículo/motorista/rota e a lista
 * do dia selecionado.
 *
 * O calendário é montado a partir de strings ISO, sem `new Date(iso)`:
 * o construtor lê 'YYYY-MM-DD' como UTC e, em fuso negativo, devolveria o
 * dia anterior — era o bug clássico do módulo original.
 */

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeEditar, podeVer } from '@/lib/permissoes';
import { formatarData, hojeISO, nomeDoMes, paraISO } from '@/lib/utils/formato';
import {
  TituloPagina,
  Modal,
  BarraFiltros,
  CampoFiltro,
  AcoesFiltro,
  Badge,
  useToast,
  type TomBadge,
} from '@/components/ui';
import Icone from '@/components/layout/Icone';
import type { Compromisso, Cliente, Veiculo, Motorista, TipoCompromisso } from '@/lib/tipos';
import estilos from './agenda.module.css';

const ROTULO_TIPO: Record<TipoCompromisso, string> = {
  cliente: 'Mudança',
  visita: 'Visita técnica',
  rota: 'Rota',
  equipe: 'Equipe',
  pessoal: 'Pessoal',
  outro: 'Outro',
};

const TOM_TIPO: Record<TipoCompromisso, TomBadge> = {
  cliente: 'danger',
  visita: 'info',
  rota: 'warning',
  equipe: 'success',
  pessoal: 'neutro',
  outro: 'neutro',
};

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function PaginaAgenda() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [carregando, setCarregando] = useState(true);

  const hoje = hojeISO();
  const [mesExibido, setMesExibido] = useState(() => hoje.slice(0, 7));
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [detalhe, setDetalhe] = useState<Compromisso | null>(null);

  const podeMexer = podeEditar(usuario.nivel, 'agenda');

  useEffect(() => {
    Promise.all([
      api.agenda.listar(),
      api.clientes.listar(),
      api.veiculos.listar(),
      api.motoristas.listar(),
    ]).then(([a, c, v, m]) => {
      setCompromissos(a);
      setClientes(c);
      setVeiculos(v);
      setMotoristas(m);
      setCarregando(false);
    });
  }, []);

  /* --- Nomes dos vínculos ----------------------------------------------- */
  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome;
  const nomeVeiculo = (id: string | null) => {
    const v = veiculos.find((x) => x.id === id);
    return v ? `${v.placa} — ${v.modelo}` : undefined;
  };
  const nomeMotorista = (id: string | null) => motoristas.find((m) => m.id === id)?.nome;

  /* --- Montagem do calendário ------------------------------------------- */
  const filtrados = useMemo(
    () => compromissos.filter((c) => !filtroTipo || c.tipo === filtroTipo),
    [compromissos, filtroTipo],
  );

  /** Compromissos de um dia ISO, já ordenados por horário. */
  const doDia = (iso: string) =>
    filtrados
      .filter((c) => c.data === iso)
      .sort((a, b) => {
        if (a.diaInteiro !== b.diaInteiro) return a.diaInteiro ? -1 : 1;
        return a.horario.localeCompare(b.horario);
      });

  /**
   * Grade do mês: começa no domingo da semana do dia 1 e vai até o sábado
   * da semana do último dia, para que a grade sempre feche em semanas.
   */
  const grade = useMemo(() => {
    const [ano, mes] = mesExibido.split('-').map(Number);
    const primeiro = new Date(ano, mes - 1, 1);
    const ultimo = new Date(ano, mes, 0);

    const inicio = new Date(primeiro);
    inicio.setDate(inicio.getDate() - inicio.getDay());

    const fim = new Date(ultimo);
    fim.setDate(fim.getDate() + (6 - fim.getDay()));

    const dias: { iso: string; doMes: boolean }[] = [];
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      dias.push({ iso: paraISO(d), doMes: d.getMonth() === mes - 1 });
    }
    return dias;
  }, [mesExibido]);

  function mudarMes(passo: number) {
    const [ano, mes] = mesExibido.split('-').map(Number);
    const novo = new Date(ano, mes - 1 + passo, 1);
    setMesExibido(`${novo.getFullYear()}-${String(novo.getMonth() + 1).padStart(2, '0')}`);
  }

  function irParaHoje() {
    setMesExibido(hoje.slice(0, 7));
    setDiaSelecionado(hoje);
  }

  const [anoExibido, mesNumero] = mesExibido.split('-').map(Number);
  const compromissosDoDia = doDia(diaSelecionado);
  const totalNoMes = filtrados.filter((c) => c.data.startsWith(mesExibido)).length;

  return (
    <>
      <TituloPagina
        titulo="Agenda"
        subtitulo="Mudanças, visitas técnicas, saídas de rota e compromissos internos."
        acoes={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!podeMexer}
            title={podeMexer ? undefined : 'Seu nível não permite criar compromissos'}
            onClick={() =>
              mostrar(
                'O agendamento grava no banco de dados — disponível quando a persistência entrar.',
                'aviso',
              )
            }
          >
            Novo compromisso
          </button>
        }
      />

      <BarraFiltros>
        <CampoFiltro rotulo="Tipo de compromisso">
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </CampoFiltro>

        <AcoesFiltro>
          <button type="button" className="btn btn-outline" onClick={irParaHoje}>
            Hoje
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setFiltroTipo('')}>
            Limpar
          </button>
        </AcoesFiltro>
      </BarraFiltros>

      <div className={estilos.grade}>
        {/* ---------- Calendário ---------- */}
        <div className="card">
          <div className={estilos.cabecalhoMes}>
            <button
              type="button"
              className={estilos.navMes}
              onClick={() => mudarMes(-1)}
              aria-label="Mês anterior"
            >
              <Icone nome="seta" tamanho={18} className={estilos.setaEsquerda} />
            </button>

            <div className={estilos.tituloMes}>
              <strong>
                {nomeDoMes(mesNumero - 1)} {anoExibido}
              </strong>
              <span className="texto-secundario">
                {totalNoMes} compromisso{totalNoMes === 1 ? '' : 's'}
              </span>
            </div>

            <button
              type="button"
              className={estilos.navMes}
              onClick={() => mudarMes(1)}
              aria-label="Próximo mês"
            >
              <Icone nome="seta" tamanho={18} />
            </button>
          </div>

          <div className={estilos.semana}>
            {DIAS_SEMANA.map((d) => (
              <div key={d} className={estilos.rotuloDia}>
                {d}
              </div>
            ))}
          </div>

          <div className={estilos.dias}>
            {grade.map(({ iso, doMes }) => {
              const eventos = doDia(iso);
              const classes = [
                estilos.dia,
                doMes ? '' : estilos.diaForaDoMes,
                iso === hoje ? estilos.diaHoje : '',
                iso === diaSelecionado ? estilos.diaSelecionado : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={iso}
                  type="button"
                  className={classes}
                  onClick={() => setDiaSelecionado(iso)}
                  aria-label={`${formatarData(iso)} — ${eventos.length} compromisso(s)`}
                >
                  <span className={estilos.numeroDia}>{Number(iso.slice(8, 10))}</span>
                  {eventos.length > 0 && (
                    <span className={estilos.pontos}>
                      {eventos.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={`${estilos.ponto} ${estilos[`ponto_${e.tipo}`]}`}
                        />
                      ))}
                      {eventos.length > 3 && (
                        <span className={estilos.maisEventos}>+{eventos.length - 3}</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={estilos.legenda}>
            {Object.entries(ROTULO_TIPO).map(([tipo, rotulo]) => (
              <span key={tipo} className={estilos.itemLegenda}>
                <span className={`${estilos.ponto} ${estilos[`ponto_${tipo}`]}`} />
                {rotulo}
              </span>
            ))}
          </div>
        </div>

        {/* ---------- Lista do dia ---------- */}
        <div className="card">
          <h2 className="card-title">{formatarData(diaSelecionado)}</h2>

          {carregando ? (
            <p className="texto-secundario">Carregando…</p>
          ) : compromissosDoDia.length === 0 ? (
            <div className="estado-vazio">
              <strong>Dia livre</strong>
              Nenhum compromisso agendado para esta data.
            </div>
          ) : (
            <ul className={estilos.listaDia}>
              {compromissosDoDia.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={estilos.cartaoCompromisso}
                    onClick={() => setDetalhe(c)}
                  >
                    <div className={estilos.horario}>
                      {c.diaInteiro ? 'Dia todo' : c.horario || '—'}
                    </div>
                    <div className={estilos.corpoCompromisso}>
                      <strong>{c.titulo}</strong>
                      <Badge texto={ROTULO_TIPO[c.tipo]} tom={TOM_TIPO[c.tipo]} />
                      {c.observacoes && (
                        <span className="texto-secundario">{c.observacoes}</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---------- Detalhe ---------- */}
      <Modal
        titulo={detalhe?.titulo ?? ''}
        aberto={detalhe !== null}
        aoFechar={() => setDetalhe(null)}
        largo
        rodape={
          <button type="button" className="btn btn-outline" onClick={() => setDetalhe(null)}>
            Fechar
          </button>
        }
      >
        {detalhe && (
          <dl className={estilos.listaDados}>
            <Dado rotulo="Tipo">
              <Badge texto={ROTULO_TIPO[detalhe.tipo]} tom={TOM_TIPO[detalhe.tipo]} />
            </Dado>
            <Dado rotulo="Data e hora">
              {formatarData(detalhe.data)}
              {detalhe.diaInteiro ? ' — dia inteiro' : ` às ${detalhe.horario}`}
            </Dado>

            {detalhe.clienteId && (
              <Dado rotulo="Cliente">
                {podeVer(usuario.nivel, 'clientes') ? (
                  <Link href="/clientes" className={estilos.link}>
                    {nomeCliente(detalhe.clienteId) ?? 'Cliente não encontrado'}
                  </Link>
                ) : (
                  (nomeCliente(detalhe.clienteId) ?? '—')
                )}
              </Dado>
            )}

            {detalhe.rotaId && podeVer(usuario.nivel, 'rotas') && (
              <Dado rotulo="Rota vinculada">
                <Link href={`/rotas?rota=${detalhe.rotaId}`} className={estilos.link}>
                  Abrir rota
                </Link>
              </Dado>
            )}

            {detalhe.veiculoId && (
              <Dado rotulo="Veículo">
                {podeVer(usuario.nivel, 'frota') ? (
                  <Link href="/frota" className={estilos.link}>
                    {nomeVeiculo(detalhe.veiculoId) ?? '—'}
                  </Link>
                ) : (
                  (nomeVeiculo(detalhe.veiculoId) ?? '—')
                )}
              </Dado>
            )}

            {detalhe.motoristaId && (
              <Dado rotulo="Motorista">{nomeMotorista(detalhe.motoristaId) ?? '—'}</Dado>
            )}

            {detalhe.enderecoColeta && (
              <Dado rotulo="Endereço de coleta" largo>
                {detalhe.enderecoColeta}
              </Dado>
            )}

            {detalhe.enderecoEntrega && (
              <Dado rotulo="Endereço de entrega" largo>
                {detalhe.enderecoEntrega}
              </Dado>
            )}

            {detalhe.caracteristicas.length > 0 && (
              <Dado rotulo="Serviços contratados" largo>
                <div className="linha-acoes">
                  {detalhe.caracteristicas.map((c) => (
                    <Badge key={c} texto={c} tom="info" />
                  ))}
                </div>
              </Dado>
            )}

            <Dado rotulo="Observações" largo>
              {detalhe.observacoes || '—'}
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
