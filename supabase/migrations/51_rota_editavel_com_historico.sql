-- Rota passa a ser editável, inclusive em andamento.
--
-- Até aqui a API tinha criar, excluir e atualizarStatus — não tinha
-- atualizar. Errar uma cidade numa rota de cinco paradas obrigava a apagar
-- e remontar tudo, perdendo o vínculo com lançamentos e compromissos.
--
-- Rota EM ANDAMENTO edita igual a planejada, decisão do Juliano. Alguns
-- produtos do ramo travam rota em execução; os que não travam (Verizon
-- Connect, Yeti) permitem acrescentar e reordenar paradas com a rota
-- rodando, e é o que a operação dele precisa — mudança de verdade acontece
-- com o caminhão na rua.
--
-- Sem pedir MOTIVO, também decisão dele. O que fica registrado é o quê,
-- quem e quando.

-- 1. O histórico da rota.
create table if not exists rota_historico (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references rotas(id) on delete cascade,
  descricao text not null,
  autor uuid references perfis(id) on delete set null,
  autor_nome text not null default '',
  em timestamptz not null default now()
);

create index if not exists rota_historico_rota_idx on rota_historico(rota_id, em desc);

alter table rota_historico enable row level security;

create policy rota_historico_sel on rota_historico
  for select using (pode_ver('rotas'));

/*
 * Escrita liberada para quem edita rotas — e a AUTORIA imposta por gatilho.
 *
 * A trilha do cliente não tem policy de escrita porque só um gatilho
 * SECURITY DEFINER grava nela. Aqui é diferente: quem grava é
 * `atualizar_rota_completa`, que é SECURITY INVOKER de propósito — ela não
 * precisa de poder extra, o RLS de rotas/paradas/mudancas é que decide se a
 * pessoa pode editar. Dar DEFINER a ela só para alcançar o histórico seria
 * ampliar privilégio pelo motivo errado.
 *
 * O preço é que a tabela aceita INSERT de quem edita rotas. O que isso NÃO
 * permite é mentir sobre quem fez: o gatilho abaixo sobrescreve autor,
 * autor_nome e a hora com a verdade da sessão. Forjar a descrição seria
 * possível e vale pouco; forjar a autoria, que é o que uma trilha precisa
 * garantir, não.
 */
create policy rota_historico_ins on rota_historico
  for insert with check (pode_editar('rotas'));

create or replace function public.sela_autoria_do_historico_de_rota()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  new.autor := auth.uid();
  select coalesce(nome, '') into new.autor_nome from perfis where id = auth.uid();
  new.autor_nome := coalesce(new.autor_nome, '');
  new.em := now();
  return new;
end;
$$;

revoke execute on function public.sela_autoria_do_historico_de_rota()
  from public, anon, authenticated;

drop trigger if exists rota_historico_sela_autoria on rota_historico;
create trigger rota_historico_sela_autoria
  before insert on rota_historico
  for each row execute function sela_autoria_do_historico_de_rota();

-- 2. Gatilho que registra o que a própria linha da rota mostra.
--
-- Campo por campo, e só os que a operação olha. Status ganha frase própria
-- porque é o que mais importa: "a rota saiu", "a rota voltou".
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

revoke execute on function public.registra_mudanca_na_rota()
  from public, anon, authenticated;

drop trigger if exists rotas_registra_mudanca on rotas;
create trigger rotas_registra_mudanca
  after update on rotas
  for each row execute function registra_mudanca_na_rota();

-- 3. O preenchimento dos filhos, extraído para ser usado pelas DUAS
--    funções — criar e atualizar.
--
-- Duas cópias da mesma montagem divergiriam, e já vi isso acontecer neste
-- projeto: a lista de campos escrita à mão em `clientes.atualizar` ficou
-- fora de sincronia com a de criar e engoliu três campos por meses.
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

-- 4. Criar passa a usar o preenchimento compartilhado.
create or replace function public.criar_rota_completa(p_rota jsonb)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rota_id uuid;
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

  perform preenche_filhos_da_rota(v_rota_id, p_rota);
  return v_rota_id;
end;
$$;

-- 5. A edição.
--
-- SUBSTITUI os filhos em vez de tentar casar um a um. Diferenciar paradas e
-- movimentos exigiria identidade estável que a tela não tem — ela trabalha
-- com ids temporários — e um diff errado embaralharia a sequência da rota.
--
-- É seguro porque NADA fora da rota aponta para `paradas` ou `mudancas`:
-- conferido nas chaves estrangeiras. Os vínculos externos (`lancamentos`,
-- `compromissos`) apontam para a ROTA, e a linha da rota sobrevive — é por
-- isso que editar preserva o que apagar e recriar destruiria.
--
-- SECURITY INVOKER de propósito: o RLS de `rotas`, `paradas` e `mudancas` é
-- quem decide se esta pessoa pode escrever. A função não precisa de poder
-- extra, e dar poder que não é preciso é dívida.
create or replace function public.atualizar_rota_completa(p_rota_id uuid, p_rota jsonb)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_paradas_antes int;
  v_cargas_antes int;
  v_paradas_depois int;
  v_cargas_depois int;
  v_nome text := '';
  v_resumo text[] := '{}';
begin
  if not exists (select 1 from rotas where id = p_rota_id) then
    raise exception 'Rota não encontrada.' using errcode = 'no_data_found';
  end if;

  select count(*) into v_paradas_antes from paradas where rota_id = p_rota_id;
  select count(*) into v_cargas_antes from mudancas where rota_id = p_rota_id;

  -- A linha da rota. O gatilho registra campo por campo o que mudou aqui.
  update rotas set
    nome = coalesce(p_rota ->> 'nome', nome),
    status = coalesce((p_rota ->> 'status')::status_rota, status),
    veiculo_id = nullif(p_rota ->> 'veiculo_id', '')::uuid,
    motorista_id = nullif(p_rota ->> 'motorista_id', '')::uuid,
    origem = coalesce(p_rota ->> 'origem', origem),
    destino = coalesce(p_rota ->> 'destino', destino),
    data_saida = nullif(p_rota ->> 'data_saida', '')::date,
    data_prevista_retorno = nullif(p_rota ->> 'data_prevista_retorno', '')::date
  where id = p_rota_id;

  -- Fora os filhos; parada_movimentos vai em cascata nos dois.
  delete from paradas where rota_id = p_rota_id;
  delete from mudancas where rota_id = p_rota_id;

  perform preenche_filhos_da_rota(p_rota_id, p_rota);

  select count(*) into v_paradas_depois from paradas where rota_id = p_rota_id;
  select count(*) into v_cargas_depois from mudancas where rota_id = p_rota_id;

  if v_cargas_antes <> v_cargas_depois then
    v_resumo := v_resumo || ('cargas: ' || v_cargas_antes || ' → ' || v_cargas_depois);
  end if;
  if v_paradas_antes <> v_paradas_depois then
    v_resumo := v_resumo || ('cidades: ' || v_paradas_antes || ' → ' || v_paradas_depois);
  end if;
  if array_length(v_resumo, 1) is null then
    -- Mesma contagem não significa mesmo conteúdo: cidade trocada por
    -- outra, endereço corrigido, ordem invertida. Registra o gesto.
    v_resumo := v_resumo || 'cidades e cargas regravadas';
  end if;

  select nome into v_nome from perfis where id = auth.uid();

  insert into rota_historico (rota_id, descricao, autor, autor_nome)
  values (p_rota_id, 'Rota editada — ' || array_to_string(v_resumo, '; '),
          auth.uid(), coalesce(v_nome, ''));
end;
$$;

revoke execute on function public.preenche_filhos_da_rota(uuid, jsonb) from public, anon;
grant execute on function public.preenche_filhos_da_rota(uuid, jsonb) to authenticated;
revoke execute on function public.atualizar_rota_completa(uuid, jsonb) from public, anon;
grant execute on function public.atualizar_rota_completa(uuid, jsonb) to authenticated;
