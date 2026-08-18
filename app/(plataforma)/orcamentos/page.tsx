'use client';

import { useEffect, useState, useMemo } from 'react';
import { api, type ParametrosPrecificacao } from '@/lib/api';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { podeFazer } from '@/lib/permissoes';
import { formatarBRL } from '@/lib/utils/formato';
import {
  calcularOrcamento,
  margemDoFator,
  fatorDaMargem,
  descreverFator,
  FATOR_MAX,
  FATOR_MIN,
  FATOR_PASSO,
  type ResultadoOrcamento,
} from '@/lib/negocio/precificacao';
import { TituloPagina, useToast } from '@/components/ui';
import PainelPrecificacao from '@/components/modulos/PainelPrecificacao';
import estilos from './orcamentos.module.css';

export default function PaginaOrcamentos() {
  const usuario = useUsuario();
  const { mostrar } = useToast();

  const [parametros, setParametros] = useState<ParametrosPrecificacao | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [volume, setVolume] = useState('');
  const [distancia, setDistancia] = useState('');
  const [fator, setFator] = useState(5);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<ResultadoOrcamento | null>(null);

  const verCustos = podeFazer(usuario.nivel, 'ver_custos');
  const editarParametros = podeFazer(usuario.nivel, 'editar_parametros_precificacao');

  useEffect(() => {
    api.orcamentos.parametros().then((p) => {
      setParametros(p);
      setFator(fatorDaMargem((p.margemMinima + p.margemMaxima) / 2, p.margemMinima, p.margemMaxima));
      setCarregando(false);
    });
  }, []);

  const margem = parametros
    ? margemDoFator(fator, parametros.margemMinima, parametros.margemMaxima)
    : 0;

  function alternarAdicional(id: string) {
    setQuantidades((atual) => {
      const copia = { ...atual };
      if (id in copia) delete copia[id];
      else copia[id] = 1;
      return copia;
    });
  }

  function mudarQuantidade(id: string, valor: number) {
    setQuantidades((atual) => ({ ...atual, [id]: Math.max(1, valor) }));
  }

  function calcular() {
    if (!parametros) return;

    const volumeNum = Number(volume);
    if (!volumeNum || volumeNum <= 0) {
      mostrar('Informe o volume estimado para calcular.', 'erro');
      return;
    }

    const saida = calcularOrcamento({
      volumeM3: volumeNum,
      distanciaKm: Number(distancia) || 0,
      custoPorKm: parametros.custoPorKm,
      margemPercentual: margem,
      faixas: parametros.faixasVolume,
      adicionais: parametros.adicionais,
      adicionaisSelecionados: Object.entries(quantidades).map(([id, quantidade]) => ({
        id,
        quantidade,
      })),
    });

    setResultado(saida);
    if (!saida) mostrar('Não foi possível calcular com os valores informados.', 'erro');
  }

  function limpar() {
    setVolume('');
    setDistancia('');
    setQuantidades({});
    setResultado(null);
    if (parametros) {
      setFator(
        fatorDaMargem(
          (parametros.margemMinima + parametros.margemMaxima) / 2,
          parametros.margemMinima,
          parametros.margemMaxima,
        ),
      );
    }
  }

  const marcasFator = useMemo(
    () => Array.from({ length: FATOR_MAX + 1 }, (_, i) => i),
    [],
  );

  if (carregando || !parametros) {
    return (
      <>
        <TituloPagina titulo="Orçamentos" subtitulo="Carregando parâmetros…" />
      </>
    );
  }

  return (
    <>
      <TituloPagina
        titulo="Orçamentos"
        subtitulo="Calculadora de precificação da mudança."
        acoes={
          <button type="button" className="btn btn-ghost" onClick={limpar}>
            Limpar
          </button>
        }
      />

      <div className={estilos.gradeCalculadora}>
        {/* ---------------- Entrada ---------------- */}
        <div className="card">
          <h2 className="card-title">Dados da mudança</h2>

          <div className="form-row">
            <div className="field">
              <label htmlFor="volume">Volume estimado (m³)</label>
              <input
                id="volume"
                type="number"
                min="0"
                step="0.5"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder="Ex.: 32"
              />
            </div>

            <div className="field">
              <label htmlFor="distancia">Distância (km)</label>
              <input
                id="distancia"
                type="number"
                min="0"
                value={distancia}
                onChange={(e) => setDistancia(e.target.value)}
                placeholder="Ex.: 98"
              />
            </div>
          </div>

          <h3 className={estilos.subtituloBloco}>Serviços adicionais</h3>
          <div className={estilos.listaAdicionais}>
            {parametros.adicionais.map((a) => {
              const marcado = a.id in quantidades;
              const porUnidade = a.tipo === 'por_unidade';

              return (
                <div key={a.id} className={estilos.adicional}>
                  <label className={estilos.adicionalRotulo}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarAdicional(a.id)}
                    />
                    <span className={estilos.adicionalNome}>{a.nome}</span>
                  </label>

                  {marcado && porUnidade && (
                    <div className={estilos.controleUnidade}>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={quantidades[a.id]}
                        onChange={(e) => mudarQuantidade(a.id, Number(e.target.value))}
                        aria-label={`Quantidade de ${a.nome}`}
                      />
                      <span>{a.unidade || 'un'}</span>
                    </div>
                  )}

                  {verCustos && (
                    <span className={estilos.adicionalValor}>
                      {a.tipo === 'fixo' && formatarBRL(a.valor)}
                      {a.tipo === 'percentual' && `+${a.valor}%`}
                      {porUnidade && `${formatarBRL(a.valor)} / ${a.unidade || 'un'}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---------------- Fator oportunidade ---------------- */}
          <h3 className={estilos.subtituloBloco}>Fator oportunidade</h3>

          <div className={estilos.controleFator}>
            <div className={estilos.fatorTopo}>
              <strong className={estilos.fatorValor}>{fator.toFixed(1).replace('.', ',')}</strong>
              <span className={estilos.fatorDescricao}>{descreverFator(fator)}</span>
            </div>

            <input
              type="range"
              min={FATOR_MIN}
              max={FATOR_MAX}
              step={FATOR_PASSO}
              value={fator}
              onChange={(e) => setFator(Number(e.target.value))}
              className={estilos.slider}
              aria-label="Fator oportunidade"
            />

            <div className={estilos.marcas}>
              {marcasFator.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>

            <div className={estilos.escalaRotulos}>
              <span>0 — preço cheio</span>
              <span>10 — máxima concessão</span>
            </div>

            {verCustos && (
              <p className={estilos.margemResultante}>
                Margem resultante:{' '}
                <strong className={margem < 0 ? estilos.margemNegativa : undefined}>
                  {margem.toFixed(1).replace('.', ',')}%
                </strong>
                {margem < 0 && ' — preço abaixo do custo'}
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={calcular}
            style={{ marginTop: 20 }}
          >
            Calcular
          </button>
        </div>

        {/* ---------------- Resultado ---------------- */}
        <div className="card">
          <h2 className="card-title">Resultado</h2>

          {!resultado ? (
            <div className="estado-vazio">
              <strong>Aguardando cálculo</strong>
              Informe o volume e clique em calcular.
            </div>
          ) : (
            <>
              {verCustos && (
                <div className={estilos.composicao}>
                  {resultado.linhas.map((linha, i) => (
                    <div key={i} className={estilos.linhaComposicao}>
                      <span>{linha.rotulo}</span>
                      <span>{formatarBRL(linha.valor)}</span>
                    </div>
                  ))}

                  <div className={`${estilos.linhaComposicao} ${estilos.linhaSubtotal}`}>
                    <span>Custo total estimado</span>
                    <span>{formatarBRL(resultado.custoTotal)}</span>
                  </div>

                  <div
                    className={`${estilos.linhaComposicao} ${
                      resultado.valorMargem >= 0 ? estilos.linhaMargem : estilos.linhaPrejuizo
                    }`}
                  >
                    <span>
                      {resultado.valorMargem >= 0 ? 'Margem aplicada' : 'Desconto aplicado'} (
                      {resultado.margemPercentual.toFixed(1).replace('.', ',')}%)
                    </span>
                    <span>
                      {resultado.valorMargem >= 0 ? '+ ' : '− '}
                      {formatarBRL(Math.abs(resultado.valorMargem))}
                    </span>
                  </div>
                </div>
              )}

              <div className={estilos.precoFinal}>
                <span className={estilos.precoRotulo}>Preço ao cliente</span>
                <strong className={estilos.precoValor}>
                  {formatarBRL(resultado.precoRedondo)}
                </strong>
                {resultado.precoRedondo !== Math.round(resultado.precoFinal) && (
                  <span>Calculado: {formatarBRL(resultado.precoFinal)}</span>
                )}
              </div>

              <h3 className={estilos.subtituloBloco}>Parcelamento</h3>
              <div className={estilos.parcelas}>
                <Parcela
                  rotulo="Sinal"
                  valor={resultado.parcelamento.sinal}
                  quando="Na assinatura"
                />
                <Parcela
                  rotulo="1ª parcela"
                  valor={resultado.parcelamento.primeiraParcela}
                  quando="No carregamento"
                />
                <Parcela
                  rotulo="2ª parcela"
                  valor={resultado.parcelamento.segundaParcela}
                  quando="Antes do descarregamento"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {editarParametros && (
        <div style={{ marginTop: 20 }}>
          <PainelPrecificacao />
        </div>
      )}
    </>
  );
}

function Parcela({ rotulo, valor, quando }: { rotulo: string; valor: number; quando: string }) {
  return (
    <div className={estilos.parcela}>
      <span className={estilos.parcelaRotulo}>{rotulo}</span>
      <strong className={estilos.parcelaValor}>{formatarBRL(valor)}</strong>
      <span className="texto-secundario">{quando}</span>
    </div>
  );
}
