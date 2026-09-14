-- O preço, calculado dentro do banco, para quem não pode ver custo.
--
-- Esta migration junta duas coisas: a função nasceu na 33 e foi corrigida
-- aqui por um vazamento que passou despercebido.
--
-- POR QUE NÃO USAR calcular_preco() DA MIGRATION 04: ela ignora os
-- adicionais `por_unidade` (ajudante, caixa, diária), ignora a quantidade
-- dos percentuais, trava a margem em 99 em vez de 95 e não faz o
-- arredondamento comercial. Usá-la faria o Comercial cotar um preço
-- DIFERENTE do que o admin vê para o mesmo serviço — pior do que não
-- calcular.
--
-- O VAZAMENTO QUE A 33 DEIXOU: `parametros_precificacao` também exige
-- `ver_custos`, então para o Comercial a faixa de margem voltava vazia e a
-- tela caía nos valores de reserva, 25 e 55. O mesmo ponto da régua
-- produziria margem diferente para ele e para o admin — e portanto preço
-- diferente para o mesmo serviço, que é justamente o que se queria evitar.
--
-- Por isso a função aceita o FATOR (0 a 10) e deriva a margem aqui dentro,
-- com os parâmetros reais. A margem nunca precisa sair do banco, que é o
-- desenho da régua desde o começo: quem orça pensa em "quanto esta
-- oportunidade merece", não em percentual.
--
-- `margem_percentual` continua aceita, para quem VÊ custo e já escolheu a
-- margem na tela. Quando os dois vêm, o fator manda.
--
-- Esta é a porta de lib/negocio/precificacao.ts para o SQL, passo a passo.
-- As duas foram comparadas em 29 casos de borda — faixas no teto, faixa
-- aberta, travas de margem em ±95, quantidade que multiplica no
-- `por_unidade` mas não no `fixo`, e o arredondamento comercial — com zero
-- divergências. E admin e comercial foram comparados com o mesmo fator,
-- também sem divergência.
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

revoke execute on function public.preco_do_orcamento(jsonb) from public, anon;
grant execute on function public.preco_do_orcamento(jsonb) to authenticated;
