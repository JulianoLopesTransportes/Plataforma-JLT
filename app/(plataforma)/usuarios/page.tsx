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
import { usuarios as apiUsuarios, type UsuarioAdmin } from '@/lib/api/admin';
import { iniciais } from '@/lib/auth';
import { MATRIZ_PERMISSOES, ROTULO_NIVEL, type Nivel, type Acesso } from '@/lib/permissoes';
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

const NIVEIS: Nivel[] = ['admin', 'financeiro', 'operacional', 'comercial'];

const ROTULO_ACESSO: Record<Acesso, string> = {
  crud: 'Total',
  r: 'Leitura',
  none: 'Sem acesso',
};

const DESCRICAO_NIVEL: Record<Nivel, string> = {
  admin: 'Acesso total. Único que gerencia usuários e parâmetros do sistema.',
  financeiro: 'Faturamento, custos e relatórios financeiros. Leitura no operacional e comercial.',
  operacional: 'Frota, motoristas, agenda e rotas. Sem acesso a dados financeiros.',
  comercial: 'Clientes, orçamentos e documentos. Sem custo interno nem margem.',
};

const FORM_VAZIO = { email: '', nome: '', cargo: '', nivel: 'comercial' as Nivel };

export default function PaginaUsuarios() {
  const usuarioAtual = useUsuario();
  const { recarregar } = useSessao();
  const { mostrar } = useToast();

  const [aba, setAba] = useState('usuarios');
  const [lista, setLista] = useState<UsuarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [formAberto, setFormAberto] = useState(false);
  const [formulario, setFormulario] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);

  const modulos = Object.keys(MATRIZ_PERMISSOES) as ModuloId[];

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

      <div className={estilos.explicacao}>
        <strong>Como o acesso é concedido.</strong> Você autoriza o e-mail aqui, definindo o nível.
        A pessoa então cria a própria senha na tela de entrada — a senha nunca passa por esta tela.
        E-mail que não estiver nesta lista tem o cadastro recusado pelo banco.
      </div>

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
                        texto={ROTULO_NIVEL[u.nivel]}
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
                  {NIVEIS.map((n) => (
                    <th key={n} style={{ textAlign: 'center' }}>
                      {ROTULO_NIVEL[n]}
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
                    {NIVEIS.map((nivel) => {
                      const acesso = MATRIZ_PERMISSOES[modulo][nivel];
                      return (
                        <td key={nivel} style={{ textAlign: 'center' }}>
                          <span
                            className={`${estilos.pastilha} ${
                              acesso === 'crud'
                                ? estilos.acessoCrud
                                : acesso === 'r'
                                  ? estilos.acessoR
                                  : estilos.acessoNone
                            }`}
                            title={ROTULO_ACESSO[acesso]}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={estilos.nota}>
            A matriz é a regra de acesso do sistema e existe em dois lugares que precisam
            concordar: <code>lib/permissoes.ts</code>, que controla a interface, e a tabela{' '}
            <code>permissoes_modulo</code> no Postgres, que o RLS consulta. A duplicação é
            proposital — uma policy do banco não consegue ler um objeto TypeScript, e é o banco que
            garante a regra mesmo contra acesso direto à API.
          </p>

          <p className={estilos.nota}>
            Dois recortes não cabem numa matriz por módulo e vivem como capacidades transversais: o
            Comercial usa a calculadora mas não vê custo nem margem, e o Operacional vê custo
            operacional mas não vê faturamento. Para alterar a matriz é preciso mudar o código e o
            banco juntos — por isso ela não é editável por esta tela.
          </p>
        </>
      )}

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
              {NIVEIS.map((n) => (
                <option key={n} value={n}>
                  {ROTULO_NIVEL[n]}
                </option>
              ))}
            </select>
            <p className="field-hint">{DESCRICAO_NIVEL[formulario.nivel]}</p>
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
