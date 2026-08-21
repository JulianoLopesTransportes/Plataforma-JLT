# Matriz de permissões editável

**Data:** 21/08/2026 · **Estado:** aprovado para implementação

## O problema

A matriz de acesso existe hoje em dois lugares que precisam concordar:

- `lib/permissoes.ts` — constante compilada, governa a interface
- `permissoes_modulo` no Postgres — tabela, governa o RLS

A metade do banco **já é dinâmica**: o RLS a consulta a cada requisição, e
mudar uma linha vale na hora. A metade do TypeScript muda só com deploy.
Juliano quer alterar a matriz pela plataforma, sem depender de deploy.

## O que ele decidiu

| Pergunta | Resposta |
|---|---|
| Escopo | Só a matriz de módulos — **não** há tela para editar capacidades |
| Níveis | Poder **criar níveis novos**, além dos quatro de hoje |
| Ordem | Depois dos outros quatro pedidos (feitos e no ar) |

## A descoberta que altera o escopo

`nivel` é um **enum do Postgres** (`nivel_usuario`), referenciado por
`perfis`, `permissoes_modulo`, `permissoes_capacidade` e
`niveis_pre_atribuidos`, e usado dentro das policies via `nivel_atual()`.

Dois fatos decorrem disso:

1. **O Postgres não remove valor de enum.** Um nível criado por engano
   ficaria para sempre. Níveis criáveis exigem virar **tabela**.

2. **Capacidades não podem continuar só no código.** Um nível criado
   depois do deploy não existe na constante `CAPACIDADES` do TypeScript,
   então `podeFazer()` responderia `false` para tudo — nível sem exportar,
   sem ver custo, sem excluir, e sem tela para conceder.

**Resolução:** as capacidades passam a ser **lidas do banco**, mas
continuam **sem tela de edição**, como ele pediu. Ao criar um nível,
escolhe-se um nível-modelo e as capacidades dele são copiadas.

## Desenho

### 1. Níveis viram dado

Tabela `niveis`:

| coluna | tipo | papel |
|---|---|---|
| `id` | text PK | `admin`, `financeiro`, `ajudante`… — o que vai em `perfis.nivel` |
| `rotulo` | text | "Administrador", "Ajudante" — o que aparece na tela |
| `ordem` | int | posição nas colunas da matriz |
| `sistema` | boolean | `true` nos quatro originais: não podem ser excluídos |

As quatro colunas `nivel` deixam de ser `nivel_usuario` e viram `text`
com FK para `niveis(id)`. O enum é descartado ao final.

`admin` é `sistema` **e** intocável na matriz: sempre `crud` em tudo.

### 2. Escrita liberada, com trava

Hoje `permissoes_modulo` e `permissoes_capacidade` só têm policy de
SELECT — ninguém escreve nelas pela API. Ganham policy de escrita
condicionada a `pode_editar('usuarios')`, que hoje só o admin satisfaz.

**Trava de auto-exclusão.** Um trigger recusa qualquer alteração que
deixe o sistema sem **nenhum** nível com `crud` em `usuarios`. Sem ela,
um clique fecharia a única porta que edita a matriz — para todo mundo,
para sempre. É o modo de falha mais caro deste desenho, e o único
irreversível pela própria interface.

### 3. O TypeScript deixa de ser a verdade

O problema: `podeVer(nivel, modulo)` é **síncrona** e chamada em treze
arquivos. Vinda do banco, a matriz precisa estar carregada antes da tela
desenhar.

**Abordagem escolhida — armazém de módulo, hidratado no boot.**
`lib/permissoes.ts` mantém as funções síncronas com a assinatura de hoje;
elas passam a ler uma variável de módulo que o `SessaoProvider` preenche
antes de renderizar os filhos, junto com o perfil. **Nenhum ponto de
chamada muda.**

Alternativa descartada: transformar tudo em hook `usePermissoes()`. Muda
os treze arquivos, e `moduloDaRota()` não pode usar hook.

A constante compilada não some — vira **semente**: o que vale antes da
hidratação e quando não há banco (modo mock). Deixa de ser a lei e passa
a ser o padrão de fábrica.

**Consequência aceita:** `Nivel` deixa de ser união literal
(`'admin' | 'financeiro' | …`) e vira `string`. Os `Record<Nivel, …>`
espalhados pelo código viram consulta com reserva.

### 4. A tela

**Usuários → Matriz de permissões** deixa de ser leitura. Cada célula
vira um seletor de três estados (`crud` / `r` / `none`). A linha do admin
é exibida travada, com o motivo à vista.

Abaixo, **Níveis**: criar (id, rótulo, nível-modelo de quem copiar as
capacidades), renomear e excluir. Excluir só vale para nível não-sistema
e sem nenhum perfil usando.

Salvar é explícito, não a cada clique: a matriz é uma peça só, e gravar
célula a célula deixaria estados intermediários incoerentes no ar.

### 5. Efeito imediato

Alterar a matriz vale **na hora** para quem já está logado — o
`SessaoProvider` já recarrega o perfil, e passa a recarregar a matriz
junto. Sem isso, a mudança só apareceria no próximo login, e o admin não
teria como saber se pegou.

## Como se verifica

1. Trocar uma célula, salvar, e ver a sidebar do próprio usuário reagir
2. Criar um nível copiando de Comercial e conferir que ele nasce com as
   capacidades do Comercial
3. Tentar tirar `usuarios: crud` de todos os níveis — a trava recusa
4. Conferir no banco que o RLS acompanhou: o dado, não só a tela

## O que fica de fora

- Tela para editar capacidades — decisão dele, e as quatro capacidades
  atuais não mudaram desde o briefing
- Permissão por registro (este cliente sim, aquele não) — a matriz é por
  módulo, e nada no uso pediu mais fino que isso
