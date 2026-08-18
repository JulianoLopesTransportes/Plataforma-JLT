'use client';

/**
 * PARÂMETROS DE PRECIFICAÇÃO — acordeão.
 *
 * Três seções que abrem uma de cada vez, para a tela ficar limpa enquanto
 * ninguém está editando. Permissão: `editar_parametros_precificacao`, que
 * as policies do banco também exigem.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  precificacao,
  type FaixaVolumeDb,
  type AdicionalDb,
  type ParametrosGerais,
  type TipoAdicionalDb,
} from '@/lib/api/admin';
import { formatarBRL, paraNumero } from '@/lib/utils/formato';
import { Modal, useToast } from '@/components/ui';
import Icone from '@/components/layout/Icone';
import estilos from './painel-precificacao.module.css';

type Secao = 'gerais' | 'faixas' | 'adicionais' | null;

const ROTULO_TIPO: Record<TipoAdicionalDb, string> = {
  fixo: 'Valor fixo',
  percentual: 'Percentual',
  por_unidade: 'Por unidade',
};

export default function PainelPrecificacao() {
  const { mostrar } = useToast();

  const [aberta, setAberta] = useState<Secao>(null);
  const [faixas, setFaixas] = useState<FaixaVolumeDb[]>([]);
  const [adicionais, setAdicionais] = useState<AdicionalDb[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [custoKm, setCustoKm] = useState('');
  const [margemMin, setMargemMin] = useState('');
  const [margemMax, setMargemMax] = useState('');

  const [faixaEditando, setFaixaEditando] = useState<Partial<FaixaVolumeDb> | null>(null);
  const [adicionalEditando, setAdicionalEditando] = useState<Partial<AdicionalDb> | null>(null);

  const carregar = useCallback(async () => {
    const dados = await precificacao.ler();
    setFaixas(dados.faixas);
    setAdicionais(dados.adicionais);

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

  function alternar(secao: Exclude<Secao, null>) {
    setAberta((atual) => (atual === secao ? null : secao));
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

    const tipo = (adicionalEditando.tipo ?? 'fixo') as TipoAdicionalDb;
    const dados = {
      id: adicionalEditando.id,
      nome: (adicionalEditando.nome ?? '').trim(),
      tipo,
      valor: Number(adicionalEditando.valor),
      unidade: (adicionalEditando.unidade ?? '').trim(),
    };

    if (!dados.nome || !dados.valor || dados.valor <= 0) {
      mostrar('Informe nome e valor maiores que zero.', 'erro');
      return;
    }
    if (tipo === 'por_unidade' && !dados.unidade) {
      mostrar('Informe o nome da unidade — caixa, diária, ajudante…', 'erro');
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

  function pisoDaFaixa(indice: number): number {
    return indice > 0 ? faixas[indice - 1].ate : 0;
  }

  function valorDoAdicional(a: AdicionalDb): string {
    if (a.tipo === 'fixo') return formatarBRL(a.valor);
    if (a.tipo === 'percentual') return `${a.valor}%`;
    return `${formatarBRL(a.valor)} / ${a.unidade || 'un'}`;
  }

  if (carregando) {
    return <div className="card">Carregando parâmetros…</div>;
  }

  const margemNegativa = paraNumero(margemMin) < 0;

  return (
    <div className={estilos.painel}>
      {/* ---------------- Gerais ---------------- */}
      <Secao
        titulo="Parâmetros gerais"
        resumo={`${formatarBRL(paraNumero(custoKm))}/km · margem de ${margemMin}% a ${margemMax}%`}
        aberta={aberta === 'gerais'}
        aoAlternar={() => alternar('gerais')}
      >
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
              <p className="field-hint">
                Aceita valor negativo — corresponde ao fator oportunidade 10.
              </p>
            </div>
            <div className="field">
              <label htmlFor="margemMax">Margem máxima (%)</label>
              <input
                id="margemMax"
                inputMode="decimal"
                value={margemMax}
                onChange={(e) => setMargemMax(e.target.value)}
              />
              <p className="field-hint">Corresponde ao fator 0. Abaixo de 100%.</p>
            </div>
          </div>

          {margemNegativa && (
            <p className={estilos.avisoNegativa}>
              Com margem mínima negativa, o fator oportunidade 10 fecha o orçamento
              <strong> abaixo do custo</strong>.
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </Secao>

      {/* ---------------- Faixas ---------------- */}
      <Secao
        titulo="Faixas de volume"
        resumo={`${faixas.length} faixa${faixas.length === 1 ? '' : 's'}`}
        aberta={aberta === 'faixas'}
        aoAlternar={() => alternar('faixas')}
      >
        <div className="entre" style={{ marginBottom: 12 }}>
          <span className="texto-secundario">Preço base por faixa de volume.</span>
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
                <th style={{ width: 150 }} />
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
      </Secao>

      {/* ---------------- Adicionais ---------------- */}
      <Secao
        titulo="Serviços adicionais"
        resumo={`${adicionais.length} serviço${adicionais.length === 1 ? '' : 's'}`}
        aberta={aberta === 'adicionais'}
        aoAlternar={() => alternar('adicionais')}
      >
        <div className="entre" style={{ marginBottom: 12 }}>
          <span className="texto-secundario">
            Percentual incide sobre o preço base da faixa.
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() =>
              setAdicionalEditando({ nome: '', tipo: 'fixo', valor: undefined, unidade: '' })
            }
          >
            Novo adicional
          </button>
        </div>

        <div className={estilos.tabelaEnvolucro}>
          <table>
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Cobrança</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {adicionais.map((a) => (
                <tr key={a.id}>
                  <td>{a.nome}</td>
                  <td>{ROTULO_TIPO[a.tipo]}</td>
                  <td className="numerico">{valorDoAdicional(a)}</td>
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
      </Secao>

      {/* ---------------- Modais ---------------- */}
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
                onChange={(e) => setFaixaEditando({ ...faixaEditando, ate: Number(e.target.value) })}
                required
              />
              <p className="field-hint">A faixa de maior teto vale como &ldquo;acima de&rdquo;.</p>
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
              onChange={(e) => setAdicionalEditando({ ...adicionalEditando, nome: e.target.value })}
              placeholder="Içamento por sacada"
              required
            />
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="tipoAd">Forma de cobrança</label>
              <select
                id="tipoAd"
                value={adicionalEditando?.tipo ?? 'fixo'}
                onChange={(e) =>
                  setAdicionalEditando({
                    ...adicionalEditando,
                    tipo: e.target.value as TipoAdicionalDb,
                  })
                }
              >
                <option value="fixo">Valor fixo (R$)</option>
                <option value="percentual">Percentual (%)</option>
                <option value="por_unidade">Valor por unidade</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="valorAd">
                {adicionalEditando?.tipo === 'percentual'
                  ? 'Percentual (%)'
                  : adicionalEditando?.tipo === 'por_unidade'
                    ? 'Valor por unidade (R$)'
                    : 'Valor (R$)'}
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

          {adicionalEditando?.tipo === 'por_unidade' && (
            <div className="field">
              <label htmlFor="unidadeAd">Nome da unidade</label>
              <input
                id="unidadeAd"
                value={adicionalEditando?.unidade ?? ''}
                onChange={(e) =>
                  setAdicionalEditando({ ...adicionalEditando, unidade: e.target.value })
                }
                placeholder="caixa, diária, ajudante, km…"
                required
              />
              <p className="field-hint">
                No orçamento aparece como &ldquo;{adicionalEditando?.nome || 'Serviço'} (3{' '}
                {adicionalEditando?.unidade || 'unidade'}s)&rdquo;.
              </p>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}

/* ==========================================================================
   Seção do acordeão
   ========================================================================== */

function Secao({
  titulo,
  resumo,
  aberta,
  aoAlternar,
  children,
}: {
  titulo: string;
  resumo: string;
  aberta: boolean;
  aoAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`${estilos.secao} ${aberta ? estilos.secaoAberta : ''}`}>
      <button
        type="button"
        className={estilos.cabecalhoSecao}
        onClick={aoAlternar}
        aria-expanded={aberta}
      >
        <span className={estilos.tituloSecao}>{titulo}</span>
        <span className={estilos.resumoSecao}>{resumo}</span>
        <span className={`${estilos.seta} ${aberta ? estilos.setaAberta : ''}`}>
          <Icone nome="seta" tamanho={16} />
        </span>
      </button>

      {aberta && <div className={estilos.corpoSecao}>{children}</div>}
    </section>
  );
}
