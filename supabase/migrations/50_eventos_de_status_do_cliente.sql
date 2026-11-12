-- As transições de etapa do cliente passam a ser DADO, não frase.
--
-- Até aqui a única memória de que um cliente mudou de etapa era uma linha de
-- texto livre em `cliente_historico`: "Status alterado de Novo para Fechada."
-- Dá para ler com os olhos; não dá para somar. E qualquer mudança de redação
-- quebraria todo relatório construído em cima, em silêncio.
--
-- Conversão por etapa e tempo de ciclo exigem as TRANSIÇÕES, não o status
-- atual: um retrato do estado de hoje perde o caminho que trouxe até ele.

create table if not exists cliente_status_eventos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  /* Nulo marca a ENTRADA no funil — não havia etapa anterior. */
  de status_cliente,
  para status_cliente not null,
  em timestamptz not null default now(),
  autor uuid references perfis(id) on delete set null,
  autor_nome text not null default '',
  /*
   * RETROATIVO distingue o que eu SEI do que eu INVENTARIA.
   *
   * Os 60 clientes que já existem têm status atual e data de cadastro, e
   * mais nada: não existe em lugar nenhum quando cada um passou de Novo
   * para Em andamento, ou para Fechada. Inventar uma data para fechar o
   * gráfico seria fabricar dado.
   *
   * Então a semente grava UM evento por cliente, marcado retroativo, e os
   * cálculos que dependem de quando a coisa aconteceu — tempo de ciclo,
   * conversão de etapa para etapa — simplesmente ignoram esses. Contagem
   * por etapa continua exata, porque ela só precisa do status atual.
   *
   * A série histórica de verdade começa no dia em que isto sobe.
   */
  retroativo boolean not null default false
);

create index if not exists cliente_status_eventos_cliente_idx
  on cliente_status_eventos(cliente_id);
create index if not exists cliente_status_eventos_em_idx
  on cliente_status_eventos(em);

alter table cliente_status_eventos enable row level security;

-- Leitura para quem vê clientes. ESCRITA para ninguém: quem grava é o
-- gatilho, que roda como dono. Trilha que o usuário pode editar não é
-- trilha.
create policy cliente_status_eventos_sel on cliente_status_eventos
  for select using (pode_ver('clientes'));

-- O gatilho.
--
-- No banco e não na tela, de propósito: status mudado por outro caminho —
-- carga em lote, correção pelo dono, a função agendar_cliente — também
-- precisa entrar na trilha. Código de tela só captura o que passa por ele.
--
-- SECURITY DEFINER porque não há policy de INSERT: é o que permite ao
-- gatilho gravar numa tabela que nenhum usuário escreve.
create or replace function public.registra_status_do_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nome text := '';
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  -- Nome resolvido aqui para o relatório não depender de join com perfis,
  -- e para a trilha continuar legível se o perfil for apagado depois.
  select nome into v_nome from perfis where id = auth.uid();

  insert into cliente_status_eventos (cliente_id, de, para, autor, autor_nome)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    auth.uid(),
    coalesce(v_nome, '')
  );

  return null;
end;
$$;

revoke execute on function public.registra_status_do_cliente()
  from public, anon, authenticated;

drop trigger if exists clientes_registra_status on clientes;
create trigger clientes_registra_status
  after insert or update of status on clientes
  for each row execute function registra_status_do_cliente();

-- A semente: um evento por cliente existente, marcado retroativo.
--
-- `em = criado_em` e `de = null`: o que se sabe é que o cliente entrou no
-- funil naquela data e que HOJE está nesta etapa. O caminho entre as duas
-- coisas não existe, e a marca retroativo é o que impede os cálculos de
-- fingir que existe.
insert into cliente_status_eventos (cliente_id, de, para, em, autor_nome, retroativo)
select c.id, null, c.status, c.criado_em, 'carga inicial', true
from clientes c
where not exists (
  select 1 from cliente_status_eventos e where e.cliente_id = c.id
);
