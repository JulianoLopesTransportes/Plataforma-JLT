'use client';

/**
 * USUÁRIOS — controle de acesso. Exclusivo do Administrador.
 *
 * Como funciona o fluxo de acesso:
 *   1. o admin autoriza um e-mail aqui, já com o nível
 *   2. a pessoa vai à tela de entrada e cria a própria senha
 *   3. o banco recusa qualquer e-mail que não esteja autorizado
 *
 * A senha nunca passa por esta tela nem por nenhuma outra parte do nosso
 * código — quem a guarda é o Supabase Auth.
 *
 * Alterar o nível vale IMEDIATAMENTE, inclusive para quem já está logado:
 * um gatilho no banco propaga a mudança para o perfil.
 */

import { useEffect, useState, useCallback } from 'react';
import { useUsuario, useSessao } from '@/components/layout/SessaoProvider';
import {
  usuarios as apiUsuarios,
  permissoes as apiPermissoes,
  type UsuarioAdmin,
} from '@/lib/api/admin';
import { iniciais } from '@/lib/auth';
import {
  MODULOS,
  niveisDisponiveis,
  rotuloDoNivel,
  permissoesAtuais,
  type Nivel,
  type Acesso,
} from '@/lib/permissoes';
import { rotuloDoModulo } from '@/lib/navegacao';
import {
  TituloPagina,
  Abas,
  Badge,
  Modal,
  GradeMetricas,
  CardMetrica,
  useToast,
} from '@/components/ui';
import type { ModuloId } from '@/lib/permissoes';
import estilos from './usuarios.module.css';

const ROTULO_ACESSO: Record<Acesso, string> = {
  crud: 'Total',
  r: 'Leitura',
  none: 'Sem acesso',
};

const ORDEM_ACESSO: Acesso[] = ['crud', 'r', 'none'];

/**
 * Descrição dos quatro níveis originais. Os criados na plataforma não têm
 * uma — nasceram de um modelo, e o que eles alcançam se lê na matriz, que
 * é a fonte, não numa frase escrita à mão que envelheceria em silêncio.
 */
const DESCRICAO_NIVEL: Record<string, string> = {
  admin: 'Acesso total. Único que gerencia usuários e parâmetros do sistema.',
  financeiro: 'Faturamento, custos e relatórios financeiros. Leitura no operacional e comercial.',
  operacional: 'Frota, motoristas, agenda e rotas. Sem acesso a dados financeiros.',
  comercial: 'Clientes, orçamentos e documentos. Sem custo interno nem margem.',
};

const FORM_VAZIO = { email: '', nome: '', cargo: '', nivel: 'comercial' as Nivel };

export default function PaginaUsuarios() {
  const usuarioAtual = useUsuario();
  const { recarregar, recarregarPermissoes } = useSessao();
  const { mostrar } = useToast();

  const [aba, setAba] = useState('usuarios');
  const [lista, setLista] = useState<UsuarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [formAberto, setFormAberto] = useState(false);
  const [formulario, setFormulario] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);

  const modulos = MODULOS;

  /*
   * Rascunho da matriz. Editar mexe aqui, não no banco: a matriz é uma
   * peça só, e gravar célula a célula deixaria estados intermediários
   * incoerentes no ar se a rede caísse no meio. Salvar é explícito.
   */
  const [rascunho, setRascunho] = useState(() => permissoesAtuais().matriz);
  const [matrizSuja, setMatrizSuja] = useState(false);
  const [salvandoMatriz, setSalvandoMatriz] = useState(false);

  const [niveis, setNiveis] = useState(() => niveisDisponiveis());
  const [formNivel, setFormNivel] = useState<{ rotulo: string; modelo: Nivel } | null>(null);

  /** Devolve o rascunho ao que está de fato gravado. */
  const sincronizarDoArmazem = useCallback(() => {
    setRascunho(permissoesAtuais().matriz);
    setNiveis(niveisDisponiveis());
    setMatrizSuja(false);
  }, []);

  const carregar = useCallback(async () => {
    try {
      setLista(await apiUsuarios.listar());
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar usuários.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* --- Ações ------------------------------------------------------------ */

  async function autorizar(evento: React.FormEvent) {
    evento.preventDefault();
    setSalvando(true);

    try {
      if (editando) {
        await apiUsuarios.atualizar(editando.email, {
          nome: formulario.nome,
          cargo: formulario.cargo,
          nivel: formulario.nivel,
        });
        mostrar(`${formulario.nome || editando.email} atualizado.`, 'sucesso');

        // Se o admin mudou o próprio nível, a sessão precisa refletir isso já.
        if (editando.email.toLowerCase() === usuarioAtual.email.toLowerCase()) {
          await recarregar();
        }
      } else {
        await apiUsuarios.autorizar(formulario);
        mostrar(
          `${formulario.email} autorizado. A pessoa já pode criar o acesso na tela de entrada.`,
          'sucesso',
        );
      }

      setFormAberto(false);
      setEditando(null);
      setFormulario(FORM_VAZIO);
      await carregar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function revogar(u: UsuarioAdmin) {
    if (u.email.toLowerCase() === usuarioAtual.email.toLowerCase()) {
      mostrar('Você não pode revogar o próprio acesso.', 'erro');
      return;
    }

    const restamAdmins = lista.filter(
      (x) => x.nivel === 'admin' && x.email.toLowerCase() !== u.email.toLowerCase(),
    ).length;

    if (u.nivel === 'admin' && restamAdmins === 0) {
      mostrar('Não é possível revogar o último administrador.', 'erro');
      return;
    }

    if (
      !confirm(
        `Revogar o acesso de ${u.nome || u.email}?\n\nA pessoa perde o acesso imediatamente. O histórico que ela registrou é preservado.`,
      )
    ) {
      return;
    }

    try {
      await apiUsuarios.revogar(u.email);
      mostrar(`Acesso de ${u.nome || u.email} revogado.`, 'sucesso');
      await carregar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao revogar.', 'erro');
    }
  }

  function abrirEdicao(u: UsuarioAdmin) {
    setEditando(u);
    setFormulario({ email: u.email, nome: u.nome, cargo: u.cargo, nivel: u.nivel });
    setFormAberto(true);
  }

  function abrirNovo() {
    setEditando(null);
    setFormulario(FORM_VAZIO);
    setFormAberto(true);
  }

  /* --- Matriz de permissões --------------------------------------------- */

  function mudarCelula(modulo: ModuloId, nivel: Nivel, acesso: Acesso) {
    setRascunho((atual) => ({
      ...atual,
      [modulo]: { ...atual[modulo], [nivel]: acesso },
    }));
    setMatrizSuja(true);
  }

  /**
   * Grava a matriz e faz a mudança valer na hora.
   *
   * `recarregarPermissoes()` não é enfeite: sem ele o admin salvaria e não
   * veria efeito nenhum até o próximo login — e não teria como saber se
   * pegou. Com ele, a própria sidebar de quem salvou reage na hora.
   */
  async function salvarMatriz() {
    setSalvandoMatriz(true);
    try {
      await apiPermissoes.gravarMatriz(rascunho);
      await recarregarPermissoes();
      sincronizarDoArmazem();
      mostrar('Matriz de permissões atualizada.', 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao salvar a matriz.', 'erro');
    } finally {
      setSalvandoMatriz(false);
    }
  }

  async function criarNivel(evento: React.FormEvent) {
    evento.preventDefault();
    if (!formNivel) return;

    if (!formNivel.rotulo.trim()) {
      mostrar('Dê um nome ao nível.', 'erro');
      return;
    }

    try {
      // O id sai do próprio nome: o banco normaliza para minúsculo sem
      // acento. Pedir os dois separadamente só faria o admin inventar um
      // identificador que ele nunca mais veria.
      await apiPermissoes.criarNivel(formNivel.rotulo, formNivel.rotulo, formNivel.modelo);
      await recarregarPermissoes();
      sincronizarDoArmazem();
      setFormNivel(null);
      mostrar(
        `Nível "${formNivel.rotulo}" criado com as permissões de ${rotuloDoNivel(formNivel.modelo)}.`,
        'sucesso',
      );
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao criar o nível.', 'erro');
    }
  }

  async function excluirNivel(nivel: { id: Nivel; rotulo: string }) {
    const emUso = lista.filter((u) => u.nivel === nivel.id).length;
    if (emUso > 0) {
      mostrar(
        `${emUso} ${emUso === 1 ? 'pessoa usa' : 'pessoas usam'} o nível "${nivel.rotulo}". Mude ${emUso === 1 ? 'ela' : 'elas'} de nível antes de excluí-lo.`,
        'erro',
      );
      return;
    }

    if (!confirm(`Excluir o nível "${nivel.rotulo}"? A linha dele na matriz vai junto.`)) return;

    try {
      await apiPermissoes.excluirNivel(nivel.id);
      await recarregarPermissoes();
      sincronizarDoArmazem();
      mostrar(`Nível "${nivel.rotulo}" excluído.`, 'sucesso');
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao excluir o nível.', 'erro');
    }
  }

  /* --- Métricas --------------------------------------------------------- */
  const comAcesso = lista.filter((u) => u.acessoCriado && u.ativo).length;
  const pendentes = lista.filter((u) => !u.acessoCriado).length;
  const admins = lista.filter((u) => u.nivel === 'admin').length;

  return (
    <>
      <TituloPagina
        titulo="Usuários e permissões"
        subtitulo="Quem acessa a plataforma, com que nível, e o que cada nível enxerga."
        acoes={
          <button type="button" className="btn btn-primary" onClick={abrirNovo}>
            Autorizar acesso
          </button>
        }
      />

      {erro && <div className={estilos.erro}>{erro}</div>}

      <GradeMetricas>
        <CardMetrica
          rotulo="Com acesso ativo"
          valor={String(comAcesso)}
          detalhe="Já criaram a senha"
          icone="usuarios"
        />
        <CardMetrica
          rotulo="Aguardando 1º acesso"
          valor={String(pendentes)}
          detalhe={pendentes > 0 ? 'Autorizados, ainda sem senha' : 'Nenhum pendente'}
        />
        <CardMetrica
          rotulo="Administradores"
          valor={String(admins)}
          detalhe="Podem gerenciar acessos"
        />
        <CardMetrica
          rotulo="Módulos controlados"
          valor={String(modulos.length)}
          detalhe="Todos passam pela matriz"
          icone="guia"
        />
      </GradeMetricas>

      <Abas
        abas={[
          { chave: 'usuarios', rotulo: `Acessos (${lista.length})` },
          { chave: 'matriz', rotulo: 'Matriz de permissões' },
        ]}
        ativa={aba}
        aoTrocar={setAba}
      />

      {/* ================= Lista de acessos ================= */}
      {aba === 'usuarios' &&
        (carregando ? (
          <div className="card">Carregando acessos…</div>
        ) : lista.length === 0 ? (
          <div className="card">
            <div className="estado-vazio">
              <strong>Nenhum acesso autorizado</strong>
              Autorize o primeiro e-mail para que alguém possa entrar.
            </div>
          </div>
        ) : (
          <div className={estilos.gradeUsuarios}>
            {lista.map((u) => {
              const ehVoce = u.email.toLowerCase() === usuarioAtual.email.toLowerCase();

              return (
                <div key={u.email} className={`card ${estilos.cartaoUsuario}`}>
                  <div className={estilos.avatarGrande}>{iniciais(u.nome || u.email)}</div>

                  <div className={estilos.dadosUsuario}>
                    <strong>{u.nome || '(sem nome)'}</strong>
                    {u.cargo && <span className="texto-secundario">{u.cargo}</span>}
                    <span className={estilos.email}>{u.email}</span>

                    <div className={estilos.marcadores}>
                      <Badge
                        texto={rotuloDoNivel(u.nivel)}
                        tom={u.nivel === 'admin' ? 'danger' : 'info'}
                      />
                      {ehVoce && <Badge texto="Você" tom="success" />}
                      {!u.acessoCriado && <Badge texto="Aguardando 1º acesso" tom="warning" />}
                      {u.acessoCriado && !u.ativo && <Badge texto="Desativado" tom="neutro" />}
                    </div>

                    <div className={estilos.acoesUsuario}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => abrirEdicao(u)}
                      >
                        Alterar nível
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => revogar(u)}
                        disabled={ehVoce}
                        title={ehVoce ? 'Você não pode revogar o próprio acesso' : undefined}
                      >
                        Revogar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {/* ================= Matriz ================= */}
      {aba === 'matriz' && (
        <>
          <div className={estilos.legendaAcesso}>
            <span>
              <span className={`${estilos.pastilha} ${estilos.acessoCrud}`} /> Total — lê e escreve
            </span>
            <span>
              <span className={`${estilos.pastilha} ${estilos.acessoR}`} /> Leitura — apenas consulta
            </span>
            <span>
              <span className={`${estilos.pastilha} ${estilos.acessoNone}`} /> Sem acesso — nem
              aparece na sidebar
            </span>
          </div>

          <div className={estilos.tabelaEnvolucro}>
            <table>
              <thead>
                <tr>
                  <th>Módulo</th>
                  {niveis.map((n) => (
                    <th key={n.id} style={{ textAlign: 'center' }}>
                      {n.rotulo}
                      {n.id === 'admin' && <small className={estilos.travado}>travado</small>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modulos.map((modulo) => (
                  <tr key={modulo}>
                    <td>
                      <strong>{rotuloDoModulo(modulo)}</strong>
                    </td>
                    {niveis.map((n) => {
                      const acesso = rascunho[modulo]?.[n.id] ?? 'none';

                      /*
                       * A linha do admin é exibida, não editada. Ela existe
                       * para a matriz continuar legível de relance — sem
                       * ela faltaria a coluna de referência — mas o banco
                       * recusaria a alteração de qualquer forma.
                       */
                      if (n.id === 'admin') {
                        return (
                          <td key={n.id} style={{ textAlign: 'center' }}>
                            <span
                              className={`${estilos.pastilha} ${estilos.acessoCrud}`}
                              title="O administrador precisa manter acesso total a todos os módulos"
                            />
                          </td>
                        );
                      }

                      return (
                        <td key={n.id} style={{ textAlign: 'center' }}>
                          <select
                            className={`${estilos.seletorAcesso} ${
                              acesso === 'crud'
                                ? estilos.acessoCrud
                                : acesso === 'r'
                                  ? estilos.acessoR
                                  : estilos.acessoNone
                            }`}
                            value={acesso}
                            aria-label={`${rotuloDoModulo(modulo)} para ${n.rotulo}`}
                            onChange={(e) =>
                              mudarCelula(modulo, n.id, e.target.value as Acesso)
                            }
                          >
                            {ORDEM_ACESSO.map((a) => (
                              <option key={a} value={a}>
                                {ROTULO_ACESSO[a]}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={estilos.acoesMatriz}>
            {matrizSuja && (
              <span className={estilos.avisoNaoSalvo}>
                Há mudanças não salvas.
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={sincronizarDoArmazem}
              disabled={!matrizSuja || salvandoMatriz}
            >
              Descartar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={salvarMatriz}
              disabled={!matrizSuja || salvandoMatriz}
            >
              {salvandoMatriz ? 'Salvando…' : 'Salvar matriz'}
            </button>
          </div>

          <p className={estilos.notaMatriz}>
            A mesma matriz governa a interface <strong>e</strong> o banco: o que
            você desmarcar aqui deixa de aparecer na tela e passa a ser negado
            pelo Postgres, mesmo para quem tentar falar direto com a API. A
            mudança vale imediatamente, inclusive para quem já está logado.
          </p>

          {/* ---------------- Níveis ---------------- */}
          <div className={estilos.secaoNiveis}>
            <div className="entre">
              <h3 className={estilos.tituloNiveis}>Níveis de acesso</h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setFormNivel({ rotulo: '', modelo: 'comercial' })}
              >
                Criar nível
              </button>
            </div>

            <ul className={estilos.listaNiveis}>
              {niveis.map((n) => {
                const quantos = lista.filter((u) => u.nivel === n.id).length;
                return (
                  <li key={n.id} className={estilos.linhaNivel}>
                    <span className={estilos.nomeNivel}>
                      {n.rotulo}
                      <small>
                        {quantos === 0
                          ? 'ninguém usa'
                          : `${quantos} ${quantos === 1 ? 'pessoa' : 'pessoas'}`}
                        {n.sistema && ' · nível de sistema'}
                      </small>
                    </span>

                    {n.sistema ? (
                      <span className={estilos.travado} title="Os quatro níveis originais são citados pelo código e não podem ser excluídos">
                        não se exclui
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={estilos.excluirNivel}
                        onClick={() => excluirNivel(n)}
                      >
                        Excluir
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {/* ================= Criar nível ================= */}
      <Modal
        titulo="Criar nível de acesso"
        aberto={formNivel !== null}
        aoFechar={() => setFormNivel(null)}
        rodape={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFormNivel(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-nivel" className="btn btn-primary">
              Criar nível
            </button>
          </>
        }
      >
        {formNivel && (
          <form id="form-nivel" onSubmit={criarNivel}>
            <div className="field">
              <label htmlFor="rotuloNivel">Nome do nível</label>
              <input
                id="rotuloNivel"
                value={formNivel.rotulo}
                onChange={(e) => setFormNivel({ ...formNivel, rotulo: e.target.value })}
                placeholder="Ajudante"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="modeloNivel">Copiar as permissões de</label>
              <select
                id="modeloNivel"
                value={formNivel.modelo}
                onChange={(e) => setFormNivel({ ...formNivel, modelo: e.target.value })}
              >
                {niveis.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.rotulo}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                O nível novo nasce com a matriz e as capacidades deste, e você
                ajusta a matriz depois.
              </p>
            </div>

            <p className={estilos.avisoAdmin}>
              As <strong>capacidades transversais</strong> — ver custo, ver
              faturamento, exportar CSV, aprovar e excluir — não têm tela para
              serem editadas. É aqui, escolhendo de quem copiar, que elas ficam
              decididas para este nível.
            </p>
          </form>
        )}
      </Modal>

      {/* ================= Modal de autorização ================= */}
      <Modal
        titulo={editando ? `Alterar acesso — ${editando.email}` : 'Autorizar novo acesso'}
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        rodape={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFormAberto(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="form-usuario"
              className="btn btn-primary"
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Autorizar acesso'}
            </button>
          </>
        }
      >
        <form id="form-usuario" onSubmit={autorizar}>
          <div className="field" style={{ marginBottom: 20 }}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={formulario.email}
              onChange={(e) => setFormulario({ ...formulario, email: e.target.value })}
              placeholder="nome@julianoltransportes.com.br"
              required
              disabled={editando !== null}
            />
            {editando && (
              <p className="field-hint">
                O e-mail não muda: ele é a identidade da conta. Revogue e autorize outro, se for o
                caso.
              </p>
            )}
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                value={formulario.nome}
                onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="cargo">Cargo</label>
              <input
                id="cargo"
                value={formulario.cargo}
                onChange={(e) => setFormulario({ ...formulario, cargo: e.target.value })}
                placeholder="Coordenador de operações"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="nivel">Nível de acesso</label>
            <select
              id="nivel"
              value={formulario.nivel}
              onChange={(e) => setFormulario({ ...formulario, nivel: e.target.value as Nivel })}
            >
              {niveis.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.rotulo}
                </option>
              ))}
            </select>
            {DESCRICAO_NIVEL[formulario.nivel] && (
              <p className="field-hint">{DESCRICAO_NIVEL[formulario.nivel]}</p>
            )}
          </div>

          {formulario.nivel === 'admin' && (
            <p className={estilos.avisoAdmin}>
              Administrador vê e altera tudo, inclusive custos, margens e os acessos dos outros
              usuários. Conceda apenas a quem precisa desse alcance.
            </p>
          )}

          {!editando && (
            <p className={estilos.avisoFluxo}>
              Ao salvar, a pessoa poderá criar a própria senha na tela de entrada usando este
              e-mail. Nenhuma senha é definida aqui.
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
