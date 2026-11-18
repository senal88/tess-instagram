import pb from '@/lib/pocketbase/client'
import type {
  Conversa,
  EnvioRespostaPayload,
  EnvioRespostaResultado,
  Mensagem,
  Situacao,
} from '@/types/support'

export async function listarConversas() {
  return pb.collection('conversas').getFullList<Conversa>({
    sort: '-ultima_mensagem_data',
    expand: 'cliente_id,atendente_responsavel',
  })
}

export async function obterConversa(conversaId: string) {
  return pb.collection('conversas').getOne<Conversa>(conversaId, {
    expand: 'cliente_id,atendente_responsavel',
  })
}

/**
 * Zera o contador de não lidas da conversa no servidor (ação no servidor via endpoint ou fallback de update).
 * "Ao abrir a conversa: o contador de não lidas zera e o atendente pode passar a situação para 'em atendimento'"
 */
export async function zerarNaoLidas(conversaId: string) {
  try {
    const res = await pb.send<{ id: string; nao_lidas: number; situacao: Situacao }>(
      `/backend/v1/conversas/${encodeURIComponent(conversaId)}/abrir`,
      { method: 'POST' },
    )
    return res
  } catch {
    // Fallback caso chamada direta falhe
    return pb.collection('conversas').update<Conversa>(conversaId, { nao_lidas: 0 })
  }
}

/**
 * Histórico completo SEM paginação visível:
 * "O histórico mostra tudo: conversa de 50 mensagens abre com as 50" — carregue todas as mensagens da conversa.
 */
export async function listarMensagens(conversaId: string) {
  return pb.collection('mensagens').getFullList<Mensagem>({
    filter: pb.filter('conversa_id = {:id}', { id: conversaId }),
    sort: 'data_hora',
    expand: 'atendente_id',
  })
}

export async function atualizarSituacao(
  conversa: Conversa,
  novaSituacao: Situacao,
  usuarioId: string,
) {
  await pb.collection('mudancas_situacao').create({
    conversa_id: conversa.id,
    situacao_anterior: conversa.situacao,
    situacao_nova: novaSituacao,
    usuario_id: usuarioId,
  })
  return pb.collection('conversas').update<Conversa>(conversa.id, { situacao: novaSituacao })
}

/**
 * Envia uma resposta pela via oficial da Meta através do endpoint do servidor.
 * Requer confirmação humana explícita prévia no cliente.
 * Aceita chave de idempotência para evitar envios duplicados em cliques repetidos.
 */
export async function enviarRespostaOficial(payload: EnvioRespostaPayload) {
  return pb.send<EnvioRespostaResultado>('/backend/v1/mensagens/enviar', {
    method: 'POST',
    body: payload,
  })
}

export const inscreverConversas = (callback: () => void) =>
  pb.collection('conversas').subscribe('*', callback)

export const inscreverMensagens = (callback: () => void) =>
  pb.collection('mensagens').subscribe('*', callback)

export const inscreverMudancas = (callback: () => void) =>
  pb.collection('mudancas_situacao').subscribe('*', callback)

export async function cancelarInscricoes() {
  await Promise.all([
    pb.collection('conversas').unsubscribe(),
    pb.collection('mensagens').unsubscribe(),
    pb.collection('mudancas_situacao').unsubscribe(),
  ])
}
