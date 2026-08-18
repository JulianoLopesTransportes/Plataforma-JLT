-- ============================================================================
-- 13: Supabase Storage para os anexos
--
-- NÃO APLICADA AINDA. Rode no SQL Editor do painel do Supabase:
--   https://supabase.com/dashboard/project/lmiddrwpbgczosnrmjas/sql
--
-- Cria um bucket privado e as policies que espelham a matriz de permissões:
-- quem pode editar o módulo pode enviar e apagar arquivos dele; quem pode
-- ver, pode baixar. Como o bucket é privado, o acesso se dá por URL
-- assinada e temporária, nunca por link público.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Bucket privado
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos',
  'anexos',
  false,                     -- privado: sem URL pública, só assinada
  10485760,                  -- 10 MB por arquivo
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Organização dos caminhos
--
--   clientes/<cliente_id>/<arquivo>
--   veiculos/<veiculo_id>/<arquivo>
--   motoristas/<motorista_id>/<arquivo>
--
-- A primeira pasta diz a que módulo o arquivo pertence, e é o que as
-- policies inspecionam para decidir o acesso.
-- ---------------------------------------------------------------------------

/** Traduz a primeira pasta do caminho no módulo correspondente. */
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

revoke all on function modulo_do_anexo(text) from public, anon;
grant execute on function modulo_do_anexo(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies — a mesma matriz que governa as tabelas
-- ---------------------------------------------------------------------------
drop policy if exists anexos_leitura on storage.objects;
drop policy if exists anexos_envio on storage.objects;
drop policy if exists anexos_atualizacao on storage.objects;
drop policy if exists anexos_exclusao on storage.objects;

-- Baixar exige poder VER o módulo dono do arquivo.
create policy anexos_leitura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos'
    and modulo_do_anexo(name) is not null
    and pode_ver(modulo_do_anexo(name))
  );

-- Enviar exige poder EDITAR o módulo.
create policy anexos_envio on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and modulo_do_anexo(name) is not null
    and pode_editar(modulo_do_anexo(name))
  );

create policy anexos_atualizacao on storage.objects
  for update to authenticated
  using (
    bucket_id = 'anexos'
    and modulo_do_anexo(name) is not null
    and pode_editar(modulo_do_anexo(name))
  );

-- Apagar arquivo é destrutivo: exige também a capacidade 'excluir',
-- que só o admin tem — mesma regra das tabelas.
create policy anexos_exclusao on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and modulo_do_anexo(name) is not null
    and pode_editar(modulo_do_anexo(name))
    and pode_fazer('excluir')
  );
