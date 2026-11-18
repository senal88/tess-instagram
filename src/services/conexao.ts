import pb from '@/lib/pocketbase/client'
import type {
  AppSituacaoMeta,
  AvisoWebhook,
  ConexaoMetaStatus,
  HistoricoConexao,
  RegrasOficiaisMeta,
  ValidacaoJanelaResposta,
} from '@/types/support'

/**
 * CONSTANTES OFICIAIS DA META (Guardadas como regras de negócio no código do projeto)
 * Fonte: developers.facebook.com — Instagram API with Instagram Login, 2026
 * Documentos: "Send Messages", "Rate Limits", "Instagram Login"
 */
export const REGRAS_OFICIAIS_META: RegrasOficiaisMeta = {
  janela_padrao_horas: 24,
  janela_padrao_descricao:
    'Janela padrão de 24 horas a partir da última mensagem recebida do cliente. Respostas só podem ser enviadas dentro desse período (expansível até 7 dias se a conversa tiver sido iniciada por anúncio Click-to-Direct).',
  janela_human_agent_dias: 7,
  janela_human_agent_descricao:
    'Janela Human Agent (tag human_agent) de 7 dias úteis/corridos para permitir que atendentes humanos solucionem questões complexas com mais tempo.',
  iniciativa_conversa: 'cliente',
  iniciativa_conversa_descricao:
    'Iniciativa restrita ao cliente: a Central só pode responder após o cliente ter enviado uma mensagem prévia. A API do Instagram proíbe expressamente iniciar novas conversas ativas no Direct.',
  limites_envio: {
    send_api_texto_links_reacoes_rps: 100,
    send_api_audio_video_rps: 10,
    conversations_api_rps: 2,
    descricao:
      'Send API: 100 chamadas/segundo por conta profissional para texto, links, reações e stickers; 10 chamadas/segundo para áudio e vídeo. Conversations API: 2 chamadas/segundo por conta profissional.',
  },
  tamanho_maximo_texto_bytes: 1000,
  tamanho_maximo_texto_descricao:
    'Texto em codificação UTF-8 limitado a no máximo 1.000 bytes por mensagem.',
  permissoes_exigidas: ['instagram_business_basic', 'instagram_business_manage_messages'],
  permissoes_descricao:
    'Permissões obrigatórias no painel da Meta: instagram_business_basic e instagram_business_manage_messages.',
  fonte_oficial:
    'developers.facebook.com — Instagram API with Instagram Login: Send Messages & Rate Limits (Atualizada 2026)',
}

/**
 * Validador client-side de janela de resposta oficial da Meta (para pré-validação na UI de envio)
 */
export function validarJanelaRespostaMeta(params: {
  ultimaMensagemData?: string | null
  humanAgent?: boolean
  clickToDirect?: boolean
  texto?: string
}): ValidacaoJanelaResposta {
  const { ultimaMensagemData, humanAgent, clickToDirect, texto = '' } = params

  if (!ultimaMensagemData) {
    return {
      valido: false,
      dentro_janela: false,
      motivo: 'sem_mensagem_previa',
      mensagem:
        'Envio não permitido: o cliente ainda não enviou mensagem. A documentação da Meta não permite iniciar conversas no Direct.',
    }
  }

  // Mede tamanho em bytes (UTF-8)
  const byteCount = new TextEncoder().encode(texto).length
  if (byteCount > 1000) {
    return {
      valido: false,
      dentro_janela: true,
      motivo: 'limite_bytes_excedido',
      bytes_atuais: byteCount,
      limite_bytes: 1000,
      mensagem: `A mensagem tem ${byteCount} bytes e excede o limite oficial de 1.000 bytes da Meta. Reduza o texto.`,
    }
  }

  const ultimaMs = new Date(ultimaMensagemData).getTime()
  if (isNaN(ultimaMs)) {
    return {
      valido: false,
      dentro_janela: false,
      motivo: 'data_invalida',
      mensagem: 'Data da última mensagem do cliente inválida.',
    }
  }

  const diffMs = Date.now() - ultimaMs
  const diffHoras = diffMs / (1000 * 60 * 60)
  const limiteHoras = humanAgent || clickToDirect ? 168 : 24
  const dentro = diffHoras <= limiteHoras
  const horasRestantes = Math.max(0, Math.floor(limiteHoras - diffHoras))

  if (!dentro) {
    const msg = humanAgent
      ? 'Envio bloqueado: a janela estendida Human Agent de 7 dias expirou desde a última mensagem do cliente. Respostas só podem ser enviadas quando o cliente interagir novamente.'
      : 'Envio bloqueado: a janela padrão de 24 horas da Meta expirou. Segundo a documentação oficial, respostas fora de 24h são bloqueadas a menos que o cliente mande nova mensagem ou se use a tag Human Agent (até 7 dias).'

    return {
      valido: false,
      dentro_janela: false,
      motivo: 'fora_da_janela',
      limite_horas: limiteHoras,
      horas_decorridas: Math.round(diffHoras * 10) / 10,
      mensagem: msg,
    }
  }

  return {
    valido: true,
    dentro_janela: true,
    limite_horas: limiteHoras,
    horas_decorridas: Math.round(diffHoras * 10) / 10,
    horas_restantes: horasRestantes,
    bytes: byteCount,
    mensagem: 'Dentro da janela permitida pela Meta.',
  }
}

/**
 * Obtém a URL do backend do PocketBase (usada para callback de webhook)
 */
export function getBackendBaseUrl(): string {
  // pb.baseUrl já reflete o backend oficial (VITE_POCKETBASE_URL)
  return pb.baseUrl.replace(/\/$/, '')
}

/**
 * Obtém a URL do frontend da aplicação para onde a autorização do Instagram volta
 */
export function getFrontendRedirectUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/conexao`
  }
  return 'https://localhost:5173/conexao'
}

/**
 * Obtém a URL oficial do webhook para colar na Meta
 */
export function getWebhookCallbackUrl(): string {
  return `${getBackendBaseUrl()}/backend/v1/meta/webhook`
}

/**
 * Carrega o status da conexão atual
 * Admin recebe detalhes + credenciais mascaradas
 * Atendente recebe apenas situação e conta conectada
 */
export async function obterStatusConexao(): Promise<ConexaoMetaStatus> {
  const res = await pb.send<ConexaoMetaStatus>('/backend/v1/meta/status', {
    method: 'GET',
  })
  return res
}

/**
 * Salva os dados do App e a URL de login cadastrada pelo Administrador
 */
export async function salvarConfiguracoesMeta(dados: {
  app_nome?: string
  app_id?: string
  app_secret?: string
  url_login?: string
  regenerate_verify_token?: boolean
}): Promise<ConexaoMetaStatus> {
  const res = await pb.send<ConexaoMetaStatus>('/backend/v1/meta/save-settings', {
    method: 'POST',
    body: dados,
  })
  return res
}

/**
 * Troca o código OAuth de autorização (uso único) pelo token de longa duração
 */
export async function trocarCodigoOAuth(
  code: string,
  redirectUri: string,
): Promise<{
  success: boolean
  situacao: string
  conta_usuario: string
  conta_nome: string
  conta_id: string
  data_conexao: string
}> {
  const res = await pb.send<{
    success: boolean
    situacao: string
    conta_usuario: string
    conta_nome: string
    conta_id: string
    data_conexao: string
  }>('/backend/v1/meta/oauth/exchange', {
    method: 'POST',
    body: {
      code,
      redirect_uri: redirectUri,
    },
  })
  return res
}

/**
 * Desconecta a conta atual do Instagram mantendo todas as mensagens e conversas
 */
export async function desconectarContaInstagram(): Promise<{ success: boolean; situacao: string }> {
  const res = await pb.send<{ success: boolean; situacao: string }>('/backend/v1/meta/disconnect', {
    method: 'POST',
  })
  return res
}

/**
 * Lista o histórico de alterações da configuração e conexão (apenas admin)
 */
export async function listarHistoricoConexao(): Promise<HistoricoConexao[]> {
  try {
    const records = await pb.collection('historico_conexao').getFullList<HistoricoConexao>({
      sort: '-created',
    })
    return records
  } catch {
    return []
  }
}

/**
 * Lista os avisos de webhook recebidos da Meta (apenas admin)
 */
export async function listarAvisosWebhook(limite = 30): Promise<AvisoWebhook[]> {
  try {
    const records = await pb.collection('avisos_webhook').getList<AvisoWebhook>(1, limite, {
      sort: '-data_recebimento',
    })
    return records.items
  } catch {
    return []
  }
}

/**
 * Altera a situação do aplicativo na Meta (apenas administradores)
 * Registra autor, data anterior e nova no histórico
 */
export async function alterarSituacaoApp(novaSituacao: AppSituacaoMeta): Promise<{
  success: boolean
  app_situacao: AppSituacaoMeta
  situacao_anterior?: string
  data_mudanca_situacao: string
  autor?: string
}> {
  const res = await pb.send<{
    success: boolean
    app_situacao: AppSituacaoMeta
    situacao_anterior?: string
    data_mudanca_situacao: string
    autor?: string
  }>('/backend/v1/meta/app-status', {
    method: 'POST',
    body: {
      app_situacao: novaSituacao,
    },
  })
  return res
}

/**
 * Validação de janela de resposta no servidor (preparação de envio para a etapa futura)
 */
export async function validarEnvioServidor(params: {
  ultimaMensagemData: string
  humanAgent?: boolean
  clickToDirect?: boolean
  texto?: string
}): Promise<ValidacaoJanelaResposta> {
  const res = await pb.send<ValidacaoJanelaResposta>('/backend/v1/meta/validar-janela', {
    method: 'POST',
    body: {
      ultima_mensagem_data: params.ultimaMensagemData,
      human_agent: params.humanAgent,
      click_to_direct: params.clickToDirect,
      texto: params.texto,
    },
  })
  return res
}
