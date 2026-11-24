-- O LADO DA EQUIPE do inventário por link.
--
-- Os testes da 53 cobriram a porta pública — abrir, salvar, finalizar.
-- Faltava justamente este caminho, e era onde estava o defeito: sob
-- SECURITY INVOKER, `inventario_liberar` não alcançava
-- `inventario_novo_token()` e nenhum atendente conseguia gerar link.
--
-- A regra que isso ensina, e que vale para todo teste deste projeto:
-- CHAMAR COM O PAPEL DE VERDADE. Rodar como `postgres` — que é como o
-- MCP se conecta — atravessa qualquer revoke e faz o teste passar sem
-- provar nada.
--
-- Como rodar: cole inteiro no SQL Editor. Termina em `rollback`, então
-- não deixa linha nenhuma para trás. Qualquer caso que falhe levanta
-- exceção com o motivo.

begin;

insert into clientes (id, nome, status)
values ('11111111-1111-1111-1111-111111111111', 'ZZ TESTE LIBERAR INVENTARIO', 'Novo');

do $teste$
declare
  -- Um perfil ativo com pode_editar('clientes'). Trocar pelo id de
  -- qualquer atendente ativo se este sair da equipe.
  v_atendente text := '46aa96e9-60d3-4d92-a352-6aebc5d30143';
  v_cliente uuid := '11111111-1111-1111-1111-111111111111';
  v1 jsonb;
  v2 jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_atendente), true);

  if not pode_editar('clientes') then
    raise exception 'FIXTURE RUIM: o perfil % não edita clientes; troque o id', v_atendente;
  end if;

  -- ===== 1. O atendente gera o link =====
  v1 := inventario_liberar(v_cliente, 7);

  if (v1 ->> 'novo') <> 'true' then
    raise exception '1 FALHOU: devia nascer novo, veio %', v1 ->> 'novo';
  end if;
  if length(v1 ->> 'token') <> 64 then
    raise exception '1 FALHOU: token com % caracteres, esperado 64', length(v1 ->> 'token');
  end if;
  raise notice '1 OK: token de 64 caracteres gerado por quem está logado';

  -- ===== 2. Liberar de novo mantém o token e estende o prazo =====
  v2 := inventario_liberar(v_cliente, 30);

  if (v2 ->> 'novo') <> 'false' then
    raise exception '2 FALHOU: devia reaproveitar, veio novo=%', v2 ->> 'novo';
  end if;
  if (v2 ->> 'token') <> (v1 ->> 'token') then
    raise exception '2 FALHOU: o token MUDOU — o link no WhatsApp do cliente morreria';
  end if;
  if (v2 ->> 'expira_em')::timestamptz <= (v1 ->> 'expira_em')::timestamptz then
    raise exception '2 FALHOU: o prazo não foi estendido';
  end if;
  raise notice '2 OK: mesmo token, prazo maior';

  -- ===== 3. Quem não edita clientes é recusado =====
  -- Sub inexistente: nivel_atual() devolve nulo e pode_editar() é falso.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

  begin
    perform inventario_liberar(v_cliente, 7);
    raise exception '3 FALHOU: sem perfil conseguiu liberar o inventário';
  exception
    when insufficient_privilege then
      raise notice '3 OK: recusado por falta de nível';
  end;

  perform set_config('role', 'postgres', true);
  raise notice 'TODOS OS CASOS PASSARAM';
end;
$teste$;

rollback;
