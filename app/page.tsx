'use client';

/**
 * TELA DE LOGIN — autenticação simulada.
 *
 * Ver o aviso completo no topo de lib/auth.ts: não há senha, hash nem token.
 * Os quatro perfis de teste ficam expostos de propósito, para permitir
 * alternar de nível e conferir como cada um enxerga a plataforma.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { USUARIOS_TESTE, usuarioPorEmail, entrar, sessaoAtual } from '@/lib/auth';
import { ROTULO_NIVEL } from '@/lib/permissoes';
import estilos from './login.module.css';

export default function PaginaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  // Quem já tem sessão não precisa passar por aqui de novo.
  useEffect(() => {
    if (sessaoAtual()) router.replace('/dashboard');
  }, [router]);

  function selecionarPerfil(emailPerfil: string) {
    setEmail(emailPerfil);
    setErro('');
  }

  function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();

    const usuario = usuarioPorEmail(email);
    if (!usuario) {
      setErro('E-mail não encontrado. Use um dos perfis de teste listados abaixo.');
      return;
    }

    // A senha não é verificada — ver aviso em lib/auth.ts.
    entrar(usuario);
    router.replace('/dashboard');
  }

  return (
    <div className={estilos.tela}>
      <section className={estilos.painelMarca}>
        <div className={estilos.placaLogo}>
          <Image
            src="/logo-jlt.png"
            alt="Juliano Lopes Transportes"
            width={420}
            height={280}
            priority
            style={{ width: '100%', height: 'auto' }}
          />
        </div>

        <h1 className={estilos.chamada}>
          Plataforma <span className={estilos.chamadaDourada}>interna</span>
        </h1>

        <p className={estilos.subchamada}>
          Clientes, agenda, rotas, frota e financeiro em um lugar só. Acesso restrito à equipe
          Juliano Lopes Transportes.
        </p>

        <p className={estilos.marcaRodape}>
          Juliano Lopes Transportes — uso interno. Não compartilhe este endereço.
        </p>
      </section>

      <section className={estilos.painelForm}>
        <form className={estilos.form} onSubmit={aoEnviar}>
          <h2 className={estilos.titulo}>Entrar</h2>
          <p className={estilos.subtitulo}>Informe seu e-mail corporativo para acessar.</p>

          {erro && <div className={estilos.erro}>{erro}</div>}

          <div className={`field ${estilos.campo}`}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@julianoltransportes.com.br"
              autoComplete="username"
              required
            />
          </div>

          <div className={`field ${estilos.campo}`}>
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Qualquer valor nesta fase"
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className={`btn btn-primary ${estilos.botaoEntrar}`}>
            Entrar na plataforma
          </button>

          <div className={estilos.perfis}>
            <div className={estilos.perfisTitulo}>Perfis de teste — um por nível</div>
            <div className={estilos.listaPerfis}>
              {USUARIOS_TESTE.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`${estilos.perfil} ${email === u.email ? estilos.perfilSelecionado : ''}`}
                  onClick={() => selecionarPerfil(u.email)}
                >
                  <span className={estilos.perfilNivel}>{ROTULO_NIVEL[u.nivel]}</span>
                  <span className={estilos.perfilNome}>{u.nome}</span>
                </button>
              ))}
            </div>
          </div>

          <p className={estilos.avisoMock}>
            <strong>Autenticação simulada.</strong> Esta fase não tem senha, hash nem token — a
            sessão fica no navegador e qualquer senha é aceita. Serve para conferir a visão de cada
            nível. Autenticação real entra junto com o banco de dados.
          </p>
        </form>
      </section>
    </div>
  );
}
