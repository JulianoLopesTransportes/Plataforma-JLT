'use client';

/**
 * GUIA VISUAL — migrado de referencia/00-guia-visual_1.html
 *
 * O arquivo original era documentação solta. Aqui ele vira uma rota interna
 * e, mais importante, deixa de ser uma cópia: as amostras de cor são lidas
 * de tokens.css em tempo de execução, e os componentes exibidos são os
 * componentes reais. Se um token mudar, esta página muda junto — não há
 * como a documentação divergir do sistema.
 */

import { useEffect, useState } from 'react';
import {
  TituloPagina,
  Badge,
  CardMetrica,
  GradeMetricas,
  Abas,
  Modal,
  useToast,
} from '@/components/ui';
import Icone from '@/components/layout/Icone';
import estilos from './guia.module.css';

const GRUPOS_COR = [
  {
    titulo: 'Marca',
    tokens: [
      { nome: '--color-primary', uso: 'Vermelho institucional — ações principais' },
      { nome: '--color-primary-dark', uso: 'Hover, sidebar, cabeçalho de tabela' },
      { nome: '--color-primary-light', uso: 'Destaque e alertas' },
      { nome: '--color-black', uso: 'Preto institucional' },
      { nome: '--color-gold', uso: 'Cor terciária — item ativo, selos' },
      { nome: '--color-gold-light', uso: 'Hover em elementos dourados' },
    ],
  },
  {
    titulo: 'Neutros',
    tokens: [
      { nome: '--color-bg', uso: 'Fundo geral das telas' },
      { nome: '--color-surface', uso: 'Cards, tabelas, formulários' },
      { nome: '--color-border', uso: 'Bordas e divisores' },
      { nome: '--color-gray-600', uso: 'Texto secundário' },
      { nome: '--color-text', uso: 'Texto principal' },
    ],
  },
  {
    titulo: 'Status',
    tokens: [
      { nome: '--color-success', uso: 'Confirmação, resultado positivo' },
      { nome: '--color-warning', uso: 'Atenção, prazo próximo' },
      { nome: '--color-danger', uso: 'Erro, exclusão, lotação estourada' },
      { nome: '--color-info', uso: 'Informação neutra' },
    ],
  },
];

const ICONES = [
  'dashboard', 'clientes', 'documentos', 'agenda', 'rotas', 'veiculo',
  'motorista', 'financeiro', 'orcamento', 'relatorios', 'usuarios', 'guia',
  'menu', 'fechar', 'sair', 'buscar', 'mais', 'baixar', 'alerta', 'seta',
];

export default function PaginaGuiaVisual() {
  const { mostrar } = useToast();
  const [aba, setAba] = useState('cores');
  const [modalAberto, setModalAberto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});

  // Lê os valores reais dos tokens do CSS, em vez de repeti-los aqui.
  useEffect(() => {
    const estilo = getComputedStyle(document.documentElement);
    const lidos: Record<string, string> = {};
    for (const grupo of GRUPOS_COR) {
      for (const token of grupo.tokens) {
        lidos[token.nome] = estilo.getPropertyValue(token.nome).trim();
      }
    }
    setValores(lidos);
  }, []);

  return (
    <>
      <TituloPagina
        titulo="Guia visual"
        subtitulo="Referência de identidade da plataforma. Os valores abaixo são lidos de tokens.css em tempo real."
      />

      <Abas
        abas={[
          { chave: 'cores', rotulo: 'Cores' },
          { chave: 'tipografia', rotulo: 'Tipografia' },
          { chave: 'componentes', rotulo: 'Componentes' },
          { chave: 'icones', rotulo: 'Ícones' },
        ]}
        ativa={aba}
        aoTrocar={setAba}
      />

      {aba === 'cores' && (
        <>
          {GRUPOS_COR.map((grupo) => (
            <section key={grupo.titulo} className={estilos.secao}>
              <h2 className={estilos.tituloSecao}>{grupo.titulo}</h2>
              <div className={estilos.gradeAmostras}>
                {grupo.tokens.map((token) => (
                  <div key={token.nome} className={estilos.amostra}>
                    <div
                      className={estilos.amostraCor}
                      style={{ background: `var(${token.nome})` }}
                    />
                    <div className={estilos.amostraInfo}>
                      <code>{token.nome}</code>
                      <strong>{valores[token.nome] || '…'}</strong>
                      <span>{token.uso}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <p className={estilos.nota}>
            Regra do projeto: nenhuma cor hardcoded fora de <code>styles/tokens.css</code>. Se
            você precisa de um tom que não existe aqui, o caminho é criar o token — não escrever
            um hex no componente.
          </p>
        </>
      )}

      {aba === 'tipografia' && (
        <section className={estilos.secao}>
          <div className={estilos.amostraTipo}>
            <span className={estilos.rotuloTipo}>
              Bebas Neue — <code>--font-display</code>
            </span>
            <p className={estilos.displayGrande}>Juliano Lopes Transportes</p>
            <span className="texto-secundario">
              Títulos, cabeçalhos de tabela, valores em destaque e a sidebar. É a fonte da palavra
              &ldquo;JULIANO LOPES&rdquo; na logo.
            </span>
          </div>

          <div className={estilos.amostraTipo}>
            <span className={estilos.rotuloTipo}>
              Montserrat — <code>--font-body</code>
            </span>
            <p className={estilos.corpoGrande}>
              Transporte e mudanças com equipe própria em Belo Horizonte e região.
            </p>
            <p className={estilos.corpoNormal}>
              Texto corrido, formulários e tabelas usam Montserrat. É a fonte da palavra
              &ldquo;TRANSPORTES&rdquo; na logo, e o que garante legibilidade em tabelas densas de
              uso diário.
            </p>
          </div>

          <div className={estilos.escalaTipo}>
            {[
              { rotulo: 'Título de página', classe: 'page-title' },
              { rotulo: 'Título de card', classe: 'card-title' },
            ].map((item) => (
              <div key={item.classe}>
                <span className={estilos.rotuloTipo}>{item.rotulo}</span>
                <div className={item.classe}>Texto de exemplo</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {aba === 'componentes' && (
        <>
          <section className={estilos.secao}>
            <h2 className={estilos.tituloSecao}>Botões</h2>
            <div className="linha-acoes">
              <button type="button" className="btn btn-primary">Primário</button>
              <button type="button" className="btn btn-gold">Dourado</button>
              <button type="button" className="btn btn-outline">Contorno</button>
              <button type="button" className="btn btn-ghost">Fantasma</button>
              <button type="button" className="btn btn-danger">Perigo</button>
              <button type="button" className="btn btn-primary" disabled>
                Desabilitado
              </button>
            </div>
            <p className="field-hint" style={{ marginTop: 12 }}>
              O estado desabilitado é o que a plataforma usa quando o nível do usuário não permite
              a ação — visível, mas inerte.
            </p>
          </section>

          <section className={estilos.secao}>
            <h2 className={estilos.tituloSecao}>Badges de status</h2>
            <div className="linha-acoes">
              <Badge texto="Concluído" tom="success" />
              <Badge texto="Em andamento" tom="warning" />
              <Badge texto="Atrasado" tom="danger" />
              <Badge texto="Novo" tom="info" />
              <Badge texto="Inativo" tom="neutro" />
            </div>
          </section>

          <section className={estilos.secao}>
            <h2 className={estilos.tituloSecao}>Cards de métrica</h2>
            <GradeMetricas>
              <CardMetrica
                rotulo="Com valor"
                valor="R$ 32.000,00"
                detalhe="Detalhe explicativo"
                icone="financeiro"
                tom="positivo"
              />
              <CardMetrica
                rotulo="Sem dado"
                valor={null}
                detalhe="Como aparece quando o número não tem origem"
              />
            </GradeMetricas>
            <p className="field-hint">
              Quando um número ainda não tem origem definida, o card mostra o estado vazio honesto
              em vez de um valor inventado.
            </p>
          </section>

          <section className={estilos.secao}>
            <h2 className={estilos.tituloSecao}>Formulário</h2>
            <div className="form-row">
              <div className="field">
                <label htmlFor="ex1">Campo de texto</label>
                <input id="ex1" placeholder="Digite algo" />
              </div>
              <div className="field">
                <label htmlFor="ex2">Seleção</label>
                <select id="ex2">
                  <option>Opção A</option>
                  <option>Opção B</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ex3">Campo desabilitado</label>
              <input id="ex3" disabled value="Sem permissão de edição" readOnly />
            </div>
          </section>

          <section className={estilos.secao}>
            <h2 className={estilos.tituloSecao}>Tabela</h2>
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Rota</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Maria da Silva Rezende</td>
                  <td>BH → Savassi</td>
                  <td className="numerico">R$ 8.900,00</td>
                  <td><Badge texto="Em andamento" tom="warning" /></td>
                </tr>
                <tr>
                  <td>Vetta Engenharia Ltda</td>
                  <td>BH → Contagem</td>
                  <td className="numerico">R$ 18.500,00</td>
                  <td><Badge texto="Concluído" tom="success" /></td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className={estilos.secao}>
            <h2 className={estilos.tituloSecao}>Sobreposições</h2>
            <div className="linha-acoes">
              <button type="button" className="btn btn-outline" onClick={() => setModalAberto(true)}>
                Abrir modal
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => mostrar('Exemplo de aviso da plataforma.', 'sucesso')}
              >
                Disparar toast
              </button>
            </div>
          </section>

          <section className={estilos.secao}>
            <h2 className={estilos.tituloSecao}>Estado vazio</h2>
            <div className="card">
              <div className="estado-vazio">
                <strong>Nada por aqui</strong>
                Nenhum registro corresponde aos filtros aplicados.
              </div>
            </div>
          </section>
        </>
      )}

      {aba === 'icones' && (
        <section className={estilos.secao}>
          <h2 className={estilos.tituloSecao}>Conjunto de ícones</h2>
          <div className={estilos.gradeIcones}>
            {ICONES.map((nome) => (
              <div key={nome} className={estilos.iconeDemo}>
                <Icone nome={nome} tamanho={26} />
                <code>{nome}</code>
              </div>
            ))}
          </div>
          <p className={estilos.nota}>
            Traço de 1.8, estilo outline, herdando a cor do contexto. São inline em vez de
            biblioteca externa: são poucos, e assim o projeto não ganha mais uma dependência.
          </p>
        </section>
      )}

      <Modal
        titulo="Modal de exemplo"
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        rodape={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setModalAberto(false)}>
              Confirmar
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Este é o componente <code>Modal</code> real, o mesmo usado por Clientes, Frota, Agenda e
          Rotas. Fecha com Esc, com clique no fundo ou no botão. Enquanto aberto, o fundo não rola.
        </p>
      </Modal>
    </>
  );
}
