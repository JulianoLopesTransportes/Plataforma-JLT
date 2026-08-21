-- Terceira versão da função. Duas mudanças:
--
-- 1. Os movimentos deixam de ser uma lista de ids e passam a ser objetos
--    { temp_id, endereco } — é o endereço daquela coleta ou entrega.
-- 2. A parada grava `ordem`, que a versão anterior ignorava. Com a rota
--    montada como sequência de cidades, a posição precisa ser explícita:
--    duas cidades podem cair na mesma data.
create or replace function public.criar_rota_completa(p_rota jsonb)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rota_id uuid;
  v_mudanca jsonb;
  v_parada jsonb;
  v_parada_id uuid;
  v_mudanca_id uuid;
  v_movimento jsonb;
  v_temp text;
  v_ordem int := 0;
  -- Ponte entre o id temporário que a tela usou e o id real do banco.
  v_mapa jsonb := '{}'::jsonb;
begin
  insert into rotas (nome, status, veiculo_id, motorista_id, origem, destino,
                     data_saida, data_prevista_retorno)
  values (
    p_rota ->> 'nome',
    coalesce((p_rota ->> 'status')::status_rota, 'planejada'),
    nullif(p_rota ->> 'veiculo_id', '')::uuid,
    nullif(p_rota ->> 'motorista_id', '')::uuid,
    coalesce(p_rota ->> 'origem', ''),
    coalesce(p_rota ->> 'destino', ''),
    nullif(p_rota ->> 'data_saida', '')::date,
    nullif(p_rota ->> 'data_prevista_retorno', '')::date
  )
  returning id into v_rota_id;

  -- Cargas. Cada uma guarda seu id temporário no mapa.
  for v_mudanca in select * from jsonb_array_elements(coalesce(p_rota -> 'mudancas', '[]'::jsonb))
  loop
    insert into mudancas (rota_id, cliente_id, cliente_nome, telefone, documento,
                          volume_m3, endereco_coleta, endereco_entrega, observacao)
    values (
      v_rota_id,
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

  -- Cidades e seus movimentos, na ordem em que a tela as montou.
  for v_parada in select * from jsonb_array_elements(coalesce(p_rota -> 'paradas', '[]'::jsonb))
  loop
    insert into paradas (rota_id, tipo, cidade, uf, endereco, data, observacao, ordem)
    values (
      v_rota_id,
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

  return v_rota_id;
end;
$function$;
