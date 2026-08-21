-- As quatro colunas que usavam o enum passam a text com FK para niveis.
--
-- pode_ver/pode_editar/pode_fazer NÃO são tocadas: dezessete policies
-- dependem delas, e a assinatura não muda. O corpo compara
-- `nivel = nivel_atual()`, que continua válido quando os dois lados viram
-- text — corpo de função SQL é resolvido na execução, não na criação.
--
-- Só nivel_atual() cai e volta, porque o TIPO DE RETORNO dela muda.

-- O default de perfis.nivel é 'comercial'::nivel_usuario e segura o tipo.
-- Sai antes da conversão e volta depois, já como texto. Ele importa: é o
-- menor escopo, o que a migration 07 escolheu para quem chega sem
-- pré-atribuição. Errar para menos é seguro.
alter table perfis alter column nivel drop default;

alter table perfis                alter column nivel type text using nivel::text;
alter table permissoes_modulo     alter column nivel type text using nivel::text;
alter table permissoes_capacidade alter column nivel type text using nivel::text;
alter table niveis_pre_atribuidos alter column nivel type text using nivel::text;

alter table perfis alter column nivel set default 'comercial';

drop function if exists nivel_atual();
drop type nivel_usuario;

create function public.nivel_atual()
returns text
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select nivel from perfis where id = auth.uid() and ativo $$;

-- A migration 06 tirou as funções de permissão do alcance do papel anon.
-- Recriar devolve o execute padrão, então revoga de novo.
revoke execute on function public.nivel_atual() from anon;

-- A FK é o que garante que ninguém grave um nível inexistente.
--
-- RESTRICT nas tabelas de pessoa: excluir um nível que alguém usa
-- deixaria a pessoa sem regra nenhuma, e o RLS negaria tudo em silêncio.
-- CASCADE nas de permissão: aquelas linhas só existem para o nível.
alter table perfis
  add constraint perfis_nivel_fk foreign key (nivel) references niveis(id) on delete restrict;
alter table niveis_pre_atribuidos
  add constraint niveis_pre_nivel_fk foreign key (nivel) references niveis(id) on delete restrict;
alter table permissoes_modulo
  add constraint permissoes_modulo_nivel_fk foreign key (nivel) references niveis(id) on delete cascade;
alter table permissoes_capacidade
  add constraint permissoes_capacidade_nivel_fk foreign key (nivel) references niveis(id) on delete cascade;
