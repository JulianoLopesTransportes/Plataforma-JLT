-- Devolve o MOTIVO de um cadastro não poder ser criado, antes de tentar.
--
-- O gatilho `criar_perfil_do_usuario` já recusa e-mail fora da lista com
-- uma mensagem escrita em português e voltada ao usuário. Só que o
-- Supabase Auth NÃO propaga exceção de gatilho: ele troca tudo por
--
--   "Database error saving new user"
--
-- Em lib/auth.ts existe até a tradução dessa mensagem, e ela é código
-- morto — a string nunca chega. Na prática, quem não foi autorizado, ou
-- escolheu um nome de usuário já usado, leva um erro de banco na cara e
-- não tem como saber o que fazer.
--
-- A tela passa a chamar isto ANTES do signUp e mostrar a razão de fato.
-- O gatilho continua sendo a trava real: esta função é a placa na porta,
-- não a fechadura.
create or replace function public.motivo_para_nao_criar_acesso(
  p_email text,
  p_usuario text
)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_usuario text := trim(coalesce(p_usuario, ''));
begin
  if v_email = '' then
    return 'Informe o e-mail.';
  end if;

  if not exists (
    select 1 from niveis_pre_atribuidos where lower(email) = v_email
  ) then
    return 'Este e-mail não tem acesso autorizado à plataforma. Fale com o administrador para ser incluído.';
  end if;

  if exists (select 1 from perfis where lower(email) = v_email and ativo) then
    return 'Este e-mail já tem acesso criado. Use "Entrar" em vez de "Criar acesso".';
  end if;

  if v_usuario <> '' and exists (
    select 1 from perfis where lower(usuario) = lower(v_usuario)
  ) then
    return 'Este nome de usuário já está em uso. Escolha outro.';
  end if;

  -- Sem impedimento.
  return null;
end;
$$;

-- `anon` PRECISA executar esta, e é a única do projeto assim.
--
-- O README diz que executável por anon nunca é intencional; aqui é a
-- exceção, e o motivo é simples: quem cria o acesso ainda não tem sessão.
-- Sem anon, a função não serviria para nada.
--
-- O que ela revela é "este e-mail está na lista" e "este usuário existe".
-- Isso NÃO amplia o que já era obtível: hoje qualquer pessoa descobre o
-- mesmo tentando o cadastro e comparando a resposta. A função troca um
-- sinal confuso por um sinal honesto, sem abrir informação nova. Ela não
-- devolve nome, cargo nem nível — só o impedimento.
revoke execute on function public.motivo_para_nao_criar_acesso(text, text) from public;
grant execute on function public.motivo_para_nao_criar_acesso(text, text) to anon, authenticated;
