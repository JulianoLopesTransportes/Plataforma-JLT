-- Cria um nível já utilizável, copiando outro.
--
-- Sem isto, um nível novo nasceria sem NENHUMA linha em
-- permissoes_modulo nem em permissoes_capacidade — o RLS negaria tudo, a
-- sidebar viria vazia, e não há tela para editar capacidade (decisão do
-- Juliano). O nível seria inútil e o motivo, invisível.
--
-- Copiar de um modelo resolve os dois lados de uma vez: a matriz de
-- módulos ele ajusta na tela; as capacidades ele herda e não precisa
-- mexer. É uma transação porque nível sem matriz é pior que nível nenhum.
create or replace function public.criar_nivel(
  p_id text,
  p_rotulo text,
  p_modelo text
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id text;
begin
  if not pode_editar('usuarios') then
    raise exception 'Seu nível não permite criar níveis de acesso.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Normaliza para caber em perfis.nivel e virar chave estável: minúsculo,
  -- sem acento, com underscore no lugar de espaço. O rótulo guarda a
  -- forma bonita; o id é o que o RLS compara.
  v_id := regexp_replace(
            lower(translate(trim(p_id),
              'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
              'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
            '[^a-z0-9]+', '_', 'g');
  v_id := trim(both '_' from v_id);

  if v_id = '' then
    raise exception 'O identificador do nível não pode ser vazio.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from niveis where id = v_id) then
    raise exception 'Já existe um nível com o identificador "%".', v_id
      using errcode = 'unique_violation';
  end if;

  if not exists (select 1 from niveis where id = p_modelo) then
    raise exception 'O nível-modelo "%" não existe.', p_modelo
      using errcode = 'foreign_key_violation';
  end if;

  insert into niveis (id, rotulo, ordem, sistema)
  values (v_id, trim(p_rotulo), (select coalesce(max(ordem), 0) + 1 from niveis), false);

  -- A matriz de módulos vem do modelo e é ajustável na tela.
  insert into permissoes_modulo (modulo, nivel, acesso)
  select modulo, v_id, acesso from permissoes_modulo where nivel = p_modelo;

  -- As capacidades vêm do modelo e NÃO têm tela: é aqui que elas são
  -- decididas, na única vez em que o assunto aparece para o usuário.
  insert into permissoes_capacidade (capacidade, nivel)
  select capacidade, v_id from permissoes_capacidade where nivel = p_modelo;

  return v_id;
end;
$$;

revoke execute on function public.criar_nivel(text, text, text) from anon;
