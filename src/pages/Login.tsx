import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Instagram, Loader2 } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth, podeAcessarInbox } from '@/contexts/AuthContext'

export default function Login() {
  const { usuario, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (usuario) return <Navigate to={podeAcessarInbox(usuario) ? '/' : '/access-denied'} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const user = await login(email.trim(), senha)
      navigate(podeAcessarInbox(user) ? '/' : '/access-denied', { replace: true })
    } catch {
      setErro('E-mail ou senha incorretos')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card animate-fade-in-up">
        <div className="brand-mark">
          <Instagram size={28} />
        </div>
        <h1>Central de Atendimento</h1>
        <p className="auth-kicker">Instagram Direct</p>
        <p className="auth-description">
          Organize conversas e acompanhe cada atendimento em um só lugar.
        </p>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@empresa.com"
            required
            autoComplete="email"
          />
          <label htmlFor="senha">Senha</label>
          <div className="password-field">
            <input
              id="senha"
              type={mostrarSenha ? 'text' : 'password'}
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="Digite sua senha"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((value) => !value)}
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {erro && (
            <p className="form-error" role="alert">
              {erro}
            </p>
          )}
          <button className="primary-button" disabled={enviando} type="submit">
            {enviando ? (
              <>
                <Loader2 className="spin" size={17} /> Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>
          <Link className="text-link" to="/forgot-password">
            Esqueci minha senha
          </Link>
        </form>
      </section>
    </main>
  )
}
