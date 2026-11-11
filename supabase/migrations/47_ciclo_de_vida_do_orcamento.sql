-- O orçamento passa a ter ciclo de vida: ser enviado, aprovado, recusado,
-- corrigido e apagado.
--
-- Até aqui ele nascia 'rascunho' e MORRIA 'rascunho'. A função aprovar()
-- existia na camada de API e não era chamada por nenhum botão. Resultado
-- no banco do Juliano: 33 orçamentos, R$ 310.450, todos em rascunho — e o
-- Relatórios calcula faturamento filtrando status='aprovado', então o
-- faturamento dele era zero por construção, por mais que vendesse.

-- 1. Valor negociado, e o registro de quem aprovou.
--
-- NULO quando não houve negociação, e aí vale o valor calculado. Nulo e
-- não zero: zero é um preço, e significaria serviço de graça.
alter table orcamentos
  add column if not exists valor_negociado numeric,
  add column if not exists aprovado_por uuid references perfis(id) on delete set null,
  add column if not exists aprovado_em timestamptz;

comment on column orcamentos.valor_negociado is
  'Preço efetivamente fechado, quando difere do calculado. NULO = vale valor_final. Permite ao relatório separar calculado de negociado.';

-- 2. No máximo UM orçamento aprovado por cliente.
--
-- Esta é a trava que faz o faturamento ser confiável, e sem ela o bloco
-- não resolve nada: três orçamentos aprovados do mesmo cliente fariam o
-- Relatórios contar a receita três vezes.
--
-- Índice parcial, não constraint: a unicidade só vale entre os aprovados.
-- Rascunho e recusado podem repetir à vontade — é normal orçar três vezes
-- para a mesma mudança.
create unique index if not exists orcamentos_um_aprovado_por_cliente
  on orcamentos (cliente_id)
  where status = 'aprovado' and cliente_id is not null;

-- 3. Quem pode aprovar.
--
-- Regra combinada com o Juliano: a capacidade `aprovar` (hoje admin e
-- financeiro) OU o responsável pelo cliente. A capacidade já existia na
-- matriz desde a migration 01 e nunca tinha sido usada por nada —
-- ignorá-la a deixaria morta e enganosa.
--
-- As saídas, no mesmo espírito das travas anteriores:
--   - sem sessão de usuário (seed, carga, dono do banco) passa sem mexer;
--   - CLIENTE SEM RESPONSÁVEL cai para quem edita orçamentos. São 31 dos
--     60 clientes dele hoje; sem esta saída o orçamento deles seria
--     impossível de aprovar, e o bloco nasceria travado.
create or replace function public.pode_aprovar_orcamento(p_cliente_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_responsavel uuid;
begin
  if auth.uid() is null then
    return true;
  end if;

  if pode_fazer('aprovar') then
    return true;
  end if;

  if p_cliente_id is null then
    -- Orçamento avulso não tem responsável de quem herdar a autoridade.
    return pode_editar('orcamentos');
  end if;

  select responsavel_id into v_responsavel from clientes where id = p_cliente_id;

  if v_responsavel is null then
    return pode_editar('orcamentos');
  end if;

  return v_responsavel = auth.uid();
end;
$$;

revoke execute on function public.pode_aprovar_orcamento(uuid) from public, anon;
grant execute on function public.pode_aprovar_orcamento(uuid) to authenticated;

-- 4. Mudar o status.
--
-- Função, e não UPDATE do navegador, por causa do passo que ninguém vê:
-- ao aprovar, ela REBAIXA para 'recusado' o orçamento aprovado anterior
-- daquele cliente, na mesma transação. Sem isso o índice do passo 2
-- estouraria na cara do usuário e ele não teria como saber qual recusar.
create or replace function public.mudar_status_orcamento(
  p_id uuid,
  p_status status_orcamento
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cliente_id uuid;
  v_status_atual status_orcamento;
begin
  if not pode_editar('orcamentos') then
    raise exception 'Seu nível não permite mexer em orçamentos.'
      using errcode = 'insufficient_privilege';
  end if;

  select cliente_id, status into v_cliente_id, v_status_atual
  from orcamentos where id = p_id;

  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
  end if;

  if p_status = v_status_atual then
    return;
  end if;

  -- Só APROVAR é restrito. Enviar e recusar são parte do trabalho de quem
  -- orça, e recusar precisa ser fácil: travar isso só acumularia lixo.
  if p_status = 'aprovado' and not pode_aprovar_orcamento(v_cliente_id) then
    raise exception
      'Só quem tem a permissão de aprovar, ou o responsável pelo cliente, pode aprovar este orçamento.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_status = 'aprovado' and v_cliente_id is not null then
    update orcamentos
       set status = 'recusado', aprovado_por = null, aprovado_em = null
     where cliente_id = v_cliente_id
       and status = 'aprovado'
       and id <> p_id;
  end if;

  update orcamentos
     set status = p_status,
         -- Desaprovar limpa o registro: deixar o nome de quem aprovou num
         -- orçamento recusado afirmaria algo que deixou de ser verdade.
         aprovado_por = case when p_status = 'aprovado' then auth.uid() else null end,
         aprovado_em  = case when p_status = 'aprovado' then now() else null end
   where id = p_id;
end;
$$;

revoke execute on function public.mudar_status_orcamento(uuid, status_orcamento) from public, anon;
grant execute on function public.mudar_status_orcamento(uuid, status_orcamento) to authenticated;

-- 5. Corrigir o orçamento.
--
-- Espelha criar_orcamento: função porque os adicionais vivem em tabela
-- filha e têm de ser trocados junto com o cabeçalho. Dois UPDATEs do
-- navegador deixariam, numa falha no meio, um preço novo com a composição
-- antiga — exatamente a incoerência que o Juliano quer evitar ao editar.
--
-- SECURITY DEFINER pelo mesmo motivo da 29: resolve `adicionais.nome`
-- para quem não alcança a tabela. Checa a permissão na primeira linha.
create or replace function public.atualizar_orcamento(p_orcamento jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_item jsonb;
begin
  if not pode_editar('orcamentos') then
    raise exception 'Seu nível não permite editar orçamentos.'
      using errcode = 'insufficient_privilege';
  end if;

  v_id := nullif(p_orcamento ->> 'id', '')::uuid;
  if v_id is null then
    raise exception 'Informe qual orçamento está sendo corrigido.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from orcamentos where id = v_id) then
    raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
  end if;

  update orcamentos set
    volume_m3         = coalesce((p_orcamento ->> 'volume_m3')::numeric, volume_m3),
    distancia_km      = coalesce((p_orcamento ->> 'distancia_km')::numeric, distancia_km),
    custo_base        = coalesce((p_orcamento ->> 'custo_base')::numeric, custo_base),
    margem_percentual = coalesce((p_orcamento ->> 'margem_percentual')::numeric, margem_percentual),
    valor_final       = coalesce((p_orcamento ->> 'valor_final')::numeric, valor_final),
    observacoes       = coalesce(p_orcamento ->> 'observacoes', observacoes),
    -- Chave presente com null LIMPA a negociação; chave ausente mantém.
    -- Sem essa distinção não haveria como desfazer um valor negociado.
    valor_negociado   = case
                          when p_orcamento ? 'valor_negociado'
                            then nullif(p_orcamento ->> 'valor_negociado', '')::numeric
                          else valor_negociado
                        end
  where id = v_id;

  -- Os adicionais são SUBSTITUÍDOS, não mesclados: a tela manda a lista
  -- inteira, e mesclar deixaria para trás um adicional que o usuário
  -- acabou de desmarcar.
  if p_orcamento ? 'adicionais' then
    delete from orcamento_adicionais where orcamento_id = v_id;

    for v_item in
      select * from jsonb_array_elements(coalesce(p_orcamento -> 'adicionais', '[]'::jsonb))
    loop
      insert into orcamento_adicionais (orcamento_id, adicional_id, quantidade, nome)
      select v_id, a.id, coalesce((v_item ->> 'quantidade')::numeric, 1), a.nome
      from adicionais a
      where a.id = (v_item ->> 'adicional_id')::uuid
      on conflict (orcamento_id, adicional_id) do nothing;
    end loop;
  end if;
end;
$$;

revoke execute on function public.atualizar_orcamento(jsonb) from public, anon;
grant execute on function public.atualizar_orcamento(jsonb) to authenticated;

-- 6. A visão ganha as colunas novas.
--
-- `valor_negociado` é PREÇO, não custo: nunca é mascarado. Quem vê o
-- valor final tem de ver o negociado, senão a tela mostra um número que
-- não é o que foi fechado.
--
-- As colunas novas vão no FIM, e as doze antigas ficam na ordem exata em
-- que estavam. `create or replace view` não troca nome nem posição de
-- coluna existente — só aceita acrescentar ao final. Reordenar aqui faria
-- a migration falhar com "cannot change name of view column".
--
-- security_invoker continua ligado, como estava: esta visão respeita o RLS
-- de `orcamentos` e mascara apenas COLUNA, que é o que o RLS não faz.
create or replace view orcamentos_visao with (security_invoker = on) as
select
  o.id, o.cliente_id, o.cliente_nome, o.status, o.data,
  o.volume_m3, o.distancia_km,
  case when pode_fazer('ver_custos') then o.custo_base else null end as custo_base,
  case when pode_fazer('ver_custos') then o.margem_percentual else null end as margem_percentual,
  o.valor_final,
  o.observacoes,
  o.criado_em,
  o.valor_negociado,
  o.aprovado_por,
  o.aprovado_em,
  o.criado_por,
  o.atualizado_em
from orcamentos o;

revoke all on public.orcamentos_visao from public, anon;
grant select on public.orcamentos_visao to authenticated;
