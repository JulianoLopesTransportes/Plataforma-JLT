# Plataforma JLT — Juliano Lopes Transportes

Plataforma web interna para gestão de clientes, agenda, rotas, frota, orçamentos,
documentos e financeiro.

**No ar:** [julianoltransportes.com.br](https://julianoltransportes.com.br)
· **Banco:** Supabase `lmiddrwpbgczosnrmjas` (São Paulo)

---

## Como rodar

Requer Node.js 20 ou superior.

```bash
npm install
```

Crie `.env.local` a partir de `.env.example` com as credenciais do Supabase, e:

```bash
npm run dev
```

A plataforma sobe em `http://localhost:3000`.

**Sem as variáveis de ambiente**, a plataforma continua funcionando com os dados
fictícios de `mock/` — útil para desenvolver interface sem tocar no banco. A
escolha é automática, em tempo de execução; ver `usandoBanco()` em `lib/api`.

---

## Acesso

A autenticação é real (Supabase Auth) e o **cadastro é uma lista de convidados**:
o banco recusa qualquer e-mail que um administrador não tenha autorizado antes.

**Para dar acesso a alguém:**

1. Um admin entra em **Usuários → Autorizar acesso** e cadastra e-mail, nome,
   cargo e nível
2. A pessoa vai à tela de entrada, escolhe **"Primeiro acesso — definir senha"**
   e cria a própria senha
3. Ao criar, um gatilho no banco monta o perfil já com o nível certo

A senha nunca passa pela nossa aplicação — quem a guarda é o Supabase Auth.

Alterar o nível de alguém vale **imediatamente**, inclusive para quem já está
logado. Revogar o acesso desativa o perfil sem apagar o registro, preservando a
autoria em históricos e lançamentos.

---

## Permissões

**A matriz é editável pela plataforma**, em Usuários → Matriz de permissões.
Quem manda é a tabela `permissoes_modulo` no Postgres: o RLS a consulta a
cada requisição, e a interface a carrega no boot da sessão. Não há mais duas
cópias para manter em sincronia — `lib/permissoes.ts` guarda a mesma matriz
apenas como **padrão de fábrica**, usada antes de o banco responder e quando
não há Supabase configurado.

As consultas (`podeVer`, `podeEditar`, `podeFazer`) continuam síncronas e com
a assinatura de sempre: leem uma variável de módulo que o `SessaoProvider`
preenche antes de qualquer tela desenhar. Nenhum ponto de chamada mudou.

Salvar a matriz vale **imediatamente**, inclusive para quem já está logado.

**Níveis são dado, não código.** Além dos quatro originais, o admin cria
níveis novos — sempre copiando um existente. A cópia leva a matriz de
módulos **e** as capacidades transversais, que não têm tela própria: é ao
escolher de quem copiar que elas ficam decididas. Os quatro originais são
marcados como `sistema` e não podem ser excluídos.

Três travas vivem no banco, não na tela, e valem mesmo contra quem chamar a
API REST direto:

1. Nenhuma alteração pode deixar o sistema **sem um nível com acesso total a
   Usuários** — seria o único estado irreversível pela própria interface
2. O administrador não pode ser rebaixado nem removido da matriz
3. Nível de sistema não se exclui

O padrão de fábrica — o que a migration 02 gravou e o que vale sem banco:

| Módulo | Admin | Financeiro | Operacional | Comercial |
|---|---|---|---|---|
| Dashboard | Total | Leitura | Leitura | Leitura |
| Clientes | Total | Leitura | Leitura | **Total** |
| Orçamentos | Total | Total | — | **Total** ¹ |
| Documentos | Total | Leitura | Leitura | **Total** |
| Agenda | Total | Leitura | **Total** | Leitura |
| Rotas | Total | Leitura | **Total** | Leitura |
| Frota | Total | Leitura | **Total** | — |
| Gastos e Ganhos | Total | **Total** | — | — |
| Relatórios | Total | Leitura ² | Leitura ² | Leitura ² |
| Usuários | **Total** | — | — | — |

Dois recortes não cabem numa matriz por módulo e existem como **capacidades
transversais**. Como RLS filtra linhas e estes requisitos são sobre colunas,
cada um exigiu um mecanismo próprio no banco:

1. **Comercial não vê custo.** A view `orcamentos_visao` devolve `custo_base` e
   `margem_percentual` como `NULL` para quem não tem `ver_custos`. Como o
   Comercial ainda precisa do *preço*, a função `calcular_preco()` roda dentro
   do banco e devolve só o valor final — a composição nunca sai.
2. **Operacional não vê faturamento.** `relatorio_operacoes()` anula a coluna
   conforme a capacidade. Devolve `NULL`, não zero: zero seria falso. O mesmo
   recorte se aplica ao CSV exportado.

Outras capacidades: `exportar` e `excluir` (só admin).

A matriz é editada na plataforma em **Usuários → Matriz de permissões**, e é
a mesma que governa o sistema — a tabela do Postgres, não uma cópia dela.

---

## Estrutura

```
app/
  page.tsx                 entrada: login, criar acesso, recuperar senha
  (plataforma)/            tudo que exige sessão
    layout.tsx             a moldura: sidebar + header, injetada uma vez
    dashboard/ clientes/ documentos/ agenda/ rotas/
    frota/ orcamentos/ financeiro/ relatorios/ usuarios/
  api/[entidade]/          API HTTP autenticada (RLS aplica)
middleware.ts              guarda de sessão NO SERVIDOR

components/
  layout/                  Sidebar, Header, Icone, SessaoProvider
  ui/                      Tabela, Modal, Toast, CardMetrica, Abas, Grafico…
  modulos/                 PainelPrecificacao

lib/
  permissoes.ts            consultas de acesso + padrão de fábrica da matriz
  auth.ts                  Supabase Auth
  supabase/                clientes de navegador e de servidor
  api/                     ÚNICA porta de saída para dados
  negocio/                 regras de negócio, sem React nem DOM
  utils/                   formatadores, máscaras, CSV

styles/tokens.css          design tokens — nenhuma cor fora daqui
supabase/README.md         schema, RLS e migrations
mock/                      dados fictícios (fallback sem banco)
referencia/                os 8 HTMLs originais, preservados intactos
```

### Regras que a estrutura carrega

- **`styles/tokens.css` é a única fonte de cor, fonte, espaçamento e raio.**
- **`lib/api` é a única porta de saída para dados.** Nenhum componente faz
  consulta direta. Foi essa camada que permitiu trocar mocks por Supabase sem
  tocar em um único módulo.
- **`lib/negocio` não conhece React nem DOM.** Precificação, ocupação de rota e
  motor de alertas são funções puras.
- **A moldura existe uma vez.** Nenhuma página redeclara sidebar ou header.

---

## De onde veio cada módulo

Os arquivos originais estão preservados em `referencia/`. Nada foi descartado.

| Módulo | Origem | O que foi preservado |
|---|---|---|
| Clientes | `01-cadastro-clientes_5.html` | Máscaras CPF/CNPJ/telefone, 6 faixas de porte por volume, funil de status, histórico |
| Documentos | `02-documentos_10.html` | 6 geradores com o texto jurídico integral — 13 cláusulas no contrato, 13 + Anexo I no guarda-móveis — e o catálogo de 153 itens |
| Agenda | `03-agenda_8.html` | Calendário mensal, 6 tipos de compromisso, vínculos |
| Frota | `04-veiculos-motoristas_3.html` | Abas, vínculo motorista↔veículo, alerta de CNH |
| Gastos e Ganhos | `05-gastos-ganhos_5.html` | Lançamentos, categoria livre, gráficos |
| Orçamentos | `06-orcamentos-calculadora_6.html` | Faixas, adicionais, margem por divisão, arredondamento comercial, parcelamento |
| Rotas | `07-rotas_1.html` | Kanban, linha do tempo, ocupação parada a parada, alertas |
| Relatórios · Usuários | — | Módulos novos |

O `00-guia-visual_1.html` não virou módulo: ele foi a fonte do `tokens.css`, e
a tela que o exibia foi retirada a pedido.

### Inconsistências que a consolidação resolveu

- Sidebar e tokens `:root` estavam **duplicados nos 8 arquivos**; agora existem
  uma vez cada
- O mesmo cliente tinha **três schemas diferentes**; agora há um só
- `formatBRL`, `maskPhone`, `dataFormatada` estavam reescritos em até cinco
  arquivos, com comportamentos distintos
- O prefixo `rot_` do módulo de rotas perdeu a função com módulos
- A logo tinha **2,04 MB**; agora tem **30,4 KB**

---

## Estado atual

**Pronto:** interface completa, autenticação real, RLS aplicando a matriz,
controle de acessos pelo admin, parâmetros de precificação editáveis, camada de
dados falando com o banco, API HTTP autenticada.

Persistem no banco: clientes, frota, agenda, lançamentos financeiros e rotas —
cadastro, edição e exclusão. Clientes, veículos e motoristas aceitam anexos,
guardados em bucket privado com URL assinada de curta duração. O cadastro do
cliente tem um campo **Itens** — a relação de bens da mudança, digitada ou
importada de um `.txt` — que sai impressa na Ordem de Serviço.

Cada cliente ganha um **código** no formato `2026-0001`, gerado pelo banco e
imutável. Ele aparece na lista, entra na busca e sai impresso na Ordem de
Serviço — é por ele que se acha o cadastro quando alguém liga com o papel na
mão. A numeração reinicia a cada ano, e buracos na sequência são normais: o
contador nunca reaproveita número, que é o que garante nunca repetir.

Na **agenda**, escolher o cliente traz endereços e título do cadastro,
preenchendo só o que estiver vazio ou o que ainda for do cliente anterior —
o que você digitou à mão sobrevive à troca. Os itens do cliente aparecem ali
em leitura, e coleta e entrega são tipos separados de compromisso, porque
quase sempre caem em dias diferentes.

A criação de rota passa pela função `criar_rota_completa` no Postgres, e não
por inserts sucessivos do navegador: rota, cargas, paradas e movimentos são
quatro tabelas encadeadas, e sem transação uma falha no meio deixaria rota
órfã. A função também mapeia os ids temporários que a tela usa para os ids
reais das cargas.

**A rota é montada cidade a cidade**, na ordem em que o caminhão as visita.
Em cada cidade se declara o que acontece: coletar a mudança de um cliente —
e a carga nasce ali, já preenchida pelo cadastro — ou entregar uma que está
a bordo. O seletor de entrega só oferece cargas coletadas em cidades
anteriores e ainda não entregues, o que torna impossível, pela interface,
entregar o que não foi coletado. Origem e destino não são digitados: são a
primeira e a última cidade.

**Falta:**

1. Revisar os **valores de precificação**, que são placeholder inventados na
   Fase A e não dado real da empresa
2. Conferir na tela, com sessão aberta, tudo o que foi entregue em
   21/08/2026 — Ordem de Serviço, campo Itens, rotas por cidade e a matriz
   editável passaram por build e por teste no banco, mas não por uso real

**As tabelas de negócio estão vazias por decisão:** os mocks são pessoas e cargas
fictícias e não devem virar registro real. O cadastro começa do zero.
