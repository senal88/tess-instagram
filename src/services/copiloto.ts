import pb from '@/lib/pocketbase/client'
import type { ConfiguracoesIA, CopilotoRegistro, SituacaoRascunho } from '@/types/support'

export interface RespostaResumo {
  sucesso: boolean
  resumo: string
  data: string
  solicitado_por: {
    id: string
    name: string
  }
}

export interface RespostaSugestao {
  sucesso: boolean
  rascunho_texto: string
  rascunho_situacao: SituacaoRascunho
  data: string
  solicitado_por: {
    id: string
    name: string
  }
}

export async function solicitarResumoConversa(conversaId: string): Promise<RespostaResumo> {
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || window.location.origin
  const res = await fetch(`${baseUrl}/backend/v1/copiloto/resumir`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify({ conversa_id: conversaId }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao solicitar resumo da conversa à IA.')
  }
  return data
}

export async function solicitarSugestaoResposta(conversaId: string): Promise<RespostaSugestao> {
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || window.location.origin
  const res = await fetch(`${baseUrl}/backend/v1/copiloto/sugerir-resposta`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify({ conversa_id: conversaId }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao solicitar sugestão de resposta à IA.')
  }
  return data
}

export async function salvarRascunho(
  conversaId: string,
  rascunhoTexto: string,
  rascunhoSituacao: SituacaoRascunho,
): Promise<{ sucesso: boolean; rascunho_texto: string; rascunho_situacao: SituacaoRascunho }> {
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || window.location.origin
  const res = await fetch(`${baseUrl}/backend/v1/copiloto/salvar-rascunho`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify({
      conversa_id: conversaId,
      rascunho_texto: rascunhoTexto,
      rascunho_situacao: rascunhoSituacao,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao salvar rascunho.')
  }
  return data
}

export async function obterRegistrosCopiloto(conversaId: string): Promise<CopilotoRegistro[]> {
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || window.location.origin
  const res = await fetch(`${baseUrl}/backend/v1/copiloto/registros/${conversaId}`, {
    method: 'GET',
    headers: {
      Authorization: pb.authStore.token,
    },
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao carregar histórico do copiloto.')
  }
  return data.registros || []
}

export async function obterConfiguracoesIA(): Promise<ConfiguracoesIA> {
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || window.location.origin
  const res = await fetch(`${baseUrl}/backend/v1/copiloto/configuracoes`, {
    method: 'GET',
    headers: {
      Authorization: pb.authStore.token,
    },
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao buscar configurações de IA.')
  }
  return data
}

export async function salvarConfiguracoesIA(
  tomDeVoz: string,
  instrucoesFixas: string,
): Promise<ConfiguracoesIA> {
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || window.location.origin
  const res = await fetch(`${baseUrl}/backend/v1/copiloto/configuracoes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify({
      tom_de_voz: tomDeVoz,
      instrucoes_fixas: instrucoesFixas,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao salvar configurações de IA.')
  }
  return data
}
