'use client';

/**
 * FORMULÁRIO DE ROTA
 *
 * O mais complexo da plataforma, porque uma rota não é um registro só:
 * é a rota, as cargas que ela transporta e as paradas onde cada carga
 * entra e sai do caminhão.
 *
 * As cargas ganham um id temporário aqui na tela. As paradas referenciam
 * esse id, e o banco troca por id real ao gravar — ver criar_rota_completa
 * na migration 12.
 *
 * A ocupação é calculada em tempo real enquanto o usuário monta a rota,
 * com o mesmo motor que a tela de detalhe usa. É o ponto do formulário
 * que mais evita erro: dá para ver o caminhão estourar antes de salvar.
 */

import { useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { calcularOcupacao, detectarAlertas } from '@/lib/negocio/rotas';
import { hojeISO, novoId, mascararTelefone, mascararDocumento } from '@/lib/utils/formato';
import { Modal, useToast } from '@/components/ui';
import Icone from '@/components/layout/Icone';
import type { Cliente, Veiculo, Motorista, Rota, TipoParada } from '@/lib/tipos';
import estilos from './formulario-rota.module.css';

type CargaForm = {
  tempId: string;
  clienteId: string | null;
  clienteNome: string;
  telefone: string;
  documento: string;
  volumeM3: number;
  enderecoColeta: string;
  enderecoEntrega: string;
  observacao: string;
};

type ParadaForm = {
  tempId: string;
  tipo: TipoParada;
  cidade: string;
  uf: string;
  endereco: string;
  data: string;
  observacao: string;
  embarcam: string[];
  desembarcam: string[];
};

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

export default function FormularioRota({
  aberto,
  aoFechar,
  aoSalvar,
  clientes,
  veiculos,
  motoristas,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: () => Promise<void>;
  clientes: Cliente[];
  veiculos: Veiculo[];
  motoristas: Motorista[];
}) {
  const { mostrar } = useToast();

  const [nome, setNome] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [dataSaida, setDataSaida] = useState(hojeISO());
  const [dataRetorno, setDataRetorno] = useState('');
  const [veiculoId, setVeiculoId] = useState('');
  const [motoristaId, setMotoristaId] = useState('');
  const [cargas, setCargas] = useState<CargaForm[]>([]);
  const [paradas, setParadas] = useState<ParadaForm[]>([]);
  const [salvando, setSalvando] = useState(false);

  const veiculo = veiculos.find((v) => v.id === veiculoId) ?? null;

  /* ======================================================================
     Prévia da ocupação — mesmo motor da tela de detalhe
     ====================================================================== */
  const previa = useMemo(() => {
    const rotaSimulada: Rota = {
      id: 'previa',
      nome,
      status: 'planejada',
      veiculoId: veiculoId || null,
      motoristaId: motoristaId || null,
      origem,
      destino,
      dataSaida,
      dataPrevistaRetorno: dataRetorno,
      mudancas: cargas.map((c) => ({
        id: c.tempId,
        clienteNome: c.clienteNome,
        telefone: c.telefone,
        documento: c.documento,
        volumeM3: c.volumeM3,
        enderecoColeta: c.enderecoColeta,
        enderecoEntrega: c.enderecoEntrega,
        observacao: c.observacao,
      })),
      paradas: paradas.map((p) => ({
        id: p.tempId,
        tipo: p.tipo,
        cidade: p.cidade,
        uf: p.uf,
        endereco: p.endereco,
        data: p.data,
        embarcam: p.embarcam,
        desembarcam: p.desembarcam,
        observacao: p.observacao,
      })),
    };

    return {
      ocupacoes: calcularOcupacao(rotaSimulada, veiculo?.capacidadeM3 ?? null),
      alertas: detectarAlertas(rotaSimulada, veiculo),
    };
  }, [nome, origem, destino, dataSaida, dataRetorno, veiculoId, motoristaId, cargas, paradas, veiculo]);

  /* ======================================================================
     Cargas
     ====================================================================== */

  function adicionarCarga() {
    setCargas((lista) => [
      ...lista,
      {
        tempId: novoId('carga'),
        clienteId: null,
        clienteNome: '',
        telefone: '',
        documento: '',
        volumeM3: 0,
        enderecoColeta: '',
        enderecoEntrega: '',
        observacao: '',
      },
    ]);
  }

  function mudarCarga(tempId: string, campos: Partial<CargaForm>) {
    setCargas((lista) => lista.map((c) => (c.tempId === tempId ? { ...c, ...campos } : c)));
  }

  /** Escolher um cliente cadastrado preenche o resto sozinho. */
  function vincularCliente(tempId: string, clienteId: string) {
    const c = clientes.find((x) => x.id === clienteId);
    if (!c) {
      mudarCarga(tempId, { clienteId: null });
      return;
    }
    mudarCarga(tempId, {
      clienteId: c.id,
      clienteNome: c.nome,
      telefone: c.telefone,
      documento: c.documento,
      volumeM3: c.volumeM3 ?? 0,
      enderecoColeta: c.enderecoColeta,
      enderecoEntrega: c.enderecoEntrega,
    });
  }

  function removerCarga(tempId: string) {
    setCargas((lista) => lista.filter((c) => c.tempId !== tempId));
    // A carga some também das paradas que a movimentavam.
    setParadas((lista) =>
      lista.map((p) => ({
        ...p,
        embarcam: p.embarcam.filter((id) => id !== tempId),
        desembarcam: p.desembarcam.filter((id) => id !== tempId),
      })),
    );
  }

  /* ======================================================================
     Paradas
     ====================================================================== */

  function adicionarParada() {
    setParadas((lista) => [
      ...lista,
      {
        tempId: novoId('parada'),
        tipo: 'coleta',
        cidade: '',
        uf: 'MG',
        endereco: '',
        data: dataSaida,
        observacao: '',
        embarcam: [],
        desembarcam: [],
      },
    ]);
  }

  function mudarParada(tempId: string, campos: Partial<ParadaForm>) {
    setParadas((lista) => lista.map((p) => (p.tempId === tempId ? { ...p, ...campos } : p)));
  }

  function removerParada(tempId: string) {
    setParadas((lista) => lista.filter((p) => p.tempId !== tempId));
  }

  /** Alterna o movimento de uma carga numa parada. */
  function alternarMovimento(paradaId: string, cargaId: string, tipo: 'embarcam' | 'desembarcam') {
    setParadas((lista) =>
      lista.map((p) => {
        if (p.tempId !== paradaId) return p;

        const jaTem = p[tipo].includes(cargaId);
        const oposto = tipo === 'embarcam' ? 'desembarcam' : 'embarcam';

        return {
          ...p,
          [tipo]: jaTem ? p[tipo].filter((id) => id !== cargaId) : [...p[tipo], cargaId],
          // Uma carga não embarca e desembarca na mesma parada.
          [oposto]: p[oposto].filter((id) => id !== cargaId),
        };
      }),
    );
  }

  /* ======================================================================
     Salvar
     ====================================================================== */

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();

    if (!nome.trim()) return mostrar('Dê um nome à rota.', 'erro');
    if (!dataSaida) return mostrar('Informe a data de saída.', 'erro');
    if (cargas.length === 0) return mostrar('Acrescente ao menos uma carga.', 'erro');
    if (cargas.some((c) => !c.clienteNome.trim())) {
      return mostrar('Toda carga precisa de um cliente.', 'erro');
    }
    if (paradas.length === 0) return mostrar('Acrescente ao menos uma parada.', 'erro');
    if (paradas.some((p) => !p.cidade.trim() || !p.data)) {
      return mostrar('Toda parada precisa de cidade e data.', 'erro');
    }

    // Erro grave de montagem barra o salvamento; aviso apenas alerta.
    const graves = previa.alertas.filter((a) => a.nivel === 'danger');
    if (graves.length > 0) {
      const seguir = confirm(
        `Esta rota tem ${graves.length} problema(s):\n\n${graves.map((a) => `• ${a.texto}`).join('\n')}\n\nSalvar mesmo assim?`,
      );
      if (!seguir) return;
    }

    setSalvando(true);
    try {
      await api.rotas.criar({
        nome: nome.trim(),
        origem: origem.trim(),
        destino: destino.trim(),
        dataSaida,
        dataPrevistaRetorno: dataRetorno,
        veiculoId: veiculoId || null,
        motoristaId: motoristaId || null,
        mudancas: cargas,
        paradas: paradas.map((p) => ({
          tipo: p.tipo,
          cidade: p.cidade,
          uf: p.uf,
          endereco: p.endereco,
          data: p.data,
          observacao: p.observacao,
          embarcam: p.embarcam,
          desembarcam: p.desembarcam,
        })),
      });

      await aoSalvar();
      limpar();
      mostrar(`Rota "${nome}" criada.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao criar a rota.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function limpar() {
    setNome('');
    setOrigem('');
    setDestino('');
    setDataSaida(hojeISO());
    setDataRetorno('');
    setVeiculoId('');
    setMotoristaId('');
    setCargas([]);
    setParadas([]);
  }

  const volumeTotal = cargas.reduce((s, c) => s + c.volumeM3, 0);
  const pico = previa.ocupacoes.reduce((m, o) => Math.max(m, o.ocupacaoApos), 0);

  return (
    <Modal
      titulo="Nova rota"
      aberto={aberto}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" form="form-rota" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Criando…' : 'Criar rota'}
          </button>
        </>
      }
    >
      <form id="form-rota" onSubmit={salvar}>
        {/* ---------------- Dados da rota ---------------- */}
        <div className="form-row">
          <div className="field">
            <label htmlFor="nomeR">Nome da rota</label>
            <input
              id="nomeR"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="BH → Uberlândia (Triângulo)"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="veicR">Veículo</label>
            <select id="veicR" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
              <option value="">A definir</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} — {v.modelo} ({v.capacidadeM3} m³)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="origR">Origem</label>
            <input
              id="origR"
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              placeholder="Belo Horizonte - MG"
            />
          </div>

          <div className="field">
            <label htmlFor="destR">Destino</label>
            <input
              id="destR"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="Uberlândia - MG"
            />
          </div>
        </div>

        <div className="form-row-3">
          <div className="field">
            <label htmlFor="saidaR">Saída</label>
            <input
              id="saidaR"
              type="date"
              value={dataSaida}
              onChange={(e) => setDataSaida(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="retR">Retorno previsto</label>
            <input
              id="retR"
              type="date"
              value={dataRetorno}
              onChange={(e) => setDataRetorno(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="motR">Motorista</label>
            <select id="motR" value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
              <option value="">A definir</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ---------------- Cargas ---------------- */}
        <div className={estilos.secao}>
          <div className="entre">
            <h3 className={estilos.tituloSecao}>
              Cargas
              {cargas.length > 0 && (
                <span className={estilos.contador}>
                  {cargas.length} · {volumeTotal} m³
                </span>
              )}
            </h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={adicionarCarga}>
              Acrescentar carga
            </button>
          </div>

          {cargas.length === 0 ? (
            <p className={estilos.vazio}>
              Nenhuma carga. Uma rota transporta ao menos uma.
            </p>
          ) : (
            cargas.map((c, i) => (
              <div key={c.tempId} className={estilos.cartaoItem}>
                <div className={estilos.cabecalhoItem}>
                  <strong>Carga {i + 1}</strong>
                  <button
                    type="button"
                    className={estilos.remover}
                    onClick={() => removerCarga(c.tempId)}
                    aria-label={`Remover carga ${i + 1}`}
                  >
                    <Icone nome="fechar" tamanho={15} />
                  </button>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label>Cliente cadastrado</label>
                    <select
                      value={c.clienteId ?? ''}
                      onChange={(e) => vincularCliente(c.tempId, e.target.value)}
                    >
                      <option value="">Avulso — digitar abaixo</option>
                      {clientes.map((cl) => (
                        <option key={cl.id} value={cl.id}>
                          {cl.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Nome do cliente</label>
                    <input
                      value={c.clienteNome}
                      onChange={(e) => mudarCarga(c.tempId, { clienteNome: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-row-3">
                  <div className="field">
                    <label>Telefone</label>
                    <input
                      value={c.telefone}
                      onChange={(e) =>
                        mudarCarga(c.tempId, { telefone: mascararTelefone(e.target.value) })
                      }
                    />
                  </div>

                  <div className="field">
                    <label>Documento</label>
                    <input
                      value={c.documento}
                      onChange={(e) =>
                        mudarCarga(c.tempId, { documento: mascararDocumento(e.target.value) })
                      }
                    />
                  </div>

                  <div className="field">
                    <label>Volume (m³)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={c.volumeM3 || ''}
                      onChange={(e) =>
                        mudarCarga(c.tempId, { volumeM3: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label>Endereço de coleta</label>
                    <input
                      value={c.enderecoColeta}
                      onChange={(e) => mudarCarga(c.tempId, { enderecoColeta: e.target.value })}
                    />
                  </div>

                  <div className="field">
                    <label>Endereço de entrega</label>
                    <input
                      value={c.enderecoEntrega}
                      onChange={(e) => mudarCarga(c.tempId, { enderecoEntrega: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ---------------- Paradas ---------------- */}
        <div className={estilos.secao}>
          <div className="entre">
            <h3 className={estilos.tituloSecao}>
              Paradas
              {paradas.length > 0 && <span className={estilos.contador}>{paradas.length}</span>}
            </h3>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={adicionarParada}
              disabled={cargas.length === 0}
              title={cargas.length === 0 ? 'Acrescente uma carga primeiro' : undefined}
            >
              Acrescentar parada
            </button>
          </div>

          {paradas.length === 0 ? (
            <p className={estilos.vazio}>
              Nenhuma parada. É nelas que cada carga entra e sai do caminhão.
            </p>
          ) : (
            paradas.map((p, i) => (
              <div key={p.tempId} className={estilos.cartaoItem}>
                <div className={estilos.cabecalhoItem}>
                  <strong>Parada {i + 1}</strong>
                  <button
                    type="button"
                    className={estilos.remover}
                    onClick={() => removerParada(p.tempId)}
                    aria-label={`Remover parada ${i + 1}`}
                  >
                    <Icone nome="fechar" tamanho={15} />
                  </button>
                </div>

                <div className="form-row-3">
                  <div className="field">
                    <label>Cidade</label>
                    <input
                      value={p.cidade}
                      onChange={(e) => mudarParada(p.tempId, { cidade: e.target.value })}
                      required
                    />
                  </div>

                  <div className="field">
                    <label>UF</label>
                    <select
                      value={p.uf}
                      onChange={(e) => mudarParada(p.tempId, { uf: e.target.value })}
                    >
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Data</label>
                    <input
                      type="date"
                      value={p.data}
                      onChange={(e) => mudarParada(p.tempId, { data: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: 16 }}>
                  <label>Endereço</label>
                  <input
                    value={p.endereco}
                    onChange={(e) => mudarParada(p.tempId, { endereco: e.target.value })}
                  />
                </div>

                {/* Movimentos: o coração do formulário. */}
                <div className={estilos.movimentos}>
                  <span className={estilos.rotuloMovimentos}>O que acontece nesta parada</span>

                  {cargas.map((c, indice) => (
                    <div key={c.tempId} className={estilos.linhaMovimento}>
                      <span className={estilos.nomeCarga}>
                        {c.clienteNome || `Carga ${indice + 1}`}
                        <small>{c.volumeM3} m³</small>
                      </span>

                      <div className={estilos.botoesMovimento}>
                        <button
                          type="button"
                          className={`${estilos.botaoMov} ${
                            p.embarcam.includes(c.tempId) ? estilos.movEmbarque : ''
                          }`}
                          onClick={() => alternarMovimento(p.tempId, c.tempId, 'embarcam')}
                        >
                          Embarca
                        </button>
                        <button
                          type="button"
                          className={`${estilos.botaoMov} ${
                            p.desembarcam.includes(c.tempId) ? estilos.movDesembarque : ''
                          }`}
                          onClick={() => alternarMovimento(p.tempId, c.tempId, 'desembarcam')}
                        >
                          Desembarca
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ---------------- Prévia ---------------- */}
        {paradas.length > 0 && (
          <div className={estilos.secao}>
            <h3 className={estilos.tituloSecao}>
              Prévia da ocupação
              {veiculo && (
                <span className={estilos.contador}>
                  pico {pico} m³ de {veiculo.capacidadeM3} m³
                </span>
              )}
            </h3>

            <ol className={estilos.previa}>
              {previa.ocupacoes.map(({ parada, ocupacaoApos, percentual }) => (
                <li key={parada.id} className={estilos.linhaPrevia}>
                  <span>
                    {parada.cidade || 'Sem cidade'} — {parada.data}
                  </span>
                  <strong
                    className={
                      percentual !== null && percentual > 100
                        ? estilos.estourado
                        : percentual !== null && percentual >= 90
                          ? estilos.apertado
                          : undefined
                    }
                  >
                    {ocupacaoApos} m³
                    {percentual !== null && ` (${percentual.toFixed(0)}%)`}
                  </strong>
                </li>
              ))}
            </ol>

            {previa.alertas.length > 0 && (
              <ul className={estilos.alertas}>
                {previa.alertas.map((a, i) => (
                  <li key={i} className={estilos[`alerta_${a.nivel}`]}>
                    {a.texto}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
