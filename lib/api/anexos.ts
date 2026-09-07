/**
 * ANEXOS — Supabase Storage.
 *
 * O bucket é PRIVADO. Não existe URL pública: para abrir um arquivo,
 * pedimos uma URL assinada de curta duração. Sem isso, qualquer pessoa com
 * o link veria documento de cliente sem passar por autenticação.
 *
 * O caminho carrega o módulo dono do arquivo — clientes/, veiculos/,
 * motoristas/ — e é ele que as policies do Storage inspecionam para
 * aplicar a mesma matriz de permissões das tabelas. Ver a migration
 * supabase/migrations/13_storage_anexos.sql.
 */

import { supabase, supabaseConfigurado } from '../supabase/cliente';
import { slug } from '../utils/formato';

const BUCKET = 'anexos';

/** Quanto tempo a URL assinada vale, em segundos. */
const VALIDADE_URL = 60 * 10;

export type DonoAnexo = 'clientes' | 'veiculos' | 'motoristas';

/**
 * Gaveta do anexo.
 *
 * Lista fechada, espelhando o CHECK da migration 28 — texto e não enum,
 * porque é lista que muda com o uso e enum do Postgres não devolve valor
 * removido. Ao acrescentar uma aqui, acrescente lá também.
 */
export const CATEGORIAS_ANEXO = [
  'contrato',
  'orcamento',
  'documento_pessoal',
  'comprovante_endereco',
  'inventario',
  'foto',
  'outro',
] as const;

export type CategoriaAnexo = (typeof CATEGORIAS_ANEXO)[number];

export const ROTULO_CATEGORIA: Record<CategoriaAnexo, string> = {
  contrato: 'Contrato',
  orcamento: 'Orçamento',
  documento_pessoal: 'Documento pessoal',
  comprovante_endereco: 'Comprovante de endereço',
  inventario: 'Inventário',
  foto: 'Foto',
  outro: 'Outro',
};

/** Categoria vinda do banco que o código não conhece cai em 'outro'. */
export function categoriaValida(valor: unknown): CategoriaAnexo {
  return (CATEGORIAS_ANEXO as readonly string[]).includes(valor as string)
    ? (valor as CategoriaAnexo)
    : 'outro';
}

/** Tabela de anexos correspondente a cada dono. */
const TABELA: Record<DonoAnexo, string> = {
  clientes: 'cliente_anexos',
  veiculos: 'veiculo_anexos',
  motoristas: 'motorista_anexos',
};

/** Nome da coluna que aponta para o registro dono. */
const COLUNA_DONO: Record<DonoAnexo, string> = {
  clientes: 'cliente_id',
  veiculos: 'veiculo_id',
  motoristas: 'motorista_id',
};

export type AnexoSalvo = {
  id: string;
  nome: string;
  caminho: string;
  tipo: string;
  tamanho: number;
  enviadoEm: string;
  categoria: CategoriaAnexo;
};

/**
 * Monta um caminho previsível e sem surpresa.
 *
 * O nome original é normalizado — acento, espaço e caractere especial saem
 * — porque o Storage rejeita alguns deles e porque nome sujo dificulta
 * depurar depois. O carimbo de tempo evita colisão entre dois arquivos de
 * mesmo nome no mesmo registro.
 */
function montarCaminho(dono: DonoAnexo, donoId: string, nomeArquivo: string): string {
  const ponto = nomeArquivo.lastIndexOf('.');
  const base = ponto > 0 ? nomeArquivo.slice(0, ponto) : nomeArquivo;
  const extensao = ponto > 0 ? nomeArquivo.slice(ponto).toLowerCase() : '';

  return `${dono}/${donoId}/${Date.now()}-${slug(base).slice(0, 60)}${extensao}`;
}

export const anexos = {
  /**
   * Envia o arquivo e registra a referência na tabela do módulo.
   *
   * A categoria vai só para a tabela, NUNCA para o caminho do Storage.
   * Assim recategorizar é um UPDATE, e não copiar-e-apagar o arquivo — e o
   * caminho, que as policies do Storage inspecionam para decidir
   * permissão, continua estável.
   */
  async enviar(
    dono: DonoAnexo,
    donoId: string,
    arquivo: File,
    categoria: CategoriaAnexo = 'outro',
  ): Promise<AnexoSalvo> {
    if (!supabaseConfigurado()) {
      throw new Error('Envio de arquivo exige o banco de dados configurado.');
    }

    const cliente = supabase();
    const caminho = montarCaminho(dono, donoId, arquivo.name);

    const { error: erroUpload } = await cliente.storage.from(BUCKET).upload(caminho, arquivo, {
      contentType: arquivo.type,
      upsert: false,
    });

    if (erroUpload) throw new Error(traduzirStorage(erroUpload.message));

    const { data, error } = await cliente
      .from(TABELA[dono])
      .insert({
        [COLUNA_DONO[dono]]: donoId,
        nome: arquivo.name,
        caminho,
        tipo: arquivo.type,
        tamanho: arquivo.size,
        categoria,
      })
      .select()
      .single();

    if (error) {
      // O registro falhou depois do upload: remove o arquivo para não
      // deixar lixo inalcançável no bucket.
      await cliente.storage.from(BUCKET).remove([caminho]);
      throw new Error(error.message);
    }

    return {
      id: data.id,
      nome: data.nome,
      caminho: data.caminho,
      tipo: data.tipo,
      tamanho: data.tamanho,
      enviadoEm: data.enviado_em,
      categoria: categoriaValida(data.categoria),
    };
  },

  /**
   * Move o anexo de gaveta.
   *
   * Existe porque a categoria nasceu depois dos arquivos: tudo que já
   * estava anexado caiu em 'outro', e sem isto ficaria preso lá. Só mexe
   * na tabela — o arquivo no Storage não se move.
   */
  async recategorizar(
    dono: DonoAnexo,
    anexoId: string,
    categoria: CategoriaAnexo,
  ): Promise<void> {
    const { error } = await supabase()
      .from(TABELA[dono])
      .update({ categoria })
      .eq('id', anexoId);

    if (error) throw new Error(traduzirStorage(error.message));
  },

  /**
   * URL temporária para abrir ou baixar o arquivo.
   * Expira em 10 minutos — tempo de clicar e abrir, não de compartilhar.
   */
  async urlTemporaria(caminho: string): Promise<string> {
    const { data, error } = await supabase()
      .storage.from(BUCKET)
      .createSignedUrl(caminho, VALIDADE_URL);

    if (error) throw new Error(traduzirStorage(error.message));
    return data.signedUrl;
  },

  /** Remove o arquivo e o registro. */
  async excluir(dono: DonoAnexo, anexoId: string, caminho: string): Promise<void> {
    const cliente = supabase();

    const { error } = await cliente.from(TABELA[dono]).delete().eq('id', anexoId);
    if (error) throw new Error(error.message);

    const { error: erroStorage } = await cliente.storage.from(BUCKET).remove([caminho]);
    // O registro já saiu; um arquivo remanescente é lixo, não inconsistência
    // visível. Não vale falhar a operação inteira por causa disso.
    if (erroStorage) {
      console.warn('Arquivo removido do banco mas não do Storage:', caminho, erroStorage.message);
    }
  },
};

function traduzirStorage(mensagem: string): string {
  const m = mensagem.toLowerCase();

  if (m.includes('bucket not found')) {
    return 'O armazenamento de arquivos ainda não foi criado. Aplique a migration 13_storage_anexos.sql.';
  }
  if (m.includes('exceeded the maximum allowed size') || m.includes('payload too large')) {
    return 'Arquivo grande demais. O limite é 10 MB.';
  }
  if (m.includes('mime type') || m.includes('invalid_mime_type')) {
    return 'Formato não aceito. Envie imagem (JPG, PNG, WebP), PDF ou documento Word.';
  }
  if (m.includes('violates row-level security') || m.includes('unauthorized')) {
    return 'Seu nível de acesso não permite anexar arquivos aqui.';
  }
  if (m.includes('already exists')) {
    return 'Já existe um arquivo com esse nome. Renomeie e tente de novo.';
  }
  return mensagem;
}
