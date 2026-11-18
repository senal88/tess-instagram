import pb from '@/lib/pocketbase/client'
import type { Usuario } from '@/types/support'

export const usuarioAtual = () => pb.authStore.record as Usuario | null

export async function entrar(email: string, senha: string) {
  const auth = await pb.collection('users').authWithPassword(email, senha)
  return auth.record as Usuario
}

export function sair() {
  pb.authStore.clear()
}

export function solicitarRedefinicao(email: string) {
  return pb.collection('users').requestPasswordReset(email)
}

export function redefinirSenha(token: string, senha: string, confirmacao: string) {
  return pb.collection('users').confirmPasswordReset(token, senha, confirmacao)
}

export function verificarEmail(token: string) {
  return pb.collection('users').confirmVerification(token)
}

export function solicitarTrocaEmail(novoEmail: string) {
  return pb.collection('users').requestEmailChange(novoEmail)
}

export function confirmarTrocaEmail(token: string, senha: string) {
  return pb.collection('users').confirmEmailChange(token, senha)
}
