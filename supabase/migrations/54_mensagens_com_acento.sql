-- As mensagens voltam a ter acento.
--
-- Isto não corrige um erro de desenho: corrige um erro de TRANSPORTE. As
-- migrations 52 e 53 estão corretas no repositório — "Link inválido.",
-- "Peça à Juliano Lopes Transportes", "Seu nível não permite". O que o
-- banco guardou foi uma versão sem acento nenhum e sem os comentários,
-- porque fui eu que redigitei o SQL ao aplicar em vez de mandar o arquivo.
--
-- Quem lê a mensagem errada é o CLIENTE, na página pública do inventário:
-- "Peca a Juliano Lopes Transportes para liberar de novo." A empresa não
-- escreve assim.
--
-- O conteúdo abaixo foi COPIADO dos arquivos 52 e 53 por script, linha a
-- linha. Nenhuma linha foi redigitada — é essa a única garantia de que
-- desta vez o que está no banco é o que está no repositório.

-- ==== de 52_corrige_a_51_que_duplicava_a_rota.sql, linhas 32-93 ====

create or replace function public.atualizar_rota_completa(p_rota_id uuid, p_rota jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_paradas_antes int;
  v_cargas_antes int;
  v_paradas_depois int;
  v_cargas_depois int;
  v_resumo text[] := '{}';
begin
  -- A checagem que substitui o RLS que o DEFINER passa por cima.
  if not pode_editar('rotas') then
    raise exception 'Seu nível não permite alterar rotas.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from rotas where id = p_rota_id) then
    raise exception 'Rota não encontrada.' using errcode = 'no_data_found';
  end if;

  select count(*) into v_paradas_antes from paradas where rota_id = p_rota_id;
  select count(*) into v_cargas_antes from mudancas where rota_id = p_rota_id;

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

  delete from paradas where rota_id = p_rota_id;
  delete from mudancas where rota_id = p_rota_id;

  perform preenche_filhos_da_rota(p_rota_id, p_rota);

  select count(*) into v_paradas_depois from paradas where rota_id = p_rota_id;
  select count(*) into v_cargas_depois from mudancas where rota_id = p_rota_id;

  if v_cargas_antes <> v_cargas_depois then
    v_resumo := v_resumo || ('cargas: ' || v_cargas_antes || ' -> ' || v_cargas_depois);
  end if;
  if v_paradas_antes <> v_paradas_depois then
    v_resumo := v_resumo || ('cidades: ' || v_paradas_antes || ' -> ' || v_paradas_depois);
  end if;
  if array_length(v_resumo, 1) is null then
    v_resumo := v_resumo || 'cidades e cargas regravadas';
  end if;

  insert into rota_historico (rota_id, descricao)
  values (p_rota_id, 'Rota editada - ' || array_to_string(v_resumo, '; '));
end;
$$;

revoke execute on function public.atualizar_rota_completa(uuid, jsonb) from public, anon;
grant execute on function public.atualizar_rota_completa(uuid, jsonb) to authenticated;

-- ==== de 53_inventario_preenchido_pelo_cliente.sql, linhas 123-165 ====

create or replace function public.inventario_liberar(
  p_cliente_id uuid,
  p_dias integer default 7
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_token text;
  v_expira timestamptz := now() + make_interval(days => greatest(p_dias, 1));
  v_novo boolean;
begin
  if not exists (select 1 from clientes where id = p_cliente_id) then
    raise exception 'Cliente não encontrado.' using errcode = 'foreign_key_violation';
  end if;

  select token into v_token from inventario_links where cliente_id = p_cliente_id;
  v_novo := v_token is null;

  if v_novo then
    v_token := inventario_novo_token();
    insert into inventario_links (cliente_id, token, expira_em, criado_por)
    values (p_cliente_id, v_token, v_expira, auth.uid());
  else
    update inventario_links
       set expira_em = v_expira, atualizado_em = now()
     where cliente_id = p_cliente_id;
  end if;

  -- Zero linhas escritas significa RLS negando. Melhor estourar aqui que
  -- devolver um token que não existe no banco.
  if not exists (select 1 from inventario_links where cliente_id = p_cliente_id) then
    raise exception 'Seu nível não permite liberar o inventário deste cliente.'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object('token', v_token, 'expira_em', v_expira, 'novo', v_novo);
end;
$$;

revoke execute on function public.inventario_liberar(uuid, integer) from public, anon;
grant execute on function public.inventario_liberar(uuid, integer) to authenticated;

-- ==== de 53_inventario_preenchido_pelo_cliente.sql, linhas 175-208 ====

create or replace function public.inventario_cliente_do_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_link inventario_links;
begin
  select * into v_link from inventario_links where token = p_token;

  if v_link.cliente_id is null then
    raise exception 'Link inválido.' using errcode = 'no_data_found';
  end if;

  /*
   * Mensagem diferente para expirado, e isso é escolha.
   *
   * Distinguir "não existe" de "expirou" conta a um adivinhador que o
   * token existe. Com 256 bits de token, adivinhar não é um caminho — e o
   * cliente de verdade PRECISA saber a diferença: expirado ele resolve
   * pedindo liberação, inválido significa que copiou o link errado.
   */
  if v_link.expira_em < now() then
    raise exception 'Este link expirou. Peça à Juliano Lopes Transportes para liberar de novo.'
      using errcode = 'no_data_found';
  end if;

  return v_link.cliente_id;
end;
$$;

revoke execute on function public.inventario_cliente_do_token(text)
  from public, anon, authenticated;
