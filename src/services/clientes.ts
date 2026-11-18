import pb from '@/lib/pocketbase/client'
import type { Cliente, Conversa, NotaInterna } from '@/types/support'

/**
 * Obtém ou resolve o registro do cliente a partir do ID ou do ig_id
 */
export async function obterCliente(clienteId: string): Promise<Cliente> {
  return pb.collection('clientes').getOne<Cliente>(clienteId)
}

/**
 * Busca cliente por ig_id ou usuario caso a conversa ainda não tenha cliente_id associado
 */
export async function buscarClientePorIgOuUsuario(
  igId?: string,
  usuario?: string,
): Promise<Cliente | null> {
  if (igId) {
    try {
      const records = await pb.collection('clientes').getList<Cliente>(1, 1, {
        filter: pb.filter('ig_id = {:igId}', { igId }),
      })
      if (records.items.length > 0) return records.items[0]
    } catch {
      /* ignore */
    }
  }
  if (usuario) {
    try {
      const records = await pb.collection('clientes').getList<Cliente>(1, 1, {
        filter: pb.filter('usuario = {:usuario}', { usuario }),
      })
      if (records.items.length > 0) return records.items[0]
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * "Conversas anteriores exibidas são só daquele cliente — nunca de outros clientes"
 * Lista todas as conversas do cliente ordenadas pela data da última mensagem (mais recente primeiro).
 */
export async function listarConversasDoCliente(
  clienteId?: string,
  clienteIgId?: string,
  clienteUsuario?: string,
): Promise<Conversa[]> {
  const filters: string[] = []
  if (clienteId) {
    filters.push(pb.filter('cliente_id = {:cid}', { cid: clienteId }))
  }
  if (clienteIgId) {
    filters.push(pb.filter('cliente_ig_id = {:igId}', { igId: clienteIgId }))
  }
  if (clienteUsuario) {
    filters.push(pb.filter('cliente_usuario = {:user}', { user: clienteUsuario }))
  }

  if (filters.length === 0) return []

  const finalFilter = filters.join(' || ')
  return pb.collection('conversas').getFullList<Conversa>({
    filter: finalFilter,
    sort: '-ultima_mensagem_data',
    expand: 'atendente_responsavel',
  })
}

/**
 * Lista as notas internas daquele cliente (ordenadas por data descendente)
 * "visíveis para toda a equipe, em qualquer conversa daquele cliente"
 */
export async function listarNotasInternas(clienteId: string): Promise<NotaInterna[]> {
  if (!clienteId) return []
  return pb.collection('notas_internas').getFullList<NotaInterna>({
    filter: pb.filter('cliente_id = {:cid}', { cid: clienteId }),
    sort: '-data',
    expand: 'autor_id',
  })
}

/**
 * Cria uma nova nota interna para o cliente
 * "Notas internas NUNCA são enviadas ao cliente e nunca aparecem fora da equipe"
 */
export async function criarNotaInterna(
  clienteId: string,
  texto: string,
  autorId: string,
): Promise<NotaInterna> {
  const agora = new Date().toISOString()
  return pb.collection('notas_internas').create<NotaInterna>(
    {
      cliente_id: clienteId,
      texto: texto.trim(),
      autor_id: autorId,
      data: agora,
    },
    {
      expand: 'autor_id',
    },
  )
}

/**
 * Inscrições em tempo real para notas internas daquele cliente
 */
export const inscreverNotasInternas = (callback: () => void) =>
  pb.collection('notas_internas').subscribe('*', callback)

export const cancelarInscricaoNotas = () => pb.collection('notas_internas').unsubscribe()
