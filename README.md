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

A regra de acesso existe em **dois lugares que precisam concordar**:

- `lib/permissoes.ts` — governa a interface (sidebar, guardas, botões)
- tabela `permissoes_modulo` no Postgres — governa o RLS

A duplicação é proposital: uma policy do banco não consegue ler um objeto
TypeScript. O ganho é que a regra vale mesmo contra acesso direto à API REST,
não só na tela. **Ao mudar a matriz, mude nos dois lugares.**

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

A matriz pode ser consultada na plataforma em **Usuários → Matriz de permissões**,
renderizada do mesmo objeto que governa o sistema.

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
  permissoes.ts            matriz de acesso — fonte única no front
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
cadastro, edição e exclusão.

A criação de rota passa pela função `criar_rota_completa` no Postgres, e não
por inserts sucessivos do navegador: rota, cargas, paradas e movimentos são
quatro tabelas encadeadas, e sem transação uma falha no meio deixaria rota
órfã. A função também mapeia os ids temporários que a tela usa para os ids
reais das cargas.

**Falta:**

1. Supabase Storage para os anexos (o tipo `Anexo` já está modelado)
2. Revisar os **valores de precificação**, que são placeholder inventados na
   Fase A e não dado real da empresa
3. Verificação automática de paridade entre `lib/permissoes.ts` e
   `permissoes_modulo`

**As tabelas de negócio estão vazias por decisão:** os mocks são pessoas e cargas
fictícias e não devem virar registro real. O cadastro começa do zero.
