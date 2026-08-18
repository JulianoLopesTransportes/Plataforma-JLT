'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { entrar, criarAcesso, recuperarSenha } from '@/lib/auth';
import { supabaseConfigurado } from '@/lib/supabase/cliente';
import {
  conferirSenha,
  senhaValida,
  usuarioValido,
  sugerirUsuario,
  REGRA_USUARIO,
} from '@/lib/senha';
import estilos from './login.module.css';

type Modo = 'entrar' | 'criar' | 'recuperar';

const TITULO: Record<Modo, string> = {
  entrar: 'Entrar',
  criar: 'Criar acesso',
  recuperar: 'Recuperar senha',
};

const SUBTITULO: Record<Modo, string> = {
  entrar: 'Informe seu e-mail e senha para acessar.',
  criar: 'Preencha seus dados e defina uma senha.',
  recuperar: 'Enviaremos um link para você definir uma nova senha.',
};

export default function PaginaEntrada() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}

function Formulario() {
  const router = useRouter();
  const parametros = useSearchParams();

  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
  const [usuario, setUsuario] = useState('');
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const configurado = supabaseConfigurado();
  const regras = conferirSenha(senha);

  function trocarModo(novo: Modo) {
    setModo(novo);
    setErro('');
    setAviso('');
    setSenha('');
  }

  /** Sugere o usuário a partir do nome, até a pessoa editar o campo. */
  function aoMudarNome(valor: string) {
    setNome(valor);
    if (!usuarioTocado) setUsuario(sugerirUsuario(valor));
  }

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');

    if (modo === 'criar') {
      if (nome.trim().split(/\s+/).length < 2) {
        setErro('Informe o nome completo — nome e sobrenome.');
        return;
      }
      if (!usuarioValido(usuario)) {
        setErro(`Nome de usuário inválido. ${REGRA_USUARIO}`);
        return;
      }
      if (!senhaValida(senha)) {
        setErro('A senha não atende a todos os requisitos listados abaixo.');
        return;
      }
    }

    setEnviando(true);

    try {
      if (modo === 'entrar') {
        const r = await entrar(email, senha);
        if (!r.ok) {
          setErro(r.erro!);
          return;
        }
        router.replace(parametros.get('destino') ?? '/dashboard');
        router.refresh();
        return;
      }

      if (modo === 'criar') {
        const r = await criarAcesso({ email, senha, nome, usuario });
        if (!r.ok) {
          setErro(r.erro!);
          return;
        }
        setAviso(
          'Acesso criado. Se a confirmação por e-mail estiver ativa, confirme pelo link enviado; caso contrário, já pode entrar.',
        );
        setModo('entrar');
        setSenha('');
        return;
      }

      const r = await recuperarSenha(email);
      if (!r.ok) {
        setErro(r.erro!);
        return;
      }
      setAviso('Se este e-mail tiver acesso, o link de redefinição chegará em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={estilos.tela}>
      <section className={estilos.painelMarca}>
        <div className={estilos.placaLogo}>
          <Image
            src="/logo-jlt.png"
            alt="Juliano Lopes Transportes"
            width={420}
            height={193}
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
          <h2 className={estilos.titulo}>{TITULO[modo]}</h2>
          <p className={estilos.subtitulo}>{SUBTITULO[modo]}</p>

          {!configurado && (
            <div className={estilos.erro}>
              <strong>Configuração pendente.</strong> As variáveis do Supabase não estão definidas
              neste ambiente.
            </div>
          )}

          {erro && <div className={estilos.erro}>{erro}</div>}
          {aviso && <div className={estilos.sucesso}>{aviso}</div>}

          {modo === 'criar' && (
            <>
              <div className={`field ${estilos.campo}`}>
                <label htmlFor="nome">Nome completo</label>
                <input
                  id="nome"
                  value={nome}
                  onChange={(e) => aoMudarNome(e.target.value)}
                  placeholder="Maria Aparecida Souza"
                  autoComplete="name"
                  required
                />
              </div>

              <div className={`field ${estilos.campo}`}>
                <label htmlFor="usuario">Nome de usuário</label>
                <input
                  id="usuario"
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value);
                    setUsuarioTocado(true);
                  }}
                  placeholder="maria.souza"
                  autoComplete="username"
                  required
                />
                <p className="field-hint">{REGRA_USUARIO}</p>
              </div>
            </>
          )}

          <div className={`field ${estilos.campo}`}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />
          </div>

          {modo !== 'recuperar' && (
            <div className={`field ${estilos.campo}`}>
              <label htmlFor="senha">Senha</label>
              <input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                required
              />
            </div>
          )}

          {modo === 'criar' && (
            <ul className={estilos.regras}>
              {regras.map((r) => (
                <li key={r.id} className={r.ok ? estilos.regraOk : estilos.regraPendente}>
                  <span aria-hidden="true">{r.ok ? '✓' : '○'}</span>
                  {r.rotulo}
                </li>
              ))}
            </ul>
          )}

          <button
            type="submit"
            className={`btn btn-primary ${estilos.botaoEntrar}`}
            disabled={enviando || !configurado}
          >
            {enviando
              ? 'Aguarde…'
              : modo === 'entrar'
                ? 'Entrar na plataforma'
                : modo === 'criar'
                  ? 'Criar meu acesso'
                  : 'Enviar link'}
          </button>

          <div className={estilos.alternar}>
            {modo !== 'entrar' && (
              <button type="button" onClick={() => trocarModo('entrar')}>
                Já tenho acesso — entrar
              </button>
            )}
            {modo !== 'criar' && (
              <button type="button" onClick={() => trocarModo('criar')}>
                Primeiro acesso — criar cadastro
              </button>
            )}
            {modo !== 'recuperar' && (
              <button type="button" onClick={() => trocarModo('recuperar')}>
                Esqueci minha senha
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
