-- Conserto de um descuido das migrations 21 e 23.
--
-- Elas fizeram `revoke execute ... from anon`, o que não tem efeito: no
-- Postgres toda função nasce com EXECUTE concedido a PUBLIC, e `anon`
-- herda dali. Revogar do papel sem revogar de PUBLIC deixa a porta
-- aberta — foi o que o linter do Supabase apontou.
--
-- É o mesmo padrão que a migration 06 usou para as funções originais.
revoke execute on function public.nivel_atual() from public, anon;
revoke execute on function public.criar_nivel(text, text, text) from public, anon;

-- E devolve para quem precisa: a plataforma chama criar_nivel com sessão,
-- e a própria função checa pode_editar('usuarios') antes de fazer nada.
grant execute on function public.nivel_atual() to authenticated;
grant execute on function public.criar_nivel(text, text, text) to authenticated;
