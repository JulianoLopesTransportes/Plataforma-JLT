'use client';

/**
 * ANEXOS — envio, download e remoção.
 *
 * Usado dentro do detalhe de cliente, veículo e motorista. O `dono` define
 * a pasta no Storage e, por consequência, qual regra de permissão o banco
 * aplica ao arquivo.
 */

import { useState, useRef } from 'react';
import { anexos as apiAnexos, type DonoAnexo, type AnexoSalvo } from '@/lib/api/anexos';
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
          await apiAnexos.enviar(dono, donoId, arquivo);
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
        mostrar(`${enviados} arquivo(s) anexado(s).`, 'sucesso');
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
        <ul className={estilos.lista}>
          {anexos.map((a) => (
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
      )}
    </div>
  );
}
