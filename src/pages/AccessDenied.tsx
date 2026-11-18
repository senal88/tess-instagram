import { ShieldX } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, podeAcessarInbox } from '@/contexts/AuthContext'

export default function AccessDenied() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  if (!usuario) return <Navigate to="/login" replace />
  if (podeAcessarInbox(usuario)) return <Navigate to="/" replace />
  return (
    <main className="auth-page">
      <section className="auth-card denied-card">
        <div className="denied-icon">
          <ShieldX size={36} />
        </div>
        <h1>Acesso negado</h1>
        <p className="auth-description">
          Sua conta não faz parte da equipe de atendimento. Fale com um administrador para solicitar
          acesso.
        </p>
        <button
          className="primary-button"
          onClick={() => {
            logout()
            navigate('/login')
          }}
        >
          Sair
        </button>
      </section>
    </main>
  )
}
