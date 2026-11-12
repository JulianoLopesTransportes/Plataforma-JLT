-- Orçamento passa a ser revisável, e revisar NÃO sobrescreve: grava uma
-- versão nova.
--
-- É o padrão que achei nos produtos do ramo (MoveitPro): cada alteração é
-- uma versão, com quem mudou e quando, e restaurar uma versão antiga cria
-- outra versão em vez de apagar. Encaixa no que o Juliano pediu — "no
-- histórico do cliente deve ter o registro desses valores" —, porque aí o
-- histórico não é um texto dizendo que mudou: é a trilha dos valores.
--
-- O preço disso foi dito e aceito: um relatório tirado antes e outro depois
-- de uma revisão mostram números diferentes para o mesmo serviço.

-- 1. As colunas da cadeia de versões.
alter table orcamentos
  -- Todas as versões de um mesmo orçamento compartilham a raiz. A v1 é
  -- raiz de si mesma.
  add column if not exists raiz_id uuid,
  add column if not exists versao integer not null default 1,
  add column if not exists vigente boolean not null default true,
  /*
   * O FATOR da régua, e não só a margem que ele produziu.
   *
   * A tela trabalha com a régua 0–10; o banco só guardava `margem_percentual`.
   * Para reabrir a calculadora eu teria de inverter margem → fator, e essa
   * inversão depende da faixa mínima/máxima de HOJE. Se o Juliano mexer nos
   * parâmetros, a régua de um orçamento antigo cairia noutro ponto e o
   * operador veria um número que ele nunca escolheu.
   *
   * Nulo nos 33 que já existem: eles foram criados antes da coluna, e
   * inventar um fator seria pior que admitir que não se sabe — a tela cai
   * para a inversão quando é nulo, e avisa.
   */
  add column if not exists fator numeric;

-- Os 33 orçamentos existentes: cada um é raiz de si, v1, vigente.
update orcamentos set raiz_id = id where raiz_id is null;
alter table orcamentos alter column raiz_id set not null;

alter table orcamentos drop constraint if exists orcamentos_raiz_fk;
alter table orcamentos
  add constraint orcamentos_raiz_fk foreign key (raiz_id)
  references orcamentos(id) on delete cascade;

/*
 * UMA versão vigente por cadeia, garantido pelo banco.
 *
 * Índice PARCIAL de propósito: as versões antigas são várias e todas com
 * vigente = false, então um unique comum recusaria a segunda.
 *
 * Isto é também o motivo de a revisão passar por função: a migration 40
 * ensinou que o upsert do PostgREST não casa com índice parcial, e aqui
 * preciso de duas escritas (baixar o vigente antigo, subir o novo) na
 * MESMA transação — senão existe um instante com zero vigentes, ou dois.
 */
drop index if exists orcamentos_vigente_por_raiz;
create unique index orcamentos_vigente_por_raiz on orcamentos(raiz_id) where vigente;

create index if not exists orcamentos_raiz_idx on orcamentos(raiz_id);

-- 2. Raiz preenchida por gatilho, não por cada função que insere.
--
-- Pega TODO caminho de inserção — a função de criar, a de revisar, carga
-- em lote, correção pelo dono do banco. Default de coluna não serve: o
-- valor depende do próprio id da linha.
create or replace function public.preenche_raiz_orcamento()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.raiz_id is null then
    new.raiz_id := new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists orcamentos_raiz_padrao on orcamentos;
create trigger orcamentos_raiz_padrao
  before insert on orcamentos
  for each row execute function preenche_raiz_orcamento();

revoke execute on function public.preenche_raiz_orcamento() from public, anon, authenticated;

-- 3. `criar_orcamento` passa a guardar o fator.
create or replace function public.criar_orcamento(p_orcamento jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_cliente_id uuid;
  v_item jsonb;
begin
  if not pode_editar('orcamentos') then
    raise exception 'Seu nível não permite criar orçamentos.'
      using errcode = 'insufficient_privilege';
  end if;

  v_cliente_id := nullif(p_orcamento ->> 'cliente_id', '')::uuid;

  if v_cliente_id is null then
    raise exception 'Escolha um cliente antes de vincular o orçamento.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from clientes where id = v_cliente_id) then
    raise exception 'Cliente não encontrado.'
      using errcode = 'foreign_key_violation';
  end if;

  insert into orcamentos (
    cliente_id, cliente_nome, status, data,
    volume_m3, distancia_km, custo_base, margem_percentual, fator,
    valor_final, observacoes, criado_por
  )
  values (
    v_cliente_id,
    (select nome from clientes where id = v_cliente_id),
    'rascunho',
    current_date,
    coalesce((p_orcamento ->> 'volume_m3')::numeric, 0),
    coalesce((p_orcamento ->> 'distancia_km')::numeric, 0),
    coalesce((p_orcamento ->> 'custo_base')::numeric, 0),
    coalesce((p_orcamento ->> 'margem_percentual')::numeric, 0),
    nullif(p_orcamento ->> 'fator', '')::numeric,
    coalesce((p_orcamento ->> 'valor_final')::numeric, 0),
    coalesce(p_orcamento ->> 'observacoes', ''),
    auth.uid()
  )
  returning id into v_id;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_orcamento -> 'adicionais', '[]'::jsonb))
  loop
    insert into orcamento_adicionais (orcamento_id, adicional_id, quantidade, nome)
    select
      v_id,
      a.id,
      coalesce((v_item ->> 'quantidade')::numeric, 1),
      a.nome
    from adicionais a
    where a.id = (v_item ->> 'adicional_id')::uuid
    on conflict (orcamento_id, adicional_id) do nothing;
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.criar_orcamento(jsonb) from public, anon;
grant execute on function public.criar_orcamento(jsonb) to authenticated;

-- 4. A revisão.
--
-- Devolve jsonb, e não o uuid: a tela precisa do valor ANTERIOR para
-- escrever a linha do histórico do cliente ("de R$ 8.950 para R$ 9.400").
-- Buscar isso numa segunda consulta abriria a janela de o valor mudar no
-- meio, e deixaria o histórico mentir.
--
-- Aceita revisar a partir de QUALQUER versão, não só da vigente: é assim
-- que "voltar para a versão 2" funciona sem apagar a 3 — nasce uma v4 com
-- o conteúdo da 2.
create or replace function public.revisar_orcamento(p_orcamento_id uuid, p_entrada jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_base orcamentos;
  v_novo_id uuid;
  v_versao integer;
  v_item jsonb;
begin
  if not pode_editar('orcamentos') then
    raise exception 'Seu nível não permite alterar orçamentos.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_base from orcamentos where id = p_orcamento_id;
  if v_base.id is null then
    raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
  from orcamentos where raiz_id = v_base.raiz_id;

  -- Baixa o vigente ANTES de subir o novo: o índice parcial só admite um.
  update orcamentos set vigente = false
  where raiz_id = v_base.raiz_id and vigente;

  insert into orcamentos (
    cliente_id, cliente_nome, status, data,
    volume_m3, distancia_km, custo_base, margem_percentual, fator,
    valor_final, observacoes, criado_por,
    raiz_id, versao, vigente
  )
  values (
    v_base.cliente_id,
    v_base.cliente_nome,
    v_base.status,
    current_date,
    coalesce((p_entrada ->> 'volume_m3')::numeric, v_base.volume_m3),
    coalesce((p_entrada ->> 'distancia_km')::numeric, v_base.distancia_km),
    coalesce((p_entrada ->> 'custo_base')::numeric, v_base.custo_base),
    coalesce((p_entrada ->> 'margem_percentual')::numeric, v_base.margem_percentual),
    coalesce(nullif(p_entrada ->> 'fator', '')::numeric, v_base.fator),
    coalesce((p_entrada ->> 'valor_final')::numeric, v_base.valor_final),
    coalesce(p_entrada ->> 'observacoes', v_base.observacoes),
    auth.uid(),
    v_base.raiz_id,
    v_versao,
    true
  )
  returning id into v_novo_id;

  -- Os adicionais da versão nova vêm da ENTRADA, não copiados da antiga:
  -- tirar um adicional é uma revisão legítima, e copiar impediria isso.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_entrada -> 'adicionais', '[]'::jsonb))
  loop
    insert into orcamento_adicionais (orcamento_id, adicional_id, quantidade, nome)
    select
      v_novo_id,
      a.id,
      coalesce((v_item ->> 'quantidade')::numeric, 1),
      a.nome
    from adicionais a
    where a.id = (v_item ->> 'adicional_id')::uuid
    on conflict (orcamento_id, adicional_id) do nothing;
  end loop;

  return jsonb_build_object(
    'id', v_novo_id,
    'versao', v_versao,
    'valor_anterior', v_base.valor_final,
    'valor_novo', (select valor_final from orcamentos where id = v_novo_id),
    'cliente_id', v_base.cliente_id
  );
end;
$$;

revoke execute on function public.revisar_orcamento(uuid, jsonb) from public, anon;
grant execute on function public.revisar_orcamento(uuid, jsonb) to authenticated;
