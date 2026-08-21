# Supabase — Fase B

Projeto: `lmiddrwpbgczosnrmjas` · região `sa-east-1` (São Paulo) · Postgres 17

## Estado

O schema está **aplicado no projeto remoto**. As migrations abaixo já rodaram:

| Versão | Nome | O que faz |
|---|---|---|
| 20260817200038 | `01_tipos_perfis_e_permissoes` | Enums do domínio, tabela `perfis`, a matriz de permissões como tabela e as funções `pode_ver` / `pode_editar` / `pode_fazer` |
| 20260817200134 | `02_tabelas_de_dominio` | 18 tabelas de negócio, índices e constraints |
| 20260817200316 | `03_rls_por_modulo` | Row Level Security ligando cada tabela ao seu módulo |
| 20260817200409 | `04_views_e_funcoes_de_recorte` | `orcamentos_visao`, `calcular_preco()` e `relatorio_operacoes()` |
| 20260817200435 | `05_seed_parametros_precificacao` | Faixas de volume, adicionais e parâmetros — **valores placeholder** |
| 20260817200510 | `06_revoga_execucao_anonima` | Tira as funções de permissão do alcance do papel `anon` |
| 07 | `07_provisionamento_de_perfis` | Gatilho em `auth.users` que cria o perfil ao aceitar o convite, e a tabela `niveis_pre_atribuidos` |
| 08 | `08_remove_funcao_orfa` | Remove função criada sem gatilho na 07 |
| 14 | `14_itens_do_cliente` | Coluna `itens` em `clientes` — a relação de bens que sai na Ordem de Serviço |
| 15 | `15_coleta_e_entrega_no_lugar_de_embarque` | Renomeia os valores do enum `tipo_movimento` para `coleta` e `entrega` |
| 16 | `16_criar_rota_completa_fala_coleta_e_entrega` | Acompanha a 15 dentro da função, que inseria os literais antigos |

## Baixar os arquivos de migration para cá

Este diretório guarda a referência; os arquivos `.sql` são obtidos do projeto remoto:

```bash
npx supabase link --project-ref lmiddrwpbgczosnrmjas
```

```bash
npx supabase db pull
```

## Como as permissões funcionam no banco

A matriz de `lib/permissoes.ts` existe **duas vezes**: no TypeScript, que controla
a interface, e na tabela `permissoes_modulo`, que o RLS consulta. Isso é
duplicação consciente — uma policy do Postgres não consegue ler um objeto
TypeScript. O efeito é que a regra vale mesmo se alguém falar direto com a API
REST, ignorando a interface.

**Manter as duas em sincronia é obrigatório.** Ao alterar a matriz, mude nos dois
lugares e rode a verificação de paridade (ver plano da Fase B).

### Os dois cortes por coluna

RLS filtra linhas, não colunas. Os dois requisitos do briefing que são sobre
coluna foram resolvidos assim:

- **"Comercial não vê custo"** — a view `orcamentos_visao` devolve `custo_base` e
  `margem_percentual` como `NULL` para quem não tem a capacidade `ver_custos`.
  O app lê a view, nunca a tabela crua. Para calcular preço sem ver custo, o
  Comercial chama `calcular_preco()`, que roda dentro do banco e devolve apenas
  o valor final.
- **"Operacional não vê faturamento"** — `relatorio_operacoes()` devolve a coluna
  de faturamento como `NULL` para quem não tem `ver_faturamento`, e a de custo
  como `NULL` para quem não tem `ver_custos`. `NULL` e não zero: zero seria uma
  afirmação falsa sobre o dado.

## Avisos do linter que são intencionais

`get_advisors` aponta 6 funções `SECURITY DEFINER` executáveis por
`authenticated`. É o desenho, não descuido: são justamente as funções que
precisam ler dado que o usuário não alcança diretamente, e cada uma checa a
permissão internamente antes de devolver qualquer coisa.

## Como convidar um usuário

1. Acrescente o e-mail em `niveis_pre_atribuidos` com o nível desejado — **antes** do convite
2. No painel do Supabase: **Authentication → Users → Invite user**
3. A pessoa define a própria senha pelo link do e-mail
4. Ao aceitar, o gatilho cria a linha em `perfis` já com o nível certo

Sem correspondência em `niveis_pre_atribuidos`, o usuário nasce como
`comercial` — o menor escopo. Errar para menos é seguro; errar para mais
entrega a plataforma a quem não devia.

`admin@julianoltransportes.com.br` já está pré-atribuído como `admin`.

## Storage de anexos

`migrations/13_storage_anexos.sql` cria o bucket privado `anexos` e as policies
que espelham a matriz: quem edita o módulo envia arquivo, quem vê o módulo
baixa, e só o admin apaga. Aplicada em 18/08/2026.

O bucket é **privado**: não há URL pública. Abrir um anexo gera uma URL assinada
que expira em 10 minutos — tempo de clicar e abrir, não de compartilhar.

Os caminhos seguem `<modulo>/<registro_id>/<arquivo>`, e é a primeira pasta que
a função `modulo_do_anexo` traduz em módulo para as policies decidirem o acesso.
Um arquivo em `veiculos/` obedece à permissão de `frota`, e assim por diante.

## O que ainda falta

1. Enviar o convite do primeiro admin pelo painel do Supabase
2. Trocar `lib/auth.ts` (mock) por Supabase Auth + `middleware.ts` no servidor
3. Trocar `lerMock()` por consultas reais em `lib/api/index.ts`
4. Implementar a escrita nos módulos (hoje as telas só alteram estado local)
5. Supabase Storage para os anexos
6. Proteger `app/api/[entidade]/route.ts`, hoje sem autenticação
7. Revisar os valores de precificação semeados — são placeholder
