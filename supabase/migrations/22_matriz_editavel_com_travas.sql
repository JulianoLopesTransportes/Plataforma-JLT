-- A matriz passa a ser escrita pela plataforma, e ganha as travas que
-- tornam isso seguro.

-- 1. Escrita liberada para quem edita usuários — hoje, só o admin.
--    Até aqui as duas tabelas só tinham policy de SELECT: ninguém
--    escrevia nelas a não ser por migration.
create policy matriz_escrita on permissoes_modulo for all
  using (pode_editar('usuarios')) with check (pode_editar('usuarios'));

create policy capacidades_escrita on permissoes_capacidade for all
  using (pode_editar('usuarios')) with check (pode_editar('usuarios'));

-- 2. A trava que mais importa: nunca ficar sem porta.
--
-- Se nenhum nível tiver 'crud' em usuarios, a tela que edita a matriz
-- some para todo mundo — e o RLS passa a negar a escrita que consertaria
-- isso. Seria preciso mexer no banco por fora para voltar. É o único
-- estado irreversível pela própria interface, então o banco recusa.
create or replace function public.exige_porta_de_usuarios()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from permissoes_modulo where modulo = 'usuarios' and acesso = 'crud'
  ) then
    raise exception
      'Ao menos um nível precisa manter acesso total a Usuários — sem isso ninguém poderia editar a matriz de novo.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

-- Trigger de constraint, adiada para o fim da transação: a tela grava a
-- matriz inteira de uma vez, e passa por estados intermediários inválidos
-- no meio do caminho. Checar linha a linha recusaria gravações legítimas.
create constraint trigger matriz_exige_porta
  after insert or update or delete on permissoes_modulo
  deferrable initially deferred
  for each row execute function exige_porta_de_usuarios();

-- 3. O admin é intocável.
--
-- É a rede de segurança embaixo da trava anterior: mesmo que alguém
-- construa uma combinação esquisita, o administrador continua alcançando
-- tudo. A tela exibe a linha dele travada; isto garante o mesmo contra
-- quem falar direto com a API REST.
create or replace function public.admin_alcanca_tudo()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' then
    if old.nivel = 'admin' then
      raise exception 'A linha do administrador não pode ser removida da matriz.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if new.nivel = 'admin' and new.acesso <> 'crud' then
    raise exception 'O administrador precisa manter acesso total a todos os módulos.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger matriz_protege_admin
  before insert or update or delete on permissoes_modulo
  for each row execute function admin_alcanca_tudo();

-- 4. Nível de sistema não se exclui.
--
-- Os quatro originais são citados por nome no código — a semente de
-- lib/permissoes.ts e o default 'comercial' de perfis.nivel. Sumir com
-- eles quebraria mais do que a tela.
create or replace function public.protege_nivel_de_sistema()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.sistema then
    raise exception 'O nível "%" é de sistema e não pode ser excluído.', old.rotulo
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger niveis_protege_sistema
  before delete on niveis
  for each row execute function protege_nivel_de_sistema();
