'use client';

/**
 * PAINEL DE PARÂMETROS DE PRECIFICAÇÃO — editável.
 *
 * Faixas de volume, adicionais, custo por km e limites de margem. Tudo o
 * que alimenta a calculadora de orçamento.
 *
 * PERMISSÃO: só admin e financeiro chegam aqui — a capacidade é
 * `editar_parametros_precificacao`. E não é só a interface que decide: as
 * policies de `faixas_volume`, `adicionais` e `parametros_precificacao`
 * exigem a mesma capacidade, então uma chamada direta à API é recusada
 * pelo banco do mesmo jeito.
 */

import { useEffect, useState, useCallback } from 'react';
import { precificacao, type FaixaVolumeDb, type AdicionalDb, type ParametrosGerais } from '@/lib/api/admin';
import { formatarBRL, paraNumero } from '@/lib/utils/formato';
import { Modal, useToast } from '@/components/ui';
import estilos from './painel-precificacao.module.css';

export default function PainelPrecificacao() {
  const { mostrar } = useToast();

  const [faixas, setFaixas] = useState<FaixaVolumeDb[]>([]);
  const [adicionais, setAdicionais] = useState<AdicionalDb[]>([]);
  const [gerais, setGerais] = useState<ParametrosGerais | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Formulário dos parâmetros gerais, como texto para aceitar vírgula decimal.
  const [custoKm, setCustoKm] = useState('');
  const [margemMin, setMargemMin] = useState('');
  const [margemMax, setMargemMax] = useState('');

  const [faixaEditando, setFaixaEditando] = useState<Partial<FaixaVolumeDb> | null>(null);
  const [adicionalEditando, setAdicionalEditando] = useState<Partial<AdicionalDb> | null>(null);

  const carregar = useCallback(async () => {
    const dados = await precificacao.ler();
    setFaixas(dados.faixas);
    setAdicionais(dados.adicionais);
    setGerais(dados.gerais);

    if (dados.gerais) {
      setCustoKm(String(dados.gerais.custoPorKm).replace('.', ','));
      setMargemMin(String(dados.gerais.margemMinima).replace('.', ','));
      setMargemMax(String(dados.gerais.margemMaxima).replace('.', ','));
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function executar(acao: () => Promise<void>, sucesso: string) {
    setSalvando(true);
    try {
      await acao();
      await carregar();
      mostrar(sucesso, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function salvarGerais(evento: React.FormEvent) {
    evento.preventDefault();
    executar(
      () =>
        precificacao.salvarGerais({
          custoPorKm: paraNumero(custoKm),
          margemMinima: paraNumero(margemMin),
          margemMaxima: paraNumero(margemMax),
        }),
      'Parâmetros gerais atualizados.',
    );
  }

  function salvarFaixa(evento: React.FormEvent) {
    evento.preventDefault();
    if (!faixaEditando) return;

    const dados = {
      id: faixaEditando.id,
      ate: Number(faixaEditando.ate),
      valorBase: Number(faixaEditando.valorBase),
    };

    if (!dados.ate || dados.ate <= 0 || !dados.valorBase || dados.valorBase <= 0) {
      mostrar('Informe teto de volume e preço base maiores que zero.', 'erro');
      return;
    }

    executar(async () => {
      await precificacao.salvarFaixa(dados);
      setFaixaEditando(null);
    }, 'Faixa salva.');
  }

  function salvarAdicional(evento: React.FormEvent) {
    evento.preventDefault();
    if (!adicionalEditando) return;

    const dados = {
      id: adicionalEditando.id,
      nome: (adicionalEditando.nome ?? '').trim(),
      tipo: (adicionalEditando.tipo ?? 'fixo') as 'fixo' | 'percentual',
      valor: Number(adicionalEditando.valor),
    };

    if (!dados.nome || !dados.valor || dados.valor <= 0) {
      mostrar('Informe nome e valor maiores que zero.', 'erro');
      return;
    }

    executar(async () => {
      await precificacao.salvarAdicional(dados);
      setAdicionalEditando(null);
    }, 'Adicional salvo.');
  }

  function excluirFaixa(f: FaixaVolumeDb) {
    if (faixas.length <= 1) {
      mostrar('É preciso manter ao menos uma faixa de volume.', 'erro');
      return;
    }
    if (!confirm(`Excluir a faixa de até ${f.ate} m³?`)) return;
    executar(() => precificacao.excluirFaixa(f.id), 'Faixa excluída.');
  }

  function excluirAdicional(a: AdicionalDb) {
    if (!confirm(`Excluir o adicional "${a.nome}"?`)) return;
    executar(() => precificacao.excluirAdicional(a.id), 'Adicional excluído.');
  }

  /** Piso da faixa: o teto da faixa anterior. */
  function pisoDaFaixa(indice: number): number {
    return indice > 0 ? faixas[indice - 1].ate : 0;
  }

  if (carregando) {
    return <div className="card">Carregando parâmetros…</div>;
  }

  return (
    <div className="card">
      <div className="entre" style={{ marginBottom: 8 }}>
        <h2 className="card-title" style={{ marginBottom: 0 }}>
          Parâmetros de precificação
        </h2>
      </div>

      <p className="field-hint" style={{ marginBottom: 20 }}>
        Dado interno — visível apenas para Administrador e Financeiro. Alterações valem
        imediatamente para novos cálculos; orçamentos já emitidos não mudam.
      </p>

      {/* ---------- Gerais ---------- */}
      <form onSubmit={salvarGerais}>
        <div className="form-row-3">
          <div className="field">
            <label htmlFor="custoKm">Custo por km (R$)</label>
            <input
              id="custoKm"
              inputMode="decimal"
              value={custoKm}
              onChange={(e) => setCustoKm(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="margemMin">Margem mínima (%)</label>
            <input
              id="margemMin"
              inputMode="decimal"
              value={margemMin}
              onChange={(e) => setMargemMin(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="margemMax">Margem máxima (%)</label>
            <input
              id="margemMax"
              inputMode="decimal"
              value={margemMax}
              onChange={(e) => setMargemMax(e.target.value)}
            />
            <p className="field-hint">Abaixo de 100% — a fórmula tende ao infinito perto disso.</p>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar parâmetros gerais'}
        </button>
      </form>

      {/* ---------- Faixas de volume ---------- */}
      <div className={estilos.secao}>
        <div className="entre">
          <h3 className={estilos.subtitulo}>Faixas de volume</h3>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setFaixaEditando({ ate: undefined, valorBase: undefined })}
          >
            Nova faixa
          </button>
        </div>

        <div className={estilos.tabelaEnvolucro}>
          <table>
            <thead>
              <tr>
                <th>Faixa</th>
                <th style={{ textAlign: 'right' }}>Preço base</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {faixas.map((f, i) => (
                <tr key={f.id}>
                  <td>
                    {i === faixas.length - 1
                      ? `acima de ${pisoDaFaixa(i)} m³`
                      : `${pisoDaFaixa(i)} – ${f.ate} m³`}
                  </td>
                  <td className="numerico">{formatarBRL(f.valorBase)}</td>
                  <td>
                    <div className="linha-acoes">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setFaixaEditando(f)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => excluirFaixa(f)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Adicionais ---------- */}
      <div className={estilos.secao}>
        <div className="entre">
          <h3 className={estilos.subtitulo}>Serviços adicionais</h3>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setAdicionalEditando({ nome: '', tipo: 'fixo', valor: undefined })}
          >
            Novo adicional
          </button>
        </div>

        <div className={estilos.tabelaEnvolucro}>
          <table>
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {adicionais.map((a) => (
                <tr key={a.id}>
                  <td>{a.nome}</td>
                  <td>{a.tipo === 'fixo' ? 'Valor fixo' : 'Percentual'}</td>
                  <td className="numerico">
                    {a.tipo === 'fixo' ? formatarBRL(a.valor) : `${a.valor}%`}
                  </td>
                  <td>
                    <div className="linha-acoes">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setAdicionalEditando(a)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => excluirAdicional(a)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="field-hint" style={{ marginTop: 12 }}>
          Adicional percentual incide sobre o preço base da faixa, não sobre o total — assim a
          ordem em que os adicionais são marcados não altera o resultado.
        </p>
      </div>

      {/* ---------- Modal de faixa ---------- */}
      <Modal
        titulo={faixaEditando?.id ? 'Editar faixa' : 'Nova faixa de volume'}
        aberto={faixaEditando !== null}
        aoFechar={() => setFaixaEditando(null)}
        rodape={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFaixaEditando(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-faixa" className="btn btn-primary" disabled={salvando}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-faixa" onSubmit={salvarFaixa}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="ate">Volume até (m³)</label>
              <input
                id="ate"
                type="number"
                min="1"
                step="0.5"
                value={faixaEditando?.ate ?? ''}
                onChange={(e) =>
                  setFaixaEditando({ ...faixaEditando, ate: Number(e.target.value) })
                }
                required
              />
              <p className="field-hint">A faixa de maior teto funciona como &ldquo;acima de&rdquo;.</p>
            </div>

            <div className="field">
              <label htmlFor="valorBase">Preço base (R$)</label>
              <input
                id="valorBase"
                type="number"
                min="1"
                step="0.01"
                value={faixaEditando?.valorBase ?? ''}
                onChange={(e) =>
                  setFaixaEditando({ ...faixaEditando, valorBase: Number(e.target.value) })
                }
                required
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ---------- Modal de adicional ---------- */}
      <Modal
        titulo={adicionalEditando?.id ? 'Editar adicional' : 'Novo adicional'}
        aberto={adicionalEditando !== null}
        aoFechar={() => setAdicionalEditando(null)}
        rodape={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAdicionalEditando(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-adicional"
              className="btn btn-primary"
              disabled={salvando}
            >
              Salvar
            </button>
          </>
        }
      >
        <form id="form-adicional" onSubmit={salvarAdicional}>
          <div className="field" style={{ marginBottom: 20 }}>
            <label htmlFor="nomeAd">Nome do serviço</label>
            <input
              id="nomeAd"
              value={adicionalEditando?.nome ?? ''}
              onChange={(e) =>
                setAdicionalEditando({ ...adicionalEditando, nome: e.target.value })
              }
              placeholder="Içamento por sacada"
              required
            />
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="tipoAd">Tipo de cobrança</label>
              <select
                id="tipoAd"
                value={adicionalEditando?.tipo ?? 'fixo'}
                onChange={(e) =>
                  setAdicionalEditando({
                    ...adicionalEditando,
                    tipo: e.target.value as 'fixo' | 'percentual',
                  })
                }
              >
                <option value="fixo">Valor fixo (R$)</option>
                <option value="percentual">Percentual (%)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="valorAd">
                {adicionalEditando?.tipo === 'percentual' ? 'Percentual (%)' : 'Valor (R$)'}
              </label>
              <input
                id="valorAd"
                type="number"
                min="0.01"
                step="0.01"
                value={adicionalEditando?.valor ?? ''}
                onChange={(e) =>
                  setAdicionalEditando({ ...adicionalEditando, valor: Number(e.target.value) })
                }
                required
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
