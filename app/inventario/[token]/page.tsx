'use client';

/**
 * INVENTÁRIO PREENCHIDO PELO CLIENTE — a única tela sem login.
 *
 * Quem abre esta página é o cliente, no telefone dele, por um link de
 * WhatsApp. Não tem conta, não tem senha e não vai ler instrução: três
 * decisões vêm disso.
 *
 * 1. Fica FORA do grupo de rotas `(plataforma)`. Sem sidebar, sem
 *    cabeçalho, sem gaveta — o cliente não tem para onde navegar. O
 *    `middleware.ts` e o `SessaoProvider` deixam `/inventario/...` passar
 *    pela lista de `lib/rotas-publicas.ts`.
 *
 * 2. Conversa SÓ com `api.inventario.abrir/salvar/finalizar`, que são as
 *    três funções da migration 53. Não existe tabela liberada para visitante
 *    anônimo: se eu errar algo aqui, não há porta atrás.
 *
 * 3. Salva sozinho. O cliente preenche no ônibus, lembra de um móvel à
 *    noite, volta e acrescenta — e não tem o hábito de procurar botão de
 *    salvar. O botão existe de todo modo, porque quem não vê confirmação
 *    desconfia.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';

import { api } from '@/lib/api';
import type { InventarioPublico, ItemInventario } from '@/lib/tipos';
import { formatarBRL, formatarNumero, paraNumero } from '@/lib/utils/formato';
import catalogoItens from '@/mock/catalogo-itens.json';
import estilos from './inventario.module.css';

const CATALOGO = catalogoItens as Record<string, string[]>;

/** Ambiente onde entram os itens que o cliente digita, fora do catálogo. */
const AMBIENTE_MANUAL = 'Outros itens';

const AMBIENTES = [...Object.keys(CATALOGO), AMBIENTE_MANUAL];

/**
 * Uma linha do formulário. O valor fica como TEXTO, do jeito que foi
 * digitado: guardar número aqui obrigaria a reformatar a cada tecla, e o
 * campo brigaria com quem está digitando "1.2" a caminho de "1.200".
 */
type Linha = { quantidade: number; valor: string };

/*
 * A chave é ambiente + item, igual ao `unique (cliente_id, ambiente, item)`
 * da tabela. O separador é um caractere de controle justamente porque não
 * aparece em nome de móvel nenhum.
 */
const SEP = '\u0001';
const chaveDe = (ambiente: string, item: string) => `${ambiente}${SEP}${item}`;

function mensagemDoErro(e: unknown): string {
  return e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.';
}

/** Data com hora, para o prazo e para o último salvamento. */
function dataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function hora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type EstadoSalvamento = 'nada' | 'pendente' | 'salvando' | 'salvo' | 'erro';

export default function PaginaInventarioPublico() {
  const parametros = useParams<{ token: string }>();
  const token = String(parametros?.token ?? '');

  const [carregando, setCarregando] = useState(true);
  const [erroAbertura, setErroAbertura] = useState<string | null>(null);
  const [dados, setDados] = useState<InventarioPublico | null>(null);

  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [ambienteAberto, setAmbienteAberto] = useState(AMBIENTES[0]);
  const [novoItem, setNovoItem] = useState('');

  const [estado, setEstado] = useState<EstadoSalvamento>('nada');
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);

  /* ---------------------------------------------------------------- Abrir */

  useEffect(() => {
    let ativo = true;

    api.inventario
      .abrir(token)
      .then((d) => {
        if (!ativo) return;
        setDados(d);

        const iniciais: Record<string, Linha> = {};
        for (const i of d.itens) {
          /*
           * Item que não está no catálogo daquele ambiente volta para a aba
           * "Outros itens" — é lá que ele é editável. Sem isto, um item
           * digitado antes reapareceria em aba nenhuma e o cliente não
           * conseguiria mais mexer nele.
           */
          const noCatalogo = (CATALOGO[i.ambiente] ?? []).includes(i.item);
          const ambiente = noCatalogo ? i.ambiente : AMBIENTE_MANUAL;
          iniciais[chaveDe(ambiente, i.item)] = {
            quantidade: i.quantidade,
            valor: i.valorUnitario ? formatarNumero(i.valorUnitario, 2) : '',
          };
        }
        setLinhas(iniciais);
      })
      .catch((e) => ativo && setErroAbertura(mensagemDoErro(e)))
      .finally(() => ativo && setCarregando(false));

    return () => {
      ativo = false;
    };
  }, [token]);

  /* ---------------------------------------------------------------- Salvar */

  const lista = useMemo<ItemInventario[]>(() => {
    const saida: ItemInventario[] = [];
    for (const [k, linha] of Object.entries(linhas)) {
      if (linha.quantidade <= 0) continue;
      const corte = k.indexOf(SEP);
      saida.push({
        ambiente: k.slice(0, corte),
        item: k.slice(corte + 1),
        quantidade: linha.quantidade,
        valorUnitario: paraNumero(linha.valor),
      });
    }
    return saida;
  }, [linhas]);

  /*
   * `lista` entra por ref, não por dependência.
   *
   * Se entrasse nas dependências, o debounce reiniciaria a cada tecla E a
   * função trocaria de identidade, remontando o timer — o salvamento
   * automático nunca chegaria a disparar enquanto o cliente digitasse.
   */
  const listaRef = useRef(lista);
  listaRef.current = lista;

  const salvar = useCallback(async () => {
    setEstado('salvando');
    setErroSalvar(null);
    try {
      await api.inventario.salvar(token, listaRef.current);
      setEstado('salvo');
      setSalvoEm(new Date().toISOString());
    } catch (e) {
      setEstado('erro');
      setErroSalvar(mensagemDoErro(e));
    }
  }, [token]);

  // Salvamento automático: dois segundos depois da última mexida.
  useEffect(() => {
    if (estado !== 'pendente') return;
    const t = setTimeout(() => void salvar(), 2000);
    return () => clearTimeout(t);
  }, [estado, linhas, salvar]);

  const mexer = useCallback((mudar: (atual: Record<string, Linha>) => Record<string, Linha>) => {
    setLinhas(mudar);
    setEstado('pendente');
  }, []);

  const mudarQuantidade = useCallback(
    (ambiente: string, item: string, passo: number) => {
      const k = chaveDe(ambiente, item);
      mexer((atual) => {
        const linha = atual[k] ?? { quantidade: 0, valor: '' };
        const quantidade = Math.max(0, linha.quantidade + passo);
        return { ...atual, [k]: { ...linha, quantidade } };
      });
    },
    [mexer],
  );

  const mudarValor = useCallback(
    (ambiente: string, item: string, valor: string) => {
      const k = chaveDe(ambiente, item);
      mexer((atual) => ({
        ...atual,
        [k]: { quantidade: atual[k]?.quantidade ?? 1, valor },
      }));
    },
    [mexer],
  );

  /* ------------------------------------------------------- Itens digitados */

  const itensManuais = useMemo(
    () =>
      Object.keys(linhas)
        .filter((k) => k.startsWith(`${AMBIENTE_MANUAL}${SEP}`))
        .map((k) => k.slice(AMBIENTE_MANUAL.length + 1))
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  );

  const acrescentar = useCallback(() => {
    const nome = novoItem.trim();
    if (!nome) return;
    mexer((atual) => {
      const k = chaveDe(AMBIENTE_MANUAL, nome);
      if (atual[k]) return atual;
      return { ...atual, [k]: { quantidade: 1, valor: '' } };
    });
    setNovoItem('');
  }, [novoItem, mexer]);

  const remover = useCallback(
    (ambiente: string, item: string) => {
      mexer((atual) => {
        const copia = { ...atual };
        delete copia[chaveDe(ambiente, item)];
        return copia;
      });
    },
    [mexer],
  );

  /* ----------------------------------------------------------- Finalizar */

  const finalizar = useCallback(async () => {
    setFinalizando(true);
    setErroSalvar(null);
    try {
      // Grava antes de finalizar: o que está na tela precisa estar no banco
      // na hora em que o cliente disse "terminei".
      await api.inventario.salvar(token, listaRef.current);
      setEstado('salvo');
      setSalvoEm(new Date().toISOString());

      const quando = await api.inventario.finalizar(token);
      setDados((d) => (d ? { ...d, finalizadoEm: quando } : d));
    } catch (e) {
      setEstado('erro');
      setErroSalvar(mensagemDoErro(e));
    } finally {
      setFinalizando(false);
    }
  }, [token]);

  /* ------------------------------------------------------------- Totais */

  const totais = useMemo(() => {
    let itens = 0;
    let valor = 0;
    for (const i of lista) {
      itens += i.quantidade;
      valor += i.quantidade * i.valorUnitario;
    }
    return { itens, valor };
  }, [lista]);

  /* ------------------------------------------------------------- Telas */

  if (carregando) {
    return (
      <main className={estilos.tela}>
        <p className={estilos.aviso}>Abrindo seu inventário…</p>
      </main>
    );
  }

  if (erroAbertura || !dados) {
    return (
      <main className={estilos.tela}>
        <div className={estilos.marca}>
          <Image
            src="/logo-jlt.png"
            alt="Juliano Lopes Transportes"
            width={420}
            height={267}
            priority
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
        <div className={estilos.bloqueio}>
          <h1>Não foi possível abrir</h1>
          <p>{erroAbertura ?? 'Link inválido.'}</p>
        </div>
      </main>
    );
  }

  const itensDaAba =
    ambienteAberto === AMBIENTE_MANUAL ? itensManuais : (CATALOGO[ambienteAberto] ?? []);

  return (
    <main className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <div className={estilos.marca}>
          <Image
            src="/logo-jlt.png"
            alt="Juliano Lopes Transportes"
            width={420}
            height={267}
            priority
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
        <h1>Inventário da mudança</h1>
        <p className={estilos.cliente}>{dados.clienteNome}</p>
        <p className={estilos.prazo}>Link disponível até {dataHora(dados.expiraEm)}</p>
      </header>

      {dados.finalizadoEm && (
        <p className={estilos.finalizado}>
          Você finalizou em {dataHora(dados.finalizadoEm)} às {hora(dados.finalizadoEm)}. Pode
          continuar acrescentando itens se lembrar de algo.
        </p>
      )}

      <nav className={estilos.abas} aria-label="Ambientes">
        {AMBIENTES.map((ambiente) => {
          const quantos = Object.entries(linhas).filter(
            ([k, l]) => k.startsWith(`${ambiente}${SEP}`) && l.quantidade > 0,
          ).length;
          return (
            <button
              key={ambiente}
              type="button"
              className={`${estilos.aba} ${ambienteAberto === ambiente ? estilos.abaAtiva : ''}`}
              onClick={() => setAmbienteAberto(ambiente)}
            >
              {ambiente}
              {quantos > 0 && <span className={estilos.selo}>{quantos}</span>}
            </button>
          );
        })}
      </nav>

      {ambienteAberto === AMBIENTE_MANUAL && (
        <div className={estilos.acrescentar}>
          <input
            value={novoItem}
            onChange={(e) => setNovoItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                acrescentar();
              }
            }}
            placeholder="Nome do item…"
            aria-label="Novo item"
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={acrescentar}
            disabled={!novoItem.trim()}
          >
            Acrescentar
          </button>
        </div>
      )}

      <ul className={estilos.lista}>
        {itensDaAba.map((item) => {
          const linha = linhas[chaveDe(ambienteAberto, item)];
          const quantidade = linha?.quantidade ?? 0;
          const unitario = paraNumero(linha?.valor ?? '');

          return (
            <li
              key={item}
              className={`${estilos.linha} ${quantidade > 0 ? estilos.linhaAtiva : ''}`}
            >
              <div className={estilos.topo}>
                <span className={estilos.nome}>{item}</span>

                <div className={estilos.contador}>
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(ambienteAberto, item, -1)}
                    disabled={quantidade <= 0}
                    aria-label={`Tirar um ${item}`}
                  >
                    −
                  </button>
                  <span>{quantidade}</span>
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(ambienteAberto, item, 1)}
                    aria-label={`Somar um ${item}`}
                  >
                    +
                  </button>
                  {ambienteAberto === AMBIENTE_MANUAL && (
                    <button
                      type="button"
                      className={estilos.excluir}
                      onClick={() => remover(ambienteAberto, item)}
                      aria-label={`Apagar ${item}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {quantidade > 0 && (
                <div className={estilos.baixo}>
                  <label htmlFor={`valor-${ambienteAberto}-${item}`}>Valor da unidade</label>
                  <div className={estilos.moeda}>
                    <span>R$</span>
                    <input
                      id={`valor-${ambienteAberto}-${item}`}
                      inputMode="decimal"
                      value={linha?.valor ?? ''}
                      onChange={(e) => mudarValor(ambienteAberto, item, e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  {quantidade > 1 && unitario > 0 && (
                    <span className={estilos.subtotal}>{formatarBRL(quantidade * unitario)}</span>
                  )}
                </div>
              )}
            </li>
          );
        })}

        {itensDaAba.length === 0 && (
          <li className={estilos.vazio}>Use o campo acima para o que não está nas outras abas.</li>
        )}
      </ul>

      <footer className={estilos.rodape}>
        <div className={estilos.resumo}>
          <strong>
            {totais.itens} {totais.itens === 1 ? 'item' : 'itens'}
          </strong>
          <span>{formatarBRL(totais.valor)}</span>
          <small className={estado === 'erro' ? estilos.erro : undefined}>
            {estado === 'salvando' && 'Salvando…'}
            {estado === 'pendente' && 'Alterações não salvas'}
            {estado === 'salvo' && `Salvo às ${hora(salvoEm)}`}
            {estado === 'erro' && (erroSalvar ?? 'Não salvou')}
          </small>
        </div>

        <div className={estilos.botoes}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void salvar()}
            disabled={estado === 'salvando' || finalizando}
          >
            Salvar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void finalizar()}
            disabled={finalizando || totais.itens === 0}
          >
            {finalizando ? 'Enviando…' : dados.finalizadoEm ? 'Enviar de novo' : 'Finalizei'}
          </button>
        </div>
      </footer>
    </main>
  );
}
