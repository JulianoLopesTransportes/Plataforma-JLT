/**
 * AUTENTICAÇÃO — Supabase Auth.
 *
 * Substitui o mock da Fase A. Agora existe de verdade:
 *   - senha com hash, gerida pelo Supabase (nunca trafega pelo nosso código)
 *   - sessão em cookie assinado, não em sessionStorage editável
 *   - validação no servidor via middleware.ts, antes de renderizar
 *   - RLS no Postgres aplicando a mesma matriz de lib/permissoes.ts
 *
 * CADASTRO É POR LISTA DE CONVIDADOS. Um gatilho no banco rejeita a criação
 * de usuário cujo e-mail não esteja em `niveis_pre_atribuidos`. Na prática:
 * a tela de cadastro é pública, mas só entra quem o admin autorizou antes.
 * Ver a migration 09 e supabase/README.md.
 */

import { supabase, supabaseConfigurado } from './supabase/cliente';
import type { Nivel } from './permissoes';

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  nivel: Nivel;
  cargo: string;
  usuario: string;
};

export type ResultadoAuth = {
  ok: boolean;
  erro?: string;
};

/** Traduz os erros do Supabase para algo que a equipe entenda. */
function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();

  if (m.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar — verifique sua caixa de entrada.';
  }
  if (m.includes('acesso autorizado')) {
    // Vem da exceção do gatilho criar_perfil_do_usuario.
    return 'Este e-mail não tem acesso autorizado à plataforma. Fale com o administrador.';
  }
  if (m.includes('nome de usuário já está em uso')) {
    return 'Este nome de usuário já está em uso. Escolha outro.';
  }
  if (m.includes('user already registered')) {
    return 'Este e-mail já tem cadastro. Use "Entrar" em vez de "Criar acesso".';
  }
  if (m.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
  }

  /*
   * O Supabase troca QUALQUER exceção de gatilho por esta frase, perdendo
   * o motivo pelo caminho. A checagem prévia em criarAcesso() cobre os
   * casos conhecidos; se ainda assim chegar aqui, o usuário não pode levar
   * "Database error saving new user" na cara — isso não diz nada a ele e
   * parece que a plataforma quebrou.
   */
  if (m.includes('database error')) {
    return 'Não foi possível criar o acesso. Confirme com o administrador se o seu e-mail foi autorizado.';
  }

  return mensagem;
}

/** Entra com e-mail e senha. */
export async function entrar(email: string, senha: string): Promise<ResultadoAuth> {
  const { error } = await supabase().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  });

  return error ? { ok: false, erro: traduzirErro(error.message) } : { ok: true };
}

/**
 * Cria o acesso de quem já foi autorizado pelo admin.
 *
 * A trava real é o gatilho `criar_perfil_do_usuario` no banco, que recusa
 * e-mail fora da lista. O problema é que o Supabase Auth NÃO propaga
 * exceção de gatilho: ele troca qualquer uma por "Database error saving
 * new user". A tradução logo acima para 'acesso autorizado' existe e
 * nunca disparou — a string jamais chega aqui.
 *
 * Por isso perguntamos o motivo ANTES de tentar. Não é validação
 * duplicada por capricho: sem isso, quem não foi autorizado — ou
 * escolheu um nome de usuário em uso — recebe um erro de banco e não tem
 * como saber o que fazer. O gatilho continua sendo a fechadura; isto
 * aqui é a placa na porta.
 */
export async function criarAcesso(dados: {
  email: string;
  senha: string;
  nome: string;
  usuario: string;
}): Promise<ResultadoAuth> {
  const { data: impedimento, error: erroChecagem } = await supabase().rpc(
    'motivo_para_nao_criar_acesso',
    { p_email: dados.email, p_usuario: dados.usuario },
  );

  if (impedimento) return { ok: false, erro: impedimento as string };

  // Falha ao CONSULTAR o motivo não impede a tentativa: o banco ainda vai
  // recusar se for o caso, e travar o cadastro porque a checagem prévia
  // caiu seria pior do que seguir e deixar a trava real decidir.
  if (erroChecagem) {
    console.warn('Não foi possível checar a autorização antes do cadastro:', erroChecagem.message);
  }

  const { error } = await supabase().auth.signUp({
    email: dados.email.trim().toLowerCase(),
    password: dados.senha,
    options: {
      // O gatilho no banco lê estes campos para montar o perfil.
      data: { nome: dados.nome.trim(), usuario: dados.usuario.trim() },
    },
  });

  return error ? { ok: false, erro: traduzirErro(error.message) } : { ok: true };
}

/** Envia e-mail de redefinição de senha. */
export async function recuperarSenha(email: string): Promise<ResultadoAuth> {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/definir-senha`,
  });

  return error ? { ok: false, erro: traduzirErro(error.message) } : { ok: true };
}

/** Define uma nova senha para a sessão de recuperação em curso. */
export async function definirSenha(novaSenha: string): Promise<ResultadoAuth> {
  const { error } = await supabase().auth.updateUser({ password: novaSenha });
  return error ? { ok: false, erro: traduzirErro(error.message) } : { ok: true };
}

/** Encerra a sessão. */
export async function sair(): Promise<void> {
  await supabase().auth.signOut();
}

/**
 * Lê o perfil do usuário da sessão ativa.
 * Retorna null sem sessão, ou quando o perfil foi desativado pelo admin.
 */
export async function perfilAtual(): Promise<Usuario | null> {
  // Ambiente sem Supabase configurado: sem sessão, e sem estourar. Quem
  // chama trata isso como "não autenticado" e manda para a tela de entrada,
  // que por sua vez explica o que falta configurar.
  if (!supabaseConfigurado()) return null;

  try {
    const cliente = supabase();

    const {
      data: { user },
    } = await cliente.auth.getUser();

    if (!user) return null;

    const { data } = await cliente
      .from('perfis')
      .select('id, nome, email, cargo, nivel, usuario, ativo')
      .eq('id', user.id)
      .single();

    if (!data || !data.ativo) return null;

    return {
      id: data.id,
      nome: data.nome,
      email: data.email,
      nivel: data.nivel as Nivel,
      cargo: data.cargo,
      usuario: data.usuario ?? '',
    };
  } catch {
    // Rede fora, projeto pausado, chave inválida: tratamos como sem sessão.
    return null;
  }
}

/** Iniciais do nome, para o avatar do header. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
