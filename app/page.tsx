'use client';

/**
 * ENTRADA DA PLATAFORMA — autenticação real (Supabase Auth).
 *
 * Três modos na mesma tela: entrar, criar acesso e recuperar senha.
 *
 * "Criar acesso" existe porque o cadastro é uma LISTA DE CONVIDADOS: o
 * banco rejeita e-mail que o administrador não tenha autorizado antes.
 * Quem foi autorizado define a própria senha aqui, e ela nunca passa por
 * nenhum outro lugar.
 */

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { entrar, criarAcesso, recuperarSenha } from '@/lib/auth';
import { supabaseConfigurado } from '@/lib/supabase/cliente';
import estilos from './login.module.css';

type Modo = 'entrar' | 'criar' | 'recuperar';

const TITULO: Record<Modo, string> = {
  entrar: 'Entrar',
  criar: 'Criar acesso',
  recuperar: 'Recuperar senha',
};

const SUBTITULO: Record<Modo, string> = {
  entrar: 'Informe seu e-mail corporativo para acessar.',
  criar: 'Defina sua senha. Seu e-mail precisa ter sido autorizado pelo administrador.',
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
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Sem as variáveis de ambiente não há como autenticar. Melhor dizer isso
  // com todas as letras do que deixar o formulário falhar sem explicação.
  const configurado = supabaseConfigurado();

  function trocarModo(novo: Modo) {
    setModo(novo);
    setErro('');
    setAviso('');
    setSenha('');
  }

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');
    setEnviando(true);

    try {
      if (modo === 'entrar') {
        const r = await entrar(email, senha);
        if (!r.ok) {
          setErro(r.erro!);
          return;
        }
        // O middleware assume daqui: refresh recarrega já autenticado.
        router.replace(parametros.get('destino') ?? '/dashboard');
        router.refresh();
        return;
      }

      if (modo === 'criar') {
        const r = await criarAcesso(email, senha);
        if (!r.ok) {
          setErro(r.erro!);
          return;
        }
        setAviso(
          'Acesso criado. Se a confirmação por e-mail estiver ativa, confirme pelo link enviado; caso contrário, já pode entrar.',
        );
        setModo('entrar');
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
          <h2 className={estilos.titulo}>{TITULO[modo]}</h2>
          <p className={estilos.subtitulo}>{SUBTITULO[modo]}</p>

          {!configurado && (
            <div className={estilos.erro}>
              <strong>Configuração pendente.</strong> As variáveis do Supabase não estão definidas
              neste ambiente, então o acesso não funciona. Defina{' '}
              <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
              <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> nas variáveis de ambiente do
              projeto.
            </div>
          )}

          {erro && <div className={estilos.erro}>{erro}</div>}
          {aviso && <div className={estilos.sucesso}>{aviso}</div>}

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

          {modo !== 'recuperar' && (
            <div className={`field ${estilos.campo}`}>
              <label htmlFor="senha">Senha</label>
              <input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                minLength={6}
                required
              />
              {modo === 'criar' && (
                <p className="field-hint">Mínimo de 6 caracteres.</p>
              )}
            </div>
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
                Primeiro acesso — definir senha
              </button>
            )}
            {modo !== 'recuperar' && (
              <button type="button" onClick={() => trocarModo('recuperar')}>
                Esqueci minha senha
              </button>
            )}
          </div>

          <p className={estilos.avisoAcesso}>
            O acesso é concedido pelo administrador. Se o seu e-mail ainda não foi autorizado, o
            cadastro será recusado — fale com a administração.
          </p>
        </form>
      </section>
    </div>
  );
}
