import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'
import { entrar, sair, usuarioAtual } from '@/services/auth'
import type { Usuario } from '@/types/support'

type AuthContextValue = {
  usuario: Usuario | null
  carregando: boolean
  login: (email: string, senha: string) => Promise<Usuario>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(usuarioAtual())
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => setUsuario(usuarioAtual()))
    const validate = async () => {
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh()
        } catch {
          sair()
        }
      }
      setUsuario(usuarioAtual())
      setCarregando(false)
    }
    void validate()
    return unsubscribe
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      usuario,
      carregando,
      login: async (email, senha) => {
        const user = await entrar(email, senha)
        setUsuario(user)
        return user
      },
      logout: () => {
        sair()
        setUsuario(null)
      },
    }),
    [usuario, carregando],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth precisa ser usado dentro de AuthProvider')
  return context
}

export const podeAcessarInbox = (usuario: Usuario | null) =>
  usuario?.role === 'admin' || usuario?.role === 'atendente'
