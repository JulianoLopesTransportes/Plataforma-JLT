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
| 17 | `17_endereco_por_movimento_e_ordem_das_paradas` | Coluna `endereco` em `parada_movimentos` — dois clientes na mesma cidade, ruas diferentes |
| 18 | `18_criar_rota_completa_com_endereco_e_ordem` | Movimentos viram `{ temp_id, endereco }`, e a parada passa a gravar `ordem` |
| 19 | `19_preenche_ordem_das_paradas_antigas` | Preenche `ordem` das paradas gravadas antes da 17, que estava nula |
| 20 | `20_niveis_viram_tabela` | Tabela `niveis` — níveis deixam de ser enum e viram dado criável |
| 21 | `21_colunas_nivel_viram_texto` | As quatro colunas `nivel` viram text com FK; o enum `nivel_usuario` é descartado |
| 22 | `22_matriz_editavel_com_travas` | Policies de escrita na matriz e as três travas que impedem se trancar do lado de fora |
| 23 | `23_criar_nivel_copiando_de_outro` | `criar_nivel()` — nível novo nasce com a matriz e as capacidades de um modelo |
| 24 | `24_revoga_execucao_anonima_das_funcoes_novas` | Conserta a revogação das 21 e 23, que revogaram de `anon` sem revogar de PUBLIC |

## Baixar os arquivos de migration para cá

Este diretório guarda a referência; os arquivos `.sql` são obtidos do projeto remoto:

```bash
npx supabase link --project-ref lmiddrwpbgczosnrmjas
```

```bash
npx supabase db pull
```

## Como as permissões funcionam no banco

**A tabela `permissoes_modulo` é a fonte.** O RLS a consulta a cada requisição,
e a interface a carrega no boot da sessão — ver `lerPermissoes()` em
`lib/api/admin.ts`. A matriz em `lib/permissoes.ts` continua existindo, mas
como **padrão de fábrica**: vale antes de o banco responder e quando não há
Supabase configurado. Não há mais duas cópias para manter em sincronia.

O admin edita a matriz em Usuários → Matriz de permissões, e a mudança vale
na hora, inclusive para quem já está logado.

### As três travas

Vivem no banco como triggers, não na tela, e valem contra quem chamar a API
REST direto:

1. **`matriz_exige_porta`** — nenhuma alteração pode deixar o sistema sem um
   nível com `crud` em `usuarios`. É o único estado irreversível pela própria
   interface: sem porta, o RLS negaria a escrita que consertaria. É uma
   *constraint trigger* adiada de propósito — a tela grava a matriz inteira
   num upsert só e passa por estados inválidos no meio do caminho.
2. **`matriz_protege_admin`** — o administrador não pode ser rebaixado nem
   removido da matriz.
3. **`niveis_protege_sistema`** — os quatro níveis originais são citados por
   nome no código e não podem ser excluídos.

### Por que níveis viraram tabela

O Postgres **não remove valor de enum**. Com níveis criáveis pela plataforma,
um nível cadastrado por engano ficaria no tipo para sempre — e o tipo era
usado em quatro tabelas e dentro do RLS.

`criar_nivel(id, rotulo, modelo)` copia do modelo tanto a matriz de módulos
quanto as **capacidades transversais**. Isso não é conveniência: capacidade
não tem tela de edição (decisão do Juliano), então um nível criado sem elas
seria inútil e sem conserto pela interface.

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

`get_advisors` aponta 7 funções `SECURITY DEFINER` executáveis por
`authenticated`. É o desenho, não descuido: são justamente as funções que
precisam ler dado que o usuário não alcança diretamente, e cada uma checa a
permissão internamente antes de devolver qualquer coisa.

**Executável por `anon`, porém, nunca é intencional.** Ao criar função nova,
revogar de `public` — não só de `anon`, que herda o EXECUTE que toda função
ganha de PUBLIC ao nascer. Foi o erro que a migration 24 consertou.

Fica um aviso que **não** é intencional e depende do painel, não de migration:
a proteção contra senha vazada (HaveIBeenPwned) está desligada em
Authentication → Policies.

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

1. Revisar os valores de precificação semeados pela migration 05 — são
   placeholder inventados na Fase A, não dado real da empresa

Os outros seis itens que esta lista trazia foram feitos: Supabase Auth com
guarda no servidor, consultas reais no lugar dos mocks, escrita nos módulos,
Storage para anexos e autenticação em `app/api/[entidade]/route.ts`.
