'use client';

/**
 * FORMULÁRIO DE ROTA — montada cidade a cidade
 *
 * O formulário anterior pedia as coisas na ordem errada: primeiro você
 * cadastrava TODAS as cargas, depois criava as paradas e voltava para
 * marcar quem embarcava e desembarcava em cada uma. Era preciso conhecer
 * a lista inteira antes de saber onde cada carga entrava.
 *
 * Aqui a rota é uma sequência de cidades, montada na ordem em que o
 * caminhão as visita. Em cada cidade você diz o que acontece: coletar a
 * mudança de um cliente, ou entregar uma que já está a bordo. A carga
 * NASCE da coleta — não existe mais uma lista de cargas separada.
 *
 * A consequência que mais importa: "Entregar" só oferece cargas coletadas
 * em cidades ANTERIORES e ainda não entregues. Fica impossível, pela
 * própria interface, entregar o que ainda não foi coletado.
 *
 * As cargas ganham um id temporário aqui na tela. Os movimentos
 * referenciam esse id, e o banco troca por id real ao gravar — ver
 * criar_rota_completa, migration 18.
 *
 * A ocupação é calculada em tempo real enquanto se monta, com o mesmo
 * motor da tela de detalhe. É o que evita descobrir só depois de salvar
 * que o caminhão estoura no meio do caminho.
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

/** Uma coleta ou entrega dentro de uma cidade. */
type MovimentoForm = {
  cargaTempId: string;
  /** Endereço deste movimento — puxado do cadastro, editável. */
  endereco: string;
};

type CidadeForm = {
  tempId: string;
  cidade: string;
  uf: string;
  data: string;
  observacao: string;
  coletam: MovimentoForm[];
  entregam: MovimentoForm[];
};

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

/** O tipo da parada não é escolhido: sai do que acontece nela. */
function tipoDaCidade(c: CidadeForm): TipoParada {
  if (c.coletam.length > 0 && c.entregam.length > 0) return 'mista';
  if (c.entregam.length > 0) return 'entrega';
  return 'coleta';
}

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
  const [dataSaida, setDataSaida] = useState(hojeISO());
  const [dataRetorno, setDataRetorno] = useState('');
  const [veiculoId, setVeiculoId] = useState('');
  const [motoristaId, setMotoristaId] = useState('');
  const [cargas, setCargas] = useState<CargaForm[]>([]);
  const [cidades, setCidades] = useState<CidadeForm[]>([]);
  const [salvando, setSalvando] = useState(false);

  const veiculo = veiculos.find((v) => v.id === veiculoId) ?? null;

  /*
   * Origem e destino deixam de ser digitados: são a primeira e a última
   * cidade da sequência. Dois campos livres ao lado de uma lista ordenada
   * de cidades seriam duas versões da mesma verdade, livres para discordar.
   */
  const origem = cidades[0] ? `${cidades[0].cidade} - ${cidades[0].uf}` : '';
  const destino =
    cidades.length > 1
      ? `${cidades[cidades.length - 1].cidade} - ${cidades[cidades.length - 1].uf}`
      : '';

  const cargaPor = (tempId: string) => cargas.find((c) => c.tempId === tempId);

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
      paradas: cidades.map((c, i) => ({
        id: c.tempId,
        tipo: tipoDaCidade(c),
        cidade: c.cidade,
        uf: c.uf,
        // O endereço da parada some do formulário: agora ele vive em cada
        // movimento. Fica vazio, e a linha do tempo cai nos movimentos.
        endereco: '',
        data: c.data,
        ordem: i,
        coletam: c.coletam.map((m) => ({ mudancaId: m.cargaTempId, endereco: m.endereco })),
        entregam: c.entregam.map((m) => ({ mudancaId: m.cargaTempId, endereco: m.endereco })),
        observacao: c.observacao,
      })),
    };

    return {
      ocupacoes: calcularOcupacao(rotaSimulada, veiculo?.capacidadeM3 ?? null),
      alertas: detectarAlertas(rotaSimulada, veiculo),
    };
  }, [nome, origem, destino, dataSaida, dataRetorno, veiculoId, motoristaId, cargas, cidades, veiculo]);

  /* ======================================================================
     Cidades
     ====================================================================== */

  function adicionarCidade() {
    setCidades((lista) => [
      ...lista,
      {
        tempId: novoId('cidade'),
        cidade: '',
        uf: lista.length > 0 ? lista[lista.length - 1].uf : 'MG',
        // Herda a data da cidade anterior: o caminhão chega nela depois,
        // nunca antes. Corrigir para a frente é mais rápido do que digitar.
        data: lista.length > 0 ? lista[lista.length - 1].data : dataSaida,
        observacao: '',
        coletam: [],
        entregam: [],
      },
    ]);
  }

  function mudarCidade(tempId: string, campos: Partial<CidadeForm>) {
    setCidades((lista) => lista.map((c) => (c.tempId === tempId ? { ...c, ...campos } : c)));
  }

  /**
   * Remove a cidade e tudo que dependia dela.
   *
   * Uma carga nasce da sua coleta: se a cidade que a coletava sai, a carga
   * perde a razão de existir e sai junto, arrastando a entrega dela em
   * outra cidade. Deixá-la para trás produziria carga fantasma, que o
   * motor de alertas acusaria como "não é coletada em nenhuma cidade".
   */
  function removerCidade(tempId: string) {
    const cidade = cidades.find((c) => c.tempId === tempId);
    if (!cidade) return;

    const orfas = new Set(cidade.coletam.map((m) => m.cargaTempId));

    setCidades((lista) =>
      lista
        .filter((c) => c.tempId !== tempId)
        .map((c) => ({
          ...c,
          coletam: c.coletam.filter((m) => !orfas.has(m.cargaTempId)),
          entregam: c.entregam.filter((m) => !orfas.has(m.cargaTempId)),
        })),
    );
    setCargas((lista) => lista.filter((c) => !orfas.has(c.tempId)));
  }

  /**
   * Sobe ou desce a cidade na sequência.
   *
   * Reordenar pode deixar uma entrega antes da sua coleta. Não bloqueamos:
   * o motor de alertas acusa, e travar o movimento impediria a reordenação
   * em dois passos que às vezes é o caminho natural.
   */
  function moverCidade(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= cidades.length) return;

    setCidades((lista) => {
      const copia = [...lista];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  /* ======================================================================
     Movimentos — o que acontece em cada cidade
     ====================================================================== */

  /**
   * Coletar aqui a mudança de um cliente.
   *
   * A carga nasce neste momento, já preenchida pelo cadastro. Um id que
   * não corresponde a cliente algum — o "avulso" do seletor — cria a carga
   * em branco, para quem ainda não tem cadastro.
   */
  function coletar(cidadeTempId: string, clienteId: string) {
    const cliente = clientes.find((c) => c.id === clienteId);
    const tempId = novoId('carga');

    const carga: CargaForm = cliente
      ? {
          tempId,
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          telefone: cliente.telefone,
          documento: cliente.documento,
          volumeM3: cliente.volumeM3 ?? 0,
          enderecoColeta: cliente.enderecoColeta,
          enderecoEntrega: cliente.enderecoEntrega,
          observacao: '',
        }
      : {
          tempId,
          clienteId: null,
          clienteNome: '',
          telefone: '',
          documento: '',
          volumeM3: 0,
          enderecoColeta: '',
          enderecoEntrega: '',
          observacao: '',
        };

    setCargas((lista) => [...lista, carga]);
    setCidades((lista) =>
      lista.map((c) =>
        c.tempId === cidadeTempId
          ? { ...c, coletam: [...c.coletam, { cargaTempId: tempId, endereco: carga.enderecoColeta }] }
          : c,
      ),
    );
  }

  /** Entregar aqui uma carga que já está a bordo. */
  function entregar(cidadeTempId: string, cargaTempId: string) {
    const carga = cargaPor(cargaTempId);
    if (!carga) return;

    setCidades((lista) =>
      lista.map((c) =>
        c.tempId === cidadeTempId
          ? {
              ...c,
              entregam: [...c.entregam, { cargaTempId, endereco: carga.enderecoEntrega }],
            }
          : c,
      ),
    );
  }

  /**
   * Tira um movimento da cidade.
   *
   * Tirar a COLETA apaga a carga inteira, pelo mesmo motivo de
   * removerCidade: sem coleta ela não existe. Tirar a ENTREGA só desfaz a
   * entrega — a carga continua a bordo, esperando outra cidade.
   */
  function removerMovimento(cidadeTempId: string, cargaTempId: string, tipo: 'coleta' | 'entrega') {
    if (tipo === 'entrega') {
      setCidades((lista) =>
        lista.map((c) =>
          c.tempId === cidadeTempId
            ? { ...c, entregam: c.entregam.filter((m) => m.cargaTempId !== cargaTempId) }
            : c,
        ),
      );
      return;
    }

    setCidades((lista) =>
      lista.map((c) => ({
        ...c,
        coletam: c.coletam.filter((m) => m.cargaTempId !== cargaTempId),
        entregam: c.entregam.filter((m) => m.cargaTempId !== cargaTempId),
      })),
    );
    setCargas((lista) => lista.filter((c) => c.tempId !== cargaTempId));
  }

  function mudarEnderecoMovimento(
    cidadeTempId: string,
    cargaTempId: string,
    tipo: 'coleta' | 'entrega',
    endereco: string,
  ) {
    const campo = tipo === 'coleta' ? 'coletam' : 'entregam';
    setCidades((lista) =>
      lista.map((c) =>
        c.tempId === cidadeTempId
          ? {
              ...c,
              [campo]: c[campo].map((m) =>
                m.cargaTempId === cargaTempId ? { ...m, endereco } : m,
              ),
            }
          : c,
      ),
    );
  }

  function mudarCarga(tempId: string, campos: Partial<CargaForm>) {
    setCargas((lista) => lista.map((c) => (c.tempId === tempId ? { ...c, ...campos } : c)));
  }

  /**
   * Cargas que podem ser entregues nesta cidade: coletadas numa cidade
   * ANTERIOR e ainda sem entrega em lugar nenhum. É esta lista que torna
   * impossível entregar o que não foi coletado.
   */
  function entregaveisEm(indice: number): CargaForm[] {
    const coletadasAntes = new Set(
      cidades.slice(0, indice).flatMap((c) => c.coletam.map((m) => m.cargaTempId)),
    );
    const jaEntregues = new Set(cidades.flatMap((c) => c.entregam.map((m) => m.cargaTempId)));

    return cargas.filter(
      (c) => coletadasAntes.has(c.tempId) && !jaEntregues.has(c.tempId),
    );
  }

  /* ======================================================================
     Salvar
     ====================================================================== */

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();

    if (!nome.trim()) return mostrar('Dê um nome à rota.', 'erro');
    if (!dataSaida) return mostrar('Informe a data de saída.', 'erro');
    if (cidades.length === 0) return mostrar('Acrescente ao menos uma cidade.', 'erro');
    if (cidades.some((c) => !c.cidade.trim() || !c.data)) {
      return mostrar('Toda cidade precisa de nome e data.', 'erro');
    }
    if (cargas.length === 0) {
      return mostrar('Nenhuma mudança na rota — colete ao menos uma em alguma cidade.', 'erro');
    }
    if (cargas.some((c) => !c.clienteNome.trim())) {
      return mostrar('Toda mudança precisa do nome do cliente.', 'erro');
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
        origem,
        destino,
        dataSaida,
        dataPrevistaRetorno: dataRetorno,
        veiculoId: veiculoId || null,
        motoristaId: motoristaId || null,
        mudancas: cargas,
        paradas: cidades.map((c) => ({
          tipo: tipoDaCidade(c),
          cidade: c.cidade,
          uf: c.uf,
          endereco: '',
          data: c.data,
          observacao: c.observacao,
          coletam: c.coletam.map((m) => ({ tempId: m.cargaTempId, endereco: m.endereco })),
          entregam: c.entregam.map((m) => ({ tempId: m.cargaTempId, endereco: m.endereco })),
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
    setDataSaida(hojeISO());
    setDataRetorno('');
    setVeiculoId('');
    setMotoristaId('');
    setCargas([]);
    setCidades([]);
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

        {/* Origem e destino são leitura: saem da primeira e da última cidade. */}
        {cidades.length > 0 && (
          <p className={estilos.trajeto}>
            <strong>{origem || 'Primeira cidade'}</strong>
            {destino && (
              <>
                {' → '}
                <strong>{destino}</strong>
              </>
            )}
            <small>
              {cidades.length === 1
                ? 'uma cidade'
                : `${cidades.length} cidades`}
              {cargas.length > 0 &&
                ` · ${cargas.length} ${cargas.length === 1 ? 'mudança' : 'mudanças'} · ${volumeTotal} m³`}
            </small>
          </p>
        )}

        {/* ---------------- Cidades ---------------- */}
        <div className={estilos.secao}>
          <div className="entre">
            <h3 className={estilos.tituloSecao}>Cidades</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={adicionarCidade}>
              Acrescentar cidade
            </button>
          </div>

          {cidades.length === 0 ? (
            <p className={estilos.vazio}>
              Nenhuma cidade. Comece pela primeira parada do caminhão — é lá que
              você coleta a primeira mudança.
            </p>
          ) : (
            cidades.map((cidade, indice) => {
              const entregaveis = entregaveisEm(indice);

              return (
                <div key={cidade.tempId} className={estilos.cartaoItem}>
                  <div className={estilos.cabecalhoItem}>
                    <strong>
                      {indice + 1}ª parada
                      {indice === 0 && cidades.length > 1 && ' · origem'}
                      {indice === cidades.length - 1 && cidades.length > 1 && ' · destino'}
                    </strong>

                    <div className={estilos.acoesCidade}>
                      <button
                        type="button"
                        className={estilos.mover}
                        onClick={() => moverCidade(indice, -1)}
                        disabled={indice === 0}
                        aria-label={`Subir a ${indice + 1}ª parada`}
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={estilos.mover}
                        onClick={() => moverCidade(indice, 1)}
                        disabled={indice === cidades.length - 1}
                        aria-label={`Descer a ${indice + 1}ª parada`}
                        title="Descer"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={estilos.remover}
                        onClick={() => removerCidade(cidade.tempId)}
                        aria-label={`Remover a ${indice + 1}ª parada`}
                      >
                        <Icone nome="fechar" tamanho={15} />
                      </button>
                    </div>
                  </div>

                  <div className="form-row-3">
                    <div className="field">
                      <label>Cidade</label>
                      <input
                        value={cidade.cidade}
                        onChange={(e) => mudarCidade(cidade.tempId, { cidade: e.target.value })}
                        placeholder="Belo Horizonte"
                        required
                      />
                    </div>

                    <div className="field">
                      <label>UF</label>
                      <select
                        value={cidade.uf}
                        onChange={(e) => mudarCidade(cidade.tempId, { uf: e.target.value })}
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
                        value={cidade.data}
                        onChange={(e) => mudarCidade(cidade.tempId, { data: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* O coração do formulário. */}
                  <div className={estilos.movimentos}>
                    <span className={estilos.rotuloMovimentos}>O que acontece aqui</span>

                    {cidade.coletam.length === 0 && cidade.entregam.length === 0 && (
                      <p className={estilos.vazio}>
                        Nada ainda — colete uma mudança ou entregue uma que já está
                        a bordo.
                      </p>
                    )}

                    {cidade.coletam.map((mov) => {
                      const carga = cargaPor(mov.cargaTempId);
                      if (!carga) return null;

                      return (
                        <div key={mov.cargaTempId} className={estilos.movimento}>
                          <div className={estilos.tituloMovimento}>
                            <span className={estilos.selo_coleta}>Coleta</span>
                            <input
                              className={estilos.nomeEditavel}
                              value={carga.clienteNome}
                              onChange={(e) =>
                                mudarCarga(carga.tempId, { clienteNome: e.target.value })
                              }
                              placeholder="Nome do cliente"
                              required
                            />
                            <button
                              type="button"
                              className={estilos.remover}
                              onClick={() =>
                                removerMovimento(cidade.tempId, mov.cargaTempId, 'coleta')
                              }
                              aria-label={`Remover a coleta de ${carga.clienteNome || 'cliente'}`}
                              title="Remover — apaga a mudança da rota"
                            >
                              <Icone nome="fechar" tamanho={14} />
                            </button>
                          </div>

                          <div className="form-row-3">
                            <div className="field">
                              <label>Telefone</label>
                              <input
                                value={carga.telefone}
                                onChange={(e) =>
                                  mudarCarga(carga.tempId, {
                                    telefone: mascararTelefone(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div className="field">
                              <label>Documento</label>
                              <input
                                value={carga.documento}
                                onChange={(e) =>
                                  mudarCarga(carga.tempId, {
                                    documento: mascararDocumento(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div className="field">
                              <label>Volume (m³)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={carga.volumeM3 || ''}
                                onChange={(e) =>
                                  mudarCarga(carga.tempId, { volumeM3: Number(e.target.value) })
                                }
                              />
                            </div>
                          </div>

                          <div className="field">
                            <label>Endereço da coleta</label>
                            <input
                              value={mov.endereco}
                              onChange={(e) =>
                                mudarEnderecoMovimento(
                                  cidade.tempId,
                                  mov.cargaTempId,
                                  'coleta',
                                  e.target.value,
                                )
                              }
                              placeholder="Puxado do cadastro do cliente"
                            />
                          </div>
                        </div>
                      );
                    })}

                    {cidade.entregam.map((mov) => {
                      const carga = cargaPor(mov.cargaTempId);
                      if (!carga) return null;

                      return (
                        <div key={mov.cargaTempId} className={estilos.movimento}>
                          <div className={estilos.tituloMovimento}>
                            <span className={estilos.selo_entrega}>Entrega</span>
                            <span className={estilos.nomeCargaFixo}>
                              {carga.clienteNome || 'Cliente sem nome'}
                              <small>{carga.volumeM3} m³</small>
                            </span>
                            <button
                              type="button"
                              className={estilos.remover}
                              onClick={() =>
                                removerMovimento(cidade.tempId, mov.cargaTempId, 'entrega')
                              }
                              aria-label={`Remover a entrega de ${carga.clienteNome || 'cliente'}`}
                              title="Remover — a mudança continua a bordo"
                            >
                              <Icone nome="fechar" tamanho={14} />
                            </button>
                          </div>

                          <div className="field">
                            <label>Endereço da entrega</label>
                            <input
                              value={mov.endereco}
                              onChange={(e) =>
                                mudarEnderecoMovimento(
                                  cidade.tempId,
                                  mov.cargaTempId,
                                  'entrega',
                                  e.target.value,
                                )
                              }
                              placeholder="Puxado do cadastro do cliente"
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* Os dois seletores que fazem a rota crescer. */}
                    <div className={estilos.adicionarMovimento}>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) coletar(cidade.tempId, e.target.value);
                          e.target.value = '';
                        }}
                      >
                        <option value="">+ Coletar mudança…</option>
                        {clientes.map((cl) => (
                          <option key={cl.id} value={cl.id}>
                            {cl.nome}
                          </option>
                        ))}
                        <option value="avulso">— Cliente avulso —</option>
                      </select>

                      <select
                        value=""
                        disabled={entregaveis.length === 0}
                        title={
                          entregaveis.length === 0
                            ? 'Nada a bordo — colete algo numa cidade anterior'
                            : undefined
                        }
                        onChange={(e) => {
                          if (e.target.value) entregar(cidade.tempId, e.target.value);
                          e.target.value = '';
                        }}
                      >
                        <option value="">
                          {entregaveis.length === 0
                            ? 'Nada a bordo para entregar'
                            : '+ Entregar mudança…'}
                        </option>
                        {entregaveis.map((c) => (
                          <option key={c.tempId} value={c.tempId}>
                            {c.clienteNome || 'Cliente sem nome'} — {c.volumeM3} m³
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ---------------- Prévia ---------------- */}
        {cidades.length > 0 && (
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
