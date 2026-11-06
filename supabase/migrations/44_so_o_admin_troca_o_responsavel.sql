-- Aperta a regra de responsável: só quem administra a equipe troca.
--
-- A 42 deixava o próprio responsável entregar o cliente. O Juliano
-- reviu: passagem de bastão passa por ele. Quem não é admin cadastra
-- sempre no próprio nome, e se o cliente era para outro atendente, o
-- admin corrige depois.

-- 1. No INSERT, quem não administra equipe nasce dono de si.
--
-- Antes isto só preenchia o campo vazio. Agora ele IMPÕE: venha o que
-- vier no insert, quem não é admin fica com o próprio id. É silencioso
-- de propósito — a tela manda o id certo de qualquer jeito, e quem
-- chegasse por fora dela com o id de um colega estaria burlando a regra,
-- não cometendo um engano que mereça mensagem.
--
-- `auth.uid() is null` escapa cedo e NÃO mexe em nada: é o caminho de
-- quem escreve sem sessão de usuário — seed, carga em lote, correção
-- pelo dono do banco. Sem essa saída, um insert feito como `postgres`
-- com responsável escolhido teria o campo zerado para null, porque
-- `pode_editar('usuarios')` é falso quando não há perfil por trás.
-- `anon` não aproveita a brecha: o RLS de clientes o barra antes.
create or replace function public.preenche_responsavel_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  eu uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select id into eu from perfis where id = auth.uid() and ativo;

  if pode_editar('usuarios') then
    -- Admin escolhe de quem é. Sem escolha, fica com ele.
    if new.responsavel_id is null then
      new.responsavel_id := eu;
    end if;
  else
    new.responsavel_id := eu;
  end if;

  -- `eu` nulo (sem perfil ativo) deixa a coluna nula e o insert PASSA.
  -- Travar aqui derrubaria todo cadastro, que foi o estrago da 30.
  return new;
end;
$$;

-- 2. No UPDATE, só o admin troca.
--
-- Caem as três saídas da 42 — dono atual, cliente sem dono e dono
-- inativo. A de "dono inativo" existia para que a carteira de quem sai
-- da empresa não ficasse travada; com admin-only ela perde a razão de
-- ser, porque o admin sempre alcança.
--
-- Efeito colateral que o Juliano conhece e aceitou: os 45 clientes sem
-- responsável de hoje só podem ser atribuídos por ele. Ninguém "assume"
-- um cliente órfão por conta própria.
create or replace function public.protege_responsavel_do_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- `update of` dispara mesmo quando a tela reenvia o mesmo valor.
  if new.responsavel_id is not distinct from old.responsavel_id then
    return new;
  end if;

  -- Mesma saída do gatilho acima: escrita sem sessão de usuário passa.
  -- Sem ela, nem o dono do banco consertaria um responsável errado.
  if auth.uid() is null then
    return new;
  end if;

  if pode_editar('usuarios') then
    return new;
  end if;

  raise exception
    'Só o administrador pode alterar o responsável por um cliente.'
    using errcode = 'insufficient_privilege';
end;
$$;

-- Recriar função devolve EXECUTE para PUBLIC. A 43 revogou; sem repetir
-- aqui, as duas voltariam a ficar chamáveis por /rest/v1/rpc.
revoke execute on function public.preenche_responsavel_cliente() from public, anon, authenticated;
revoke execute on function public.protege_responsavel_do_cliente() from public, anon, authenticated;
