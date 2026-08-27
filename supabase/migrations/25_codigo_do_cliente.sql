-- Código curto e estável para achar o cliente depois: 2026-0001.
--
-- A numeração reinicia a cada ano, então não dá para usar uma sequence do
-- Postgres — elas não sabem reiniciar sozinhas. Uma tabela de contador por
-- ano resolve, e o UPDATE ... RETURNING é atômico: dois cadastros no mesmo
-- instante recebem números diferentes. `max(codigo) + 1` daria empate.
create table if not exists codigo_sequencia (
  ano int primary key,
  ultimo int not null default 0
);

alter table codigo_sequencia enable row level security;

-- Ninguém fala com esta tabela pela API: quem escreve é o gatilho, que roda
-- como SECURITY DEFINER e ignora RLS. Sem policy nenhuma, a tabela fica
-- inalcançável de fora — que é exatamente o que se quer de um contador.

alter table clientes add column if not exists codigo text;

create or replace function public.proximo_codigo_cliente()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ano int := extract(year from now());
  v_numero int;
begin
  insert into codigo_sequencia (ano, ultimo)
  values (v_ano, 1)
  on conflict (ano) do update set ultimo = codigo_sequencia.ultimo + 1
  returning ultimo into v_numero;

  return v_ano || '-' || lpad(v_numero::text, 4, '0');
end;
$$;

create or replace function public.preenche_codigo_cliente()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := proximo_codigo_cliente();
  end if;
  return new;
end;
$$;

create trigger clientes_codigo
  before insert on clientes
  for each row execute function preenche_codigo_cliente();

-- Os clientes que já existem recebem código pelo ano em que foram
-- cadastrados, na ordem em que entraram.
with numerados as (
  select id,
         extract(year from criado_em)::int as ano,
         row_number() over (
           partition by extract(year from criado_em) order by criado_em, id
         ) as pos
  from clientes
  where codigo is null
)
update clientes c
set codigo = n.ano || '-' || lpad(n.pos::text, 4, '0')
from numerados n
where c.id = n.id;

-- O contador precisa continuar de onde a carga inicial parou, senão o
-- próximo cadastro colidiria com um código já usado.
insert into codigo_sequencia (ano, ultimo)
select extract(year from criado_em)::int, count(*)
from clientes
group by extract(year from criado_em)
on conflict (ano) do update set ultimo = greatest(codigo_sequencia.ultimo, excluded.ultimo);

alter table clientes alter column codigo set not null;
create unique index if not exists clientes_codigo_idx on clientes (codigo);

comment on column clientes.codigo is
  'Código curto do cliente no formato ANO-0000. Gerado pelo banco e imutável.';
