import { useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Inbox, Instagram, Link as LinkIcon, LogOut, Menu, Settings, X } from 'lucide-react'
import { podeAcessarInbox, useAuth } from '@/contexts/AuthContext'

export default function Layout() {
  const { usuario, carregando, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)

  if (carregando)
    return (
      <main className="app-loading">
        <div className="brand-mark">
          <Instagram />
        </div>
        <p>Carregando sua inbox...</p>
      </main>
    )
  if (!usuario) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!podeAcessarInbox(usuario)) return <Navigate to="/access-denied" replace />

  const signOut = () => {
    logout()
    navigate('/login', { replace: true })
  }
  const initials =
    usuario.name
      ?.split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'AT'

  const navContent = (
    <>
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <Instagram size={22} />
        </div>
        <div>
          <strong>Central de</strong>
          <span>Atendimento</span>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        <button
          className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
          onClick={() => {
            navigate('/')
            setDrawer(false)
          }}
        >
          <Inbox size={19} />
          <span>Inbox</span>
          {location.pathname === '/' && <i />}
        </button>
        <button
          className={`nav-item ${location.pathname.startsWith('/conexao') ? 'active' : ''}`}
          onClick={() => {
            navigate('/conexao')
            setDrawer(false)
          }}
        >
          <LinkIcon size={19} />
          <span>Conexão Meta</span>
          {location.pathname.startsWith('/conexao') && <i />}
        </button>
      </nav>
      <div className="sidebar-user">
        <div className="user-row">
          <div className="user-avatar">{initials}</div>
          <div className="user-copy">
            <strong>{usuario.name || 'Atendente'}</strong>
            <span>{usuario.role === 'admin' ? 'Administrador' : 'Atendente'}</span>
          </div>
        </div>
        <button
          className="settings-link"
          onClick={() => {
            navigate('/change-email')
            setDrawer(false)
          }}
        >
          <Settings size={17} />
          <span>Trocar e-mail</span>
        </button>
        <button className="logout-button" onClick={signOut}>
          <LogOut size={17} />
          <span>Sair</span>
        </button>
      </div>
    </>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">{navContent}</aside>
      <header className="mobile-header">
        <button onClick={() => setDrawer(true)} aria-label="Abrir menu">
          <Menu />
        </button>
        <div>
          <Instagram size={21} />
          <strong>Central de Atendimento</strong>
        </div>
        <span />
      </header>
      {drawer && (
        <div className="drawer-overlay" onClick={() => setDrawer(false)}>
          <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <button
              className="drawer-close"
              onClick={() => setDrawer(false)}
              aria-label="Fechar menu"
            >
              <X />
            </button>
            {navContent}
          </aside>
        </div>
      )}
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}
