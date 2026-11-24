-- O resto da divergência entre o repositório e o banco.
--
-- A 54 corrigiu as três funções cujas MENSAGENS DE ERRO tinham perdido o
-- acento. Conferindo o restante com md5 — corpo gravado em `pg_proc`
-- contra corpo do arquivo —, nove outras funções também divergiam, pelo
-- mesmo motivo: fui eu que redigitei o SQL ao aplicar, e no caminho caíram
-- acentos e comentários.
--
-- Uma delas escreve texto que a equipe LÊ:
-- `registra_mudanca_na_rota` grava no histórico da rota "veículo
-- alterado", "saída: … → …". O banco guardava a versão sem acento e com
-- "->" no lugar da seta.
--
-- As outras oito divergiam só em comentário, o que não muda
-- comportamento, mas deixa o banco contando uma história diferente da do
-- repositório — e foi exatamente essa diferença que escondeu a primeira.
--
-- Cada bloco abaixo é o texto INTEIRO da função, copiado do arquivo por
-- script. `create or replace` preserva os grants, então não há revoke nem
-- grant aqui: as permissões continuam as que já estavam valendo.
--
-- Conferência: depois de aplicar, md5(prosrc) de toda função de `public`
-- precisa bater com o md5 do corpo no arquivo correspondente.

-- ==== modulo_do_anexo — de 13_storage_anexos.sql ====

create or replace function modulo_do_anexo(p_caminho text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case split_part(p_caminho, '/', 1)
    when 'clientes' then 'clientes'
    when 'veiculos' then 'frota'
    when 'motoristas' then 'frota'
    else null
  end
$$;

-- ==== inventario_salvar — de 53_inventario_preenchido_pelo_cliente.sql ====

create or replace function public.inventario_salvar(p_token text, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cliente uuid := inventario_cliente_do_token(p_token);
  v_item jsonb;
  v_gravados integer := 0;
begin
  delete from inventario_itens where cliente_id = v_cliente;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    -- Item sem nome é linha que o cliente começou e não preencheu: ignora
    -- em silêncio, em vez de gravar uma linha vazia no documento dele.
    if coalesce(trim(v_item ->> 'item'), '') = '' then
      continue;
    end if;

    insert into inventario_itens (cliente_id, ambiente, item, quantidade, valor_unitario)
    values (
      v_cliente,
      coalesce(trim(v_item ->> 'ambiente'), ''),
      trim(v_item ->> 'item'),
      greatest(coalesce((v_item ->> 'quantidade')::numeric, 1), 0.01),
      greatest(coalesce((v_item ->> 'valor_unitario')::numeric, 0), 0)
    )
    on conflict (cliente_id, ambiente, item) do update
      set quantidade = excluded.quantidade,
          valor_unitario = excluded.valor_unitario;

    v_gravados := v_gravados + 1;
  end loop;

  update inventario_links set atualizado_em = now() where cliente_id = v_cliente;

  return jsonb_build_object('itens', v_gravados);
end;
$$;

-- ==== preco_do_orcamento — de 35_preco_aceita_fator_e_deriva_a_margem.sql ====

create or replace function public.preco_do_orcamento(p_entrada jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_volume numeric := coalesce((p_entrada ->> 'volume_m3')::numeric, 0);
  v_distancia numeric := coalesce((p_entrada ->> 'distancia_km')::numeric, 0);
  v_fator numeric := (p_entrada ->> 'fator')::numeric;
  v_margem numeric;
  v_params record;
  v_base numeric;
  v_custo numeric := 0;
  v_preco numeric;
  v_item jsonb;
  v_ad adicionais;
  v_qtd numeric;
  v_candidato numeric;
  v_base_arred numeric;
begin
  if not pode_ver('orcamentos') then
    raise exception 'Seu nível não permite calcular orçamento.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_volume <= 0 then
    return null;
  end if;

  select * into v_params from parametros_precificacao limit 1;

  -- Fator → margem, igual a margemDoFator() do TypeScript. A escala é
  -- invertida de propósito: fator 0 é preço cheio, fator 10 é o mais
  -- agressivo.
  if v_fator is not null then
    v_fator := greatest(0, least(v_fator, 10));
    v_margem := round(
      (v_params.margem_maxima - ((v_params.margem_maxima - v_params.margem_minima) / 10) * v_fator)
      * 10
    ) / 10;
  else
    v_margem := coalesce((p_entrada ->> 'margem_percentual')::numeric, 0);
  end if;

  -- Faixa: a primeira cujo teto cobre o volume; a última é faixa aberta.
  select valor_base into v_base from faixas_volume
  where ate >= v_volume order by ate limit 1;

  if v_base is null then
    select valor_base into v_base from faixas_volume order by ate desc limit 1;
  end if;

  if v_base is null then
    return null;
  end if;

  v_custo := v_base + v_distancia * coalesce(v_params.custo_por_km, 0);

  for v_item in select * from jsonb_array_elements(coalesce(p_entrada -> 'adicionais', '[]'::jsonb))
  loop
    select * into v_ad from adicionais where id = (v_item ->> 'id')::uuid and ativo;
    continue when not found;

    v_qtd := coalesce(nullif((v_item ->> 'quantidade')::numeric, 0), 1);

    if v_ad.tipo = 'fixo' then
      -- Fixo cobra uma vez, independente da quantidade.
      v_custo := v_custo + v_ad.valor;
    elsif v_ad.tipo = 'por_unidade' then
      v_custo := v_custo + v_ad.valor * v_qtd;
    else
      -- Percentual incide sobre a base da faixa, NÃO sobre o acumulado:
      -- assim a ordem dos adicionais não altera o resultado.
      v_custo := v_custo + (v_base * v_ad.valor * v_qtd) / 100;
    end if;
  end loop;

  -- Margem de lucro, não markup: preço = custo / (1 − margem).
  -- Travada entre −95 e 95; perto de 100 a divisão tende ao infinito.
  v_margem := greatest(-95, least(v_margem, 95));
  v_preco := v_custo / (1 - v_margem / 100);

  -- Arredondamento comercial, igual ao arredondarAtrativo() do TypeScript:
  -- tenta 100, 50 e 10, e só aceita se o desvio couber na tolerância.
  foreach v_base_arred in array array[100, 50, 10]
  loop
    v_candidato := round(v_preco / v_base_arred) * v_base_arred;
    if abs(v_candidato - v_preco) <= greatest(8, v_preco * 0.003) then
      return v_candidato;
    end if;
  end loop;

  return round(v_preco / 10) * 10;
end;
$$;

-- ==== preenche_filhos_da_rota — de 51_rota_editavel_com_historico.sql ====

create or replace function public.preenche_filhos_da_rota(p_rota_id uuid, p_rota jsonb)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_mudanca jsonb;
  v_parada jsonb;
  v_parada_id uuid;
  v_mudanca_id uuid;
  v_movimento jsonb;
  v_temp text;
  v_ordem int := 0;
  -- Ponte entre o id temporário da tela e o id real do banco.
  v_mapa jsonb := '{}'::jsonb;
begin
  for v_mudanca in select * from jsonb_array_elements(coalesce(p_rota -> 'mudancas', '[]'::jsonb))
  loop
    insert into mudancas (rota_id, cliente_id, cliente_nome, telefone, documento,
                          volume_m3, endereco_coleta, endereco_entrega, observacao)
    values (
      p_rota_id,
      nullif(v_mudanca ->> 'cliente_id', '')::uuid,
      v_mudanca ->> 'cliente_nome',
      coalesce(v_mudanca ->> 'telefone', ''),
      coalesce(v_mudanca ->> 'documento', ''),
      coalesce((v_mudanca ->> 'volume_m3')::numeric, 0),
      coalesce(v_mudanca ->> 'endereco_coleta', ''),
      coalesce(v_mudanca ->> 'endereco_entrega', ''),
      coalesce(v_mudanca ->> 'observacao', '')
    )
    returning id into v_mudanca_id;

    v_mapa := v_mapa || jsonb_build_object(v_mudanca ->> 'temp_id', v_mudanca_id::text);
  end loop;

  for v_parada in select * from jsonb_array_elements(coalesce(p_rota -> 'paradas', '[]'::jsonb))
  loop
    insert into paradas (rota_id, tipo, cidade, uf, endereco, data, observacao, ordem)
    values (
      p_rota_id,
      coalesce((v_parada ->> 'tipo')::tipo_parada, 'coleta'),
      v_parada ->> 'cidade',
      coalesce(v_parada ->> 'uf', 'MG'),
      coalesce(v_parada ->> 'endereco', ''),
      (v_parada ->> 'data')::date,
      coalesce(v_parada ->> 'observacao', ''),
      v_ordem
    )
    returning id into v_parada_id;

    v_ordem := v_ordem + 1;

    for v_movimento in
      select * from jsonb_array_elements(coalesce(v_parada -> 'coletam', '[]'::jsonb))
    loop
      v_temp := v_movimento ->> 'temp_id';
      if v_mapa ? v_temp then
        insert into parada_movimentos (parada_id, mudanca_id, tipo, endereco)
        values (v_parada_id, (v_mapa ->> v_temp)::uuid, 'coleta',
                coalesce(v_movimento ->> 'endereco', ''))
        on conflict do nothing;
      end if;
    end loop;

    for v_movimento in
      select * from jsonb_array_elements(coalesce(v_parada -> 'entregam', '[]'::jsonb))
    loop
      v_temp := v_movimento ->> 'temp_id';
      if v_mapa ? v_temp then
        insert into parada_movimentos (parada_id, mudanca_id, tipo, endereco)
        values (v_parada_id, (v_mapa ->> v_temp)::uuid, 'entrega',
                coalesce(v_movimento ->> 'endereco', ''))
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

-- ==== preenche_responsavel_cliente — de 44_so_o_admin_troca_o_responsavel.sql ====

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

-- ==== protege_responsavel_do_cliente — de 44_so_o_admin_troca_o_responsavel.sql ====

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

-- ==== registra_mudanca_na_rota — de 51_rota_editavel_com_historico.sql ====

create or replace function public.registra_mudanca_na_rota()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nome text := '';
  v_partes text[] := '{}';
begin
  if new.status is distinct from old.status then
    v_partes := v_partes || ('status: ' || old.status || ' → ' || new.status);
  end if;
  if new.nome is distinct from old.nome then
    v_partes := v_partes || ('nome: "' || old.nome || '" → "' || new.nome || '"');
  end if;
  if new.veiculo_id is distinct from old.veiculo_id then
    v_partes := v_partes || 'veículo alterado';
  end if;
  if new.motorista_id is distinct from old.motorista_id then
    v_partes := v_partes || 'motorista alterado';
  end if;
  if new.data_saida is distinct from old.data_saida then
    v_partes := v_partes || ('saída: ' || coalesce(old.data_saida::text, 'sem data') ||
                             ' → ' || coalesce(new.data_saida::text, 'sem data'));
  end if;
  if new.data_prevista_retorno is distinct from old.data_prevista_retorno then
    v_partes := v_partes || 'retorno previsto alterado';
  end if;

  -- Nada do que esta trilha acompanha mudou: não suja o histórico.
  if array_length(v_partes, 1) is null then
    return null;
  end if;

  select nome into v_nome from perfis where id = auth.uid();

  insert into rota_historico (rota_id, descricao, autor, autor_nome)
  values (new.id, array_to_string(v_partes, '; '), auth.uid(), coalesce(v_nome, ''));

  return null;
end;
$$;

-- ==== registra_status_do_cliente — de 50_eventos_de_status_do_cliente.sql ====

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

-- ==== revisar_orcamento — de 48_orcamento_revisavel_com_versao.sql ====

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
