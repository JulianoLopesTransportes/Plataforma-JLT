'use client';

/**
 * USUÁRIOS — módulo novo. Exclusivo do Administrador (ver MATRIZ_PERMISSOES).
 *
 * Além de listar os usuários, exibe a matriz de permissões inteira. Isso é
 * proposital: a matriz é a regra de acesso do sistema, e poder consultá-la
 * na tela evita que alguém precise abrir o código para saber quem enxerga
 * o quê. A tabela é renderizada a partir do MESMO objeto que governa a
 * aplicação, então não há como ela ficar desatualizada.
 */

import { useState } from 'react';
import { useUsuario } from '@/components/layout/SessaoProvider';
import { USUARIOS_TESTE, iniciais } from '@/lib/auth';
import { MATRIZ_PERMISSOES, ROTULO_NIVEL, type Nivel, type Acesso } from '@/lib/permissoes';
import { rotuloDoModulo } from '@/lib/navegacao';
import { TituloPagina, Abas, Badge, GradeMetricas, CardMetrica } from '@/components/ui';
import type { ModuloId } from '@/lib/permissoes';
import estilos from './usuarios.module.css';

const NIVEIS: Nivel[] = ['admin', 'financeiro', 'operacional', 'comercial'];

const ROTULO_ACESSO: Record<Acesso, string> = {
  crud: 'Total',
  r: 'Leitura',
  none: 'Sem acesso',
};

export default function PaginaUsuarios() {
  const usuario = useUsuario();
  const [aba, setAba] = useState('usuarios');

  const modulos = Object.keys(MATRIZ_PERMISSOES) as ModuloId[];

  return (
    <>
      <TituloPagina
        titulo="Usuários e permissões"
        subtitulo="Quem acessa a plataforma e o que cada nível enxerga."
        acoes={
          <button
            type="button"
            className="btn btn-primary"
            disabled
            title="O cadastro de usuários entra junto com a autenticação real"
          >
            Novo usuário
          </button>
        }
      />

      <div className={estilos.avisoFase}>
        <strong>Fase de mocks.</strong> Os quatro usuários abaixo são fixos, existem apenas para
        conferir a visão de cada nível e não têm senha. O cadastro real de usuários entra junto
        com a autenticação — ver o aviso no topo de <code>lib/auth.ts</code>.
      </div>

      <GradeMetricas>
        <CardMetrica
          rotulo="Usuários ativos"
          valor={String(USUARIOS_TESTE.length)}
          detalhe="Um por nível de acesso"
          icone="usuarios"
        />
        <CardMetrica
          rotulo="Níveis de acesso"
          valor={String(NIVEIS.length)}
          detalhe="Admin, Financeiro, Operacional, Comercial"
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
          { chave: 'usuarios', rotulo: 'Usuários' },
          { chave: 'matriz', rotulo: 'Matriz de permissões' },
        ]}
        ativa={aba}
        aoTrocar={setAba}
      />

      {aba === 'usuarios' && (
        <div className={estilos.gradeUsuarios}>
          {USUARIOS_TESTE.map((u) => (
            <div key={u.id} className={`card ${estilos.cartaoUsuario}`}>
              <div className={estilos.avatarGrande}>{iniciais(u.nome)}</div>

              <div className={estilos.dadosUsuario}>
                <strong>{u.nome}</strong>
                <span className="texto-secundario">{u.cargo}</span>
                <span className={estilos.email}>{u.email}</span>
                <div className={estilos.marcadores}>
                  <Badge
                    texto={ROTULO_NIVEL[u.nivel]}
                    tom={u.nivel === 'admin' ? 'danger' : 'info'}
                  />
                  {u.id === usuario.id && <Badge texto="Sessão atual" tom="success" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
            Esta tabela é gerada a partir do objeto <code>MATRIZ_PERMISSOES</code>, o mesmo que
            governa a sidebar, a guarda de rota e os botões desabilitados. Não existe segunda
            fonte: mudar a regra em <code>lib/permissoes.ts</code> muda o sistema e esta tela ao
            mesmo tempo.
          </p>

          <p className={estilos.nota}>
            Dois recortes não cabem numa matriz de módulo e vivem como capacidades transversais:
            o Comercial usa a calculadora de orçamento mas não vê custo nem margem, e o
            Operacional vê custo operacional mas não vê faturamento. Ambos saem de{' '}
            <code>podeFazer()</code>.
          </p>
        </>
      )}
    </>
  );
}
