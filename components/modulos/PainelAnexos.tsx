'use client';

/**
 * ANEXOS — envio, download e remoção.
 *
 * Usado dentro do detalhe de cliente, veículo e motorista. O `dono` define
 * a pasta no Storage e, por consequência, qual regra de permissão o banco
 * aplica ao arquivo.
 *
 * Os anexos são agrupados por CATEGORIA — contrato, orçamento, documento
 * pessoal… A categoria vive só na tabela, nunca no caminho do arquivo:
 * assim mover um documento de gaveta é um UPDATE, e não copiar-e-apagar.
 */

import { useState, useRef } from 'react';
import {
  anexos as apiAnexos,
  CATEGORIAS_ANEXO,
  ROTULO_CATEGORIA,
  type DonoAnexo,
  type AnexoSalvo,
  type CategoriaAnexo,
} from '@/lib/api/anexos';
import { formatarTamanho, formatarData } from '@/lib/utils/formato';
import { useToast } from '@/components/ui';
import Icone from '@/components/layout/Icone';
import estilos from './painel-anexos.module.css';

export default function PainelAnexos({
  dono,
  donoId,
  anexos,
  podeEnviar,
  podeExcluir,
  aoMudar,
}: {
  dono: DonoAnexo;
  donoId: string;
  anexos: AnexoSalvo[];
  podeEnviar: boolean;
  podeExcluir: boolean;
  aoMudar: () => Promise<void>;
}) {
  const { mostrar } = useToast();
  const [enviando, setEnviando] = useState(false);
  /* Gaveta escolhida para o PRÓXIMO envio. Fica no componente e não em
     cada arquivo porque quem anexa três contratos de uma vez não quer
     escolher "contrato" três vezes. */
  const [categoriaEnvio, setCategoriaEnvio] = useState<CategoriaAnexo>('contrato');
  const campoArquivo = useRef<HTMLInputElement>(null);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? []);
    if (arquivos.length === 0) return;

    setEnviando(true);
    let enviados = 0;

    try {
      // Um a um, para que a falha de um não derrube os demais.
      for (const arquivo of arquivos) {
        try {
          await apiAnexos.enviar(dono, donoId, arquivo, categoriaEnvio);
          enviados++;
        } catch (e) {
          mostrar(
            `${arquivo.name}: ${e instanceof Error ? e.message : 'falha no envio'}`,
            'erro',
          );
        }
      }

      if (enviados > 0) {
        await aoMudar();
        mostrar(
          `${enviados} arquivo(s) anexado(s) em ${ROTULO_CATEGORIA[categoriaEnvio]}.`,
          'sucesso',
        );
      }
    } finally {
      setEnviando(false);
      // Limpa o campo para permitir reenviar o mesmo arquivo.
      if (campoArquivo.current) campoArquivo.current.value = '';
    }
  }

  async function abrir(anexo: AnexoSalvo) {
    try {
      const url = await apiAnexos.urlTemporaria(anexo.caminho);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao abrir o arquivo.', 'erro');
    }
  }

  async function excluir(anexo: AnexoSalvo) {
    if (!confirm(`Excluir "${anexo.nome}"? Esta ação não pode ser desfeita.`)) return;

    try {
      await apiAnexos.excluir(dono, anexo.id, anexo.caminho);
      await aoMudar();
      mostrar('Anexo removido.', 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao remover.', 'erro');
    }
  }

  /**
   * Move o anexo de gaveta.
   *
   * Necessário porque a categoria nasceu depois dos arquivos: tudo que já
   * estava anexado caiu em "Outro", e sem isto ficaria preso lá.
   */
  async function recategorizar(anexo: AnexoSalvo, categoria: CategoriaAnexo) {
    if (categoria === anexo.categoria) return;

    try {
      await apiAnexos.recategorizar(dono, anexo.id, categoria);
      await aoMudar();
      mostrar(`"${anexo.nome}" movido para ${ROTULO_CATEGORIA[categoria]}.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao mudar a categoria.', 'erro');
    }
  }

  /*
   * Agrupa na ordem de CATEGORIAS_ANEXO, não na ordem em que os arquivos
   * chegaram: a lista fica estável entre visitas, e "Contrato" aparece
   * sempre no mesmo lugar. Gaveta vazia não é renderizada.
   */
  const grupos = CATEGORIAS_ANEXO.map((categoria) => ({
    categoria,
    arquivos: anexos.filter((a) => a.categoria === categoria),
  })).filter((g) => g.arquivos.length > 0);

  /** Ícone conforme o tipo, para reconhecer o arquivo de relance. */
  function iconeDoTipo(tipo: string): string {
    if (tipo.startsWith('image/')) return 'guia';
    if (tipo.includes('pdf')) return 'documentos';
    return 'documentos';
  }

  return (
    <div>
      {podeEnviar && (
        <div className={estilos.envio}>
          <input
            ref={campoArquivo}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.doc,.docx"
            onChange={aoEscolher}
            disabled={enviando}
            id={`arquivo-${donoId}`}
            className={estilos.campoOculto}
          />
          <label htmlFor={`arquivo-${donoId}`} className="btn btn-outline btn-sm">
            <Icone nome="mais" tamanho={15} />
            {enviando ? 'Enviando…' : 'Anexar arquivo'}
          </label>

          <label className={estilos.seletorEnvio}>
            em
            <select
              value={categoriaEnvio}
              onChange={(e) => setCategoriaEnvio(e.target.value as CategoriaAnexo)}
              disabled={enviando}
              aria-label="Categoria do próximo anexo"
            >
              {CATEGORIAS_ANEXO.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </label>

          <span className={estilos.limite}>Até 10 MB — imagem, PDF ou Word</span>
        </div>
      )}

      {anexos.length === 0 ? (
        <div className="estado-vazio">
          <strong>Sem anexos</strong>
          {podeEnviar
            ? 'Nenhum documento anexado ainda.'
            : 'Nenhum documento anexado, e seu nível não permite anexar.'}
        </div>
      ) : (
        grupos.map(({ categoria, arquivos }) => (
          <div key={categoria} className={estilos.grupo}>
            <h4 className={estilos.tituloGrupo}>
              {ROTULO_CATEGORIA[categoria]}
              <span className={estilos.contagem}>{arquivos.length}</span>
            </h4>

            <ul className={estilos.lista}>
              {arquivos.map((a) => (
                <li key={a.id} className={estilos.item}>
                  <span className={estilos.icone}>
                    <Icone nome={iconeDoTipo(a.tipo)} tamanho={18} />
                  </span>

                  <button type="button" className={estilos.nome} onClick={() => abrir(a)}>
                    <strong>{a.nome}</strong>
                    <span className="texto-secundario">
                      {formatarTamanho(a.tamanho)} · {formatarData(a.enviadoEm.slice(0, 10))}
                    </span>
                  </button>

                  {podeEnviar && (
                    <select
                      className={estilos.moverGaveta}
                      value={a.categoria}
                      onChange={(e) => recategorizar(a, e.target.value as CategoriaAnexo)}
                      aria-label={`Categoria de ${a.nome}`}
                      title="Mover para outra categoria"
                    >
                      {CATEGORIAS_ANEXO.map((c) => (
                        <option key={c} value={c}>
                          {ROTULO_CATEGORIA[c]}
                        </option>
                      ))}
                    </select>
                  )}

                  {podeExcluir && (
                    <button
                      type="button"
                      className={estilos.remover}
                      onClick={() => excluir(a)}
                      aria-label={`Excluir ${a.nome}`}
                    >
                      <Icone nome="fechar" tamanho={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
