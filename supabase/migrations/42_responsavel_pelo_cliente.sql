-- Cada cliente passa a ter um responsável: quem mantém o contato e conduz
-- o processo. É etiqueta de identificação, não de acesso — todo mundo
-- continua vendo todos os clientes, decisão do Juliano.

-- 1. A coluna.
--
-- Referência de verdade a `perfis`, não texto livre: nome digitado à mão
-- vira três grafias do mesmo funcionário e o filtro por responsável para
-- de fechar conta.
--
-- SET NULL no delete: perfil apagado devolve o cliente para a prateleira
-- de "sem dono", onde qualquer um pode assumi-lo. O contrário — levar o
-- cliente junto — seria perder dado de negócio por causa de cadastro.
alter table clientes
  add column if not exists responsavel_id uuid references perfis(id) on delete set null;

-- O filtro "Meus clientes" varre por esta coluna.
create index if not exists clientes_responsavel_idx on clientes(responsavel_id);

-- 2. Cliente novo nasce com dono: quem cadastrou.
--
-- SECURITY DEFINER não é obrigatório hoje — a policy `perfis_leitura` é
-- `using (true)`, então como INVOKER a consulta funcionaria. É DEFINER
-- para que o caminho de INSERT em clientes não dependa do RLS de OUTRA
-- tabela: apertar `perfis_leitura` para "só a própria linha" um dia é
-- hardening razoável, e não deve ter como efeito colateral todo cliente
-- novo nascer órfão.
--
-- A consulta é o que também protege o INSERT: se por algum motivo não
-- houver perfil ativo para o auth.uid() da requisição, a coluna fica NULA
-- e o cadastro passa. Resolver isso com `new.responsavel_id := auth.uid()`
-- direto estouraria a FK e derrubaria TODO insert em clientes — foi
-- exatamente o estrago da migration 30, que ficou uma semana no ar.
create or replace function public.preenche_responsavel_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.responsavel_id is null then
    select id into new.responsavel_id from perfis where id = auth.uid() and ativo;
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_responsavel_padrao on clientes;
create trigger clientes_responsavel_padrao
  before insert on clientes
  for each row execute function preenche_responsavel_cliente();

-- 3. Quem pode repassar o cliente.
--
-- Regra: o responsável atual entrega, ou quem administra a equipe
-- reatribui. Não é `nivel_atual() = 'admin'` fixo porque a matriz é
-- editável desde a migration 22 — amarrar no literal faria a trava
-- ignorar uma delegação que o Juliano tivesse acabado de conceder.
--
-- As duas saídas que evitam cliente travado:
--   - sem dono ainda (os cadastrados antes desta migration): quem quiser assume;
--   - dono INATIVO: funcionário que saiu da empresa não tranca a carteira
--     dele até alguém lembrar de reatribuir à mão.
--
-- SECURITY DEFINER pelo mesmo motivo do gatilho acima, e aqui o risco é
-- maior: a trava lê o `ativo` de OUTRA pessoa. Se `perfis_leitura` for
-- apertada um dia, como INVOKER a consulta voltaria vazia, `dono_ativo`
-- viria NULL e a trava LIBERARIA a troca achando que o dono está inativo.
-- Falha aberta e silenciosa — exatamente o que uma trava não pode fazer.
create or replace function public.protege_responsavel_do_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  dono_ativo boolean;
begin
  -- `update of` dispara mesmo quando a tela reenvia o mesmo valor.
  if new.responsavel_id is not distinct from old.responsavel_id then
    return new;
  end if;

  if pode_editar('usuarios') then
    return new;
  end if;

  if old.responsavel_id is null then
    return new;
  end if;

  if old.responsavel_id = auth.uid() then
    return new;
  end if;

  select ativo into dono_ativo from perfis where id = old.responsavel_id;
  if dono_ativo is not true then
    return new;
  end if;

  raise exception
    'Este cliente está com outro responsável. Só ele ou o administrador podem repassá-lo.'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists clientes_protege_responsavel on clientes;
create trigger clientes_protege_responsavel
  before update of responsavel_id on clientes
  for each row execute function protege_responsavel_do_cliente();

-- 4. A lista de nomes que o seletor precisa.
--
-- Esta view NÃO existe para contornar RLS: a policy `perfis_leitura` é
-- `using (true)`, e qualquer autenticado já lê `perfis` inteira. Ela existe
-- para RECORTAR COLUNA, que é o que o RLS não faz.
--
-- Sem ela, a tela de clientes leria `perfis` direto para montar o seletor e
-- traria E-MAIL e NÍVEL de toda a equipe junto, porque é o que um
-- `select *` do PostgREST devolve. Nome e cargo de quem senta na sala ao
-- lado não são segredo; quem tem qual nível de acesso é outra conversa, e
-- não é coisa que um <select> precisa saber.
--
-- security_invoker = ON de propósito: a view respeita o RLS de `perfis` em
-- vez de atravessá-lo. Como o recorte é só de coluna, não há nada a ganhar
-- rodando como dona — e uma view que fura RLS é dívida que alguém herda.
create or replace view public.equipe with (security_invoker = on) as
  select id, nome, cargo, ativo from perfis;

-- A 24 ensinou que recriar objeto devolve o privilégio padrão. Revoga de
-- PUBLIC e de anon antes de conceder, senão a lista de funcionários fica
-- legível sem login.
revoke all on public.equipe from public, anon;
grant select on public.equipe to authenticated;
