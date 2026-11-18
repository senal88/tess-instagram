import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Instagram, KeyRound, Loader2, Mail } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  confirmarTrocaEmail,
  redefinirSenha,
  solicitarRedefinicao,
  solicitarTrocaEmail,
  verificarEmail,
} from '@/services/auth'
import { useAuth } from '@/contexts/AuthContext'

function PageShell({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <main className="auth-page">
      <section className="auth-card animate-fade-in-up">
        <div className="brand-mark">{icon}</div>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
    </main>
  )
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await solicitarRedefinicao(email.trim())
      setSent(true)
    } finally {
      setLoading(false)
    }
  }
  return (
    <PageShell
      icon={<KeyRound size={26} />}
      title="Recuperar senha"
      description="Informe seu e-mail e enviaremos as instruções para criar uma nova senha."
    >
      {sent ? (
        <div className="success-box">
          <CheckCircle2 size={20} />
          <span>Se o e-mail estiver cadastrado, você receberá o link em instantes.</span>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
          />
          <button className="primary-button" disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : 'Enviar instruções'}
          </button>
        </form>
      )}
      <Link className="text-link auth-back" to="/login">
        Voltar para o login
      </Link>
    </PageShell>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (senha.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.')
    if (senha !== confirmacao) return setError('As senhas não coincidem.')
    try {
      await redefinirSenha(token, senha, confirmacao)
      setMessage('Senha atualizada com sucesso. Você já pode entrar.')
    } catch {
      setError('Este link é inválido ou expirou. Solicite um novo link.')
    }
  }
  return (
    <PageShell
      icon={<KeyRound size={26} />}
      title="Criar nova senha"
      description="Escolha uma senha segura para sua conta."
    >
      {message ? (
        <div className="success-box">
          <CheckCircle2 size={20} />
          {message}
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="senha">Nova senha</label>
          <input
            id="senha"
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <label htmlFor="confirmacao">Confirmar nova senha</label>
          <input
            id="confirmacao"
            type="password"
            required
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={!token}>
            Atualizar senha
          </button>
        </form>
      )}
      <Link className="text-link auth-back" to="/login">
        Ir para o login
      </Link>
    </PageShell>
  )
}

export function VerifyEmail() {
  const [params] = useSearchParams()
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setState('error')
      return
    }
    verificarEmail(token)
      .then(() => setState('success'))
      .catch(() => setState('error'))
  }, [params])
  return (
    <PageShell
      icon={<Mail size={26} />}
      title="Verificação de e-mail"
      description={
        state === 'loading'
          ? 'Estamos verificando seu e-mail...'
          : state === 'success'
            ? 'Seu e-mail foi verificado com sucesso.'
            : 'Este link é inválido ou já expirou.'
      }
    >
      {state === 'loading' && <Loader2 className="spin centered" />}
      {state !== 'loading' && (
        <Link className="primary-button button-link" to="/login">
          Ir para o login
        </Link>
      )}
    </PageShell>
  )
}

export function ChangeEmail() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    await solicitarTrocaEmail(email.trim())
    setSent(true)
  }
  return (
    <PageShell
      icon={<Mail size={26} />}
      title="Trocar e-mail"
      description="Enviaremos uma confirmação para o novo endereço."
    >
      {sent ? (
        <div className="success-box">
          <CheckCircle2 size={20} />
          Confira a caixa de entrada do novo e-mail.
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="novo-email">Novo e-mail</label>
          <input
            id="novo-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="primary-button">Solicitar troca</button>
        </form>
      )}
      <Link className="text-link auth-back" to="/">
        Voltar para a inbox
      </Link>
    </PageShell>
  )
}

export function ConfirmEmailChange() {
  const [params] = useSearchParams()
  const { logout } = useAuth()
  const [senha, setSenha] = useState('')
  const [state, setState] = useState<'form' | 'success' | 'error'>('form')
  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await confirmarTrocaEmail(params.get('token') || '', senha)
      logout()
      setState('success')
    } catch {
      setState('error')
    }
  }
  return (
    <PageShell
      icon={<Instagram size={26} />}
      title="Confirmar novo e-mail"
      description="Digite sua senha atual para concluir a alteração."
    >
      {state === 'success' ? (
        <div className="success-box">
          <CheckCircle2 size={20} />
          E-mail alterado. Entre novamente com o novo endereço.
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="senha-atual">Senha atual</label>
          <input
            id="senha-atual"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          {state === 'error' && (
            <p className="form-error">
              Não foi possível alterar o e-mail. Verifique o link e a senha.
            </p>
          )}
          <button className="primary-button">Confirmar alteração</button>
        </form>
      )}
      <Link className="text-link auth-back" to="/login">
        Ir para o login
      </Link>
    </PageShell>
  )
}
