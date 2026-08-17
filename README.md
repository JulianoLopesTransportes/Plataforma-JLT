# Plataforma JLT — Juliano Lopes Transportes

Plataforma web interna para gestão de clientes, agenda, rotas, frota, orçamentos,
documentos e financeiro.

> **Fase atual: A — interface completa com dados fictícios.**
> Não há banco de dados nem autenticação real. Ver [O que falta](#o-que-falta-quando-o-banco-entrar).

---

## Como rodar

Requer Node.js 20 ou superior.

```bash
npm install
```

```bash
npm run dev
```

A plataforma sobe em `http://localhost:3000`. A tela de login aparece primeiro;
escolha um dos perfis de teste listados nela.

Outros comandos:

```bash
npm run build
```

```bash
npm start
```

---

## Usuários de teste

Um por nível de acesso. **Qualquer senha é aceita** — a autenticação é simulada
(ver `lib/auth.ts`). Na tela de login basta clicar no perfil desejado.

| Nível | E-mail | Nome |
|---|---|---|
| Administrador | `admin@julianoltransportes.com.br` | Juliano Lopes |
| Financeiro | `financeiro@julianoltransportes.com.br` | Renata Prado |
| Operacional | `operacional@julianoltransportes.com.br` | Marcos Vieira |
| Comercial | `comercial@julianoltransportes.com.br` | Aline Duarte |

Troque de perfil para conferir como cada nível enxerga a plataforma: a sidebar
lista só os módulos permitidos, as ações restritas aparecem desabilitadas e os
relatórios escondem colunas conforme o nível.

---

## Permissões

A regra de acesso vive **inteira** em `lib/permissoes.ts`, num único objeto.
Não há verificação de permissão espalhada pelo código: sidebar, guarda de rota,
botões desabilitados e colunas de relatório consultam as funções desse arquivo.

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
| Guia visual | Leitura | Leitura | Leitura | Leitura |

Dois recortes não cabem numa matriz por módulo e existem como **capacidades
transversais** (também em `lib/permissoes.ts`):

1. **Comercial usa a calculadora de orçamento e vê o preço final, mas não vê
   custo, margem nem os parâmetros de precificação.** Controlado por
   `ver_custos` e `editar_parametros_precificacao`.
2. **Nos relatórios, Comercial não vê custo e Operacional não vê faturamento.**
   Controlado por `ver_custos` e `ver_faturamento` — e o mesmo recorte se aplica
   ao CSV exportado, não só à tela.

Outras capacidades: `exportar`, `aprovar`, `excluir`.

A matriz também pode ser consultada na própria plataforma, em **Usuários →
Matriz de permissões**, renderizada a partir do mesmo objeto.

---

## Estrutura de pastas

```
app/
  page.tsx                 tela de login
  (plataforma)/            tudo que exige sessão
    layout.tsx             a moldura: sidebar + header, injetada uma vez
    dashboard/ clientes/ documentos/ agenda/ rotas/
    frota/ orcamentos/ financeiro/ relatorios/ usuarios/ guia-visual/
  api/[entidade]/          endpoints stub (substituem o Express)

components/
  layout/                  Sidebar, Header, Icone, SessaoProvider
  ui/                      Tabela, Modal, Toast, CardMetrica, Abas, Grafico…

lib/
  permissoes.ts            MATRIZ DE PERMISSÕES — fonte única de acesso
  auth.ts                  sessão simulada (leia o aviso no topo)
  navegacao.ts             itens da sidebar
  tipos.ts                 schema das entidades
  api/                     ÚNICA porta de saída para dados
  negocio/                 regras portadas dos módulos originais, sem DOM
  utils/                   formatadores, máscaras, exportação CSV

styles/
  tokens.css               design tokens — nenhuma cor fora daqui
  globals.css              reset e classes de componente do guia visual

mock/                      dados fictícios, um arquivo por entidade
referencia/                os 8 HTMLs originais, preservados intactos
```

### Regras que a estrutura carrega

- **`styles/tokens.css` é a única fonte de cor, fonte, espaçamento e raio.**
  Nenhum hex fora dele. Se falta um tom, crie o token.
- **`lib/api` é a única porta de saída para dados.** Nenhum componente lê JSON
  nem faz `fetch` direto. É essa camada que torna a troca para o Supabase uma
  mudança local.
- **`lib/negocio` não conhece React nem DOM.** Precificação, ocupação de rota e
  motor de alertas são funções puras, testáveis isoladamente.
- **A moldura existe uma vez.** Nenhuma página redeclara sidebar ou header.

---

## De onde veio cada módulo

Os arquivos originais estão preservados em `referencia/`. Nada foi descartado.

| Módulo | Origem | O que foi preservado |
|---|---|---|
| Clientes | `01-cadastro-clientes_5.html` | Máscaras CPF/CNPJ/telefone, classificação de porte por volume (6 faixas), funil de status, histórico |
| Documentos | `02-documentos_10.html` | Os 6 geradores com o texto jurídico integral — 13 cláusulas no contrato de mudança, 13 + Anexo I no guarda-móveis — e o catálogo de 153 itens em 6 ambientes |
| Agenda | `03-agenda_8.html` | Calendário mensal, 6 tipos de compromisso, vínculos com cliente/veículo/rota |
| Frota | `04-veiculos-motoristas_3.html` | Cadastro duplo em abas, vínculo motorista↔veículo, alerta de vencimento de CNH |
| Gastos e Ganhos | `05-gastos-ganhos_5.html` | Lançamentos com categoria livre, vínculos, gráficos de composição |
| Orçamentos | `06-orcamentos-calculadora_6.html` | Faixas de volume, adicionais, margem por divisão, arredondamento comercial, parcelamento padrão |
| Rotas | `07-rotas_1.html` | Kanban, linha do tempo, ocupação parada a parada, motor de alertas |
| Guia visual | `00-guia-visual_1.html` | Tokens, tipografia, componentes — agora lidos do CSS real, não copiados |
| Relatórios | — | Módulo novo |
| Usuários | — | Módulo novo |

### Inconsistências que a consolidação resolveu

- A sidebar e o bloco `:root` de tokens estavam **duplicados nos 8 arquivos**.
  Agora existem uma vez cada.
- O mesmo cliente tinha **três schemas diferentes** (em documentos, agenda e
  financeiro). Agora há uma definição só, em `lib/tipos.ts`.
- `formatBRL`, `maskPhone`, `dataFormatada` e afins estavam reescritos em até
  cinco arquivos, com comportamentos ligeiramente distintos. Agora vivem em
  `lib/utils/formato.ts`.
- O prefixo `rot_` do módulo de rotas foi removido: existia para evitar colisão
  num arquivo único e perdeu a função com módulos.
- A logo tinha **2,04 MB**; agora tem **30,4 KB** (`public/logo-jlt.png`).

---

## Dados nesta fase

Todo dado vem de `lib/api`, que lê os JSON de `mock/` com um atraso artificial
de 220 ms para simular rede. Cada função carrega o comentário do endpoint real
que vai substituí-la (`// TODO: substituir por GET /api/...`).

Onde um número ainda não tem origem definida, a interface mostra
**"Sem dados — aguardando integração"** em vez de inventar um valor.

O módulo Relatórios explica na própria tela como apura receita e custo, e diz
abertamente que a atribuição é direta, não um rateio contábil.

---

## O que falta quando o banco entrar

A Fase B troca os mocks pelo Supabase. A ordem sugerida:

1. **Schema no Postgres.** Modelar as tabelas a partir de `lib/tipos.ts` — os
   nomes de campo já foram escolhidos pensando nisso. Depois gerar os tipos com
   `supabase gen types typescript` e transformar `lib/tipos.ts` num re-export.

2. **Row Level Security.** Traduzir `MATRIZ_PERMISSOES` em policies. A matriz é
   a especificação: cada linha vira uma policy por tabela. As capacidades
   transversais (`ver_custos`, `ver_faturamento`) viram policies de coluna ou
   views específicas por papel.

3. **Autenticação real.** Substituir `lib/auth.ts` por Supabase Auth. Junto com
   isso, criar `middleware.ts` para validar a sessão **no servidor**, antes de
   renderizar — hoje a guarda é client-side, porque a sessão mock vive em
   `sessionStorage`. Ver o aviso completo no topo de `lib/auth.ts`.

4. **Camada de dados.** Em `lib/api/index.ts`, trocar `lerMock(...)` por consulta
   ao Supabase em cada função. **A assinatura pública de cada função não muda**,
   e por isso nenhum componente precisa ser tocado — é esse o motivo de a camada
   existir.

5. **Escrita.** Hoje as telas alteram apenas o estado local: criar um cliente ou
   excluir um lançamento não persiste, e some no refresh. Cada handler que hoje
   chama `setEstado(...)` passa a chamar a função de escrita correspondente.

6. **Upload de arquivos.** Os anexos de cliente, veículo e motorista estão
   modelados (`tipo Anexo`) mas não têm onde ser guardados. Entram com o
   Supabase Storage.

7. **Proteger os endpoints.** `app/api/[entidade]/route.ts` hoje não tem
   autenticação — aceitável com dado fictício, inaceitável com dado real.

---

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **CSS Modules** sobre design tokens — escolhido em vez de Tailwind para que o
  guia visual da empresa entrasse intacto e a regra "nenhuma cor fora de
  tokens.css" fosse verificável
- **Chart.js** para os gráficos, usado direto, sem wrapper de terceiros

Dependências de produção: `next`, `react`, `react-dom`, `chart.js`. Só isso.
