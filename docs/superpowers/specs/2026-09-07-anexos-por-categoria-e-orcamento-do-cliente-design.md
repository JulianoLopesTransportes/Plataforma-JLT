# Anexos por categoria, e orçamento vinculado ao cliente

**Data:** 07/09/2026 · **Estado:** aprovado pelo Juliano, não implementado

Escrito porque o conector do Supabase caiu no meio da sessão e as duas
mudanças exigem migration. Guarda o desenho para ele sobreviver a uma
sessão nova.

## O achado que dimensiona o item 2

A tela de Orçamentos **não salva nada**. É calculadora pura: não tem
seleção de cliente, e `lib/api/index.ts` expõe `listar`, `obter`,
`aprovar` e `parametros` — **não há `criar`**. A tabela `orcamentos`
existe no banco, com view e RLS, e nunca recebeu uma linha pela
plataforma.

"Vincular valor ao cliente" não é acrescentar um botão: é dar
persistência a uma tela que nunca teve.

## Decisões do Juliano

| Pergunta | Resposta |
|---|---|
| Orçamento sem cliente cadastrado | Calcula e **não salva**; o botão de vincular fica desabilitado explicando por quê |
| Categorias de anexo | Lista fixa, com "Outro" |
| Vincular duas vezes | Acrescenta, não substitui — o histórico do que foi orçado importa |

## 1. Anexos por categoria

Coluna `categoria` nas **três** tabelas de anexo — cliente, veículo e
motorista. Nas três porque `lib/api/anexos.ts` é um módulo só que atende
os três donos; uma tabela diferente das outras obrigaria a um `if` por
dono dentro dele. O seletor aparece só no cliente, que é onde foi pedido.

Sete categorias, gravadas como identificador e exibidas por rótulo:

`contrato` · `orcamento` · `documento_pessoal` · `comprovante_endereco` ·
`inventario` · `foto` · `outro`

Default `outro`: nenhum anexo fica sem lugar, e os que já existem entram
lá sem precisar de decisão.

`PainelAnexos` ganha um seletor ao lado do botão de enviar, e a lista
deixa de ser corrida — passa a ser agrupada por categoria, com contagem.
Categoria sem arquivo não aparece.

**A categoria fica só na tabela, não no caminho do Storage.** O caminho
continua `clientes/<id>/<arquivo>`. Duas razões: recategorizar vira um
`UPDATE` em vez de copiar-e-apagar o arquivo; e o caminho é o que as
policies do Storage inspecionam para decidir permissão (`modulo_do_anexo`
lê a primeira pasta), então quanto menos ele mudar, melhor.

## 2. Orçamento vinculado ao cliente

### Na tela de Orçamentos

- Seletor de cliente no topo, exibindo `2026-0001 — Nome`
- Escolher alguém preenche o volume do cadastro **se o campo estiver vazio**
- Depois de calcular, botão **"Vincular valor ao cliente"**, habilitado
  só com cliente escolhido; sem cliente fica apagado dizendo o motivo, e
  a calculadora segue funcionando como hoje

Vincular grava tudo que produziu o preço: volume, distância, adicionais
escolhidos, custo base, margem e valor final, com status `rascunho`.

Como são duas tabelas encadeadas (`orcamentos` e `orcamento_adicionais`),
a gravação passa por uma função no Postgres — mesmo motivo de
`criar_rota_completa`: sem transação, uma falha no meio deixaria o
orçamento sem a composição que o justifica.

### Na tela do cliente

Aba nova **Orçamentos**, ao lado de Dados, Anexos e Histórico. Lista os
orçamentos daquele cliente, do mais recente para o mais antigo, cada um
com data, volume, distância, adicionais e valor final.

### Os dois recortes de permissão

1. **Custo e margem só para quem tem `ver_custos`.** A leitura passa pela
   view `orcamentos_visao`, **nunca** pela tabela — é ela que devolve
   `custo_base` e `margem_percentual` como `NULL`. Ler a tabela direto
   faria da tela do cliente uma porta lateral para o custo interno, que o
   módulo de Orçamentos fecha.
2. **A aba some para quem não vê Orçamentos.** O Operacional tem leitura
   em Clientes mas `none` em Orçamentos; a aba fica condicionada a
   `podeVer(nivel, 'orcamentos')`.

## Arquivos

`lib/tipos.ts`, `lib/api/anexos.ts`, `lib/api/index.ts`,
`lib/api/conversao.ts`, `components/modulos/PainelAnexos.tsx`,
`app/(plataforma)/orcamentos/page.tsx`, `app/(plataforma)/clientes/page.tsx`,
os CSS correspondentes, os mocks, e duas migrations:

- **28** — coluna `categoria` nas três tabelas de anexo
- **29** — função `criar_orcamento()`

## Como verificar

1. Build e typecheck
2. Aplicar as migrations e criar um orçamento de fumaça por
   `criar_orcamento`, conferindo que os adicionais foram junto, e apagar
3. **O teste que mais importa:** conferir pela view que `custo_base` e
   `margem_percentual` voltam nulos para quem não tem `ver_custos`. É
   regra de confidencialidade, não de conforto

## Pendência antes de escrever a migration 29

As colunas exatas de `orcamentos` e `orcamento_adicionais` foram assumidas
de memória do schema. **Conferir no banco antes de escrever a função.**
