import type { RecordModel } from 'pocketbase'

export type Role = 'admin' | 'atendente'
export type Situacao = 'nova' | 'em_atendimento' | 'aguardando_cliente' | 'resolvida'
export type Remetente = 'cliente' | 'central'
export type SituacaoMensagem = 'recebida' | 'enviada' | 'erro'

export interface Usuario extends RecordModel {
  email: string
  name: string
  role: Role
  avatar?: string
}

export interface Cliente extends RecordModel {
  ig_id: string
  nome: string
  usuario: string
  primeira_interacao: string
}

export interface NotaInterna extends RecordModel {
  cliente_id: string
  texto: string
  autor_id: string
  data: string
  expand?: {
    autor_id?: Usuario
    cliente_id?: Cliente
  }
}

export type SituacaoRascunho = 'nenhum' | 'sugestao' | 'editado' | 'pronto_para_envio'

export interface Conversa extends RecordModel {
  cliente_nome: string
  cliente_usuario: string
  cliente_ig_id?: string
  cliente_id?: string
  situacao: Situacao
  atendente_responsavel: string
  ultima_mensagem_data: string
  nao_lidas: number
  rascunho_texto?: string
  rascunho_situacao?: SituacaoRascunho
  ultimo_resumo_texto?: string
  ultimo_resumo_data?: string
  ultimo_resumo_autor?: string
  ultima_sugestao_data?: string
  ultima_sugestao_autor?: string
  expand?: {
    cliente_id?: Cliente
    atendente_responsavel?: Usuario
    ultimo_resumo_autor?: Usuario
    ultima_sugestao_autor?: Usuario
  }
}

export type TipoCopilotoRegistro = 'resumo' | 'sugestao'

export interface CopilotoRegistro extends RecordModel {
  conversa_id: string
  tipo: TipoCopilotoRegistro
  conteudo: string
  solicitado_por: string
  autor_nome?: string
  data: string
  expand?: {
    solicitado_por?: Usuario
  }
}

export interface ConfiguracoesIA {
  id?: string
  tom_de_voz: string
  instrucoes_fixas?: string
  updated?: string
  atualizado_por_nome?: string
}

export interface Mensagem extends RecordModel {
  conversa_id: string
  remetente: Remetente
  texto: string
  data_hora: string
  situacao: SituacaoMensagem
  atendente_id?: string
  identificador_externo?: string
  motivo_erro?: string
  id_idempotencia?: string
  expand?: { atendente_id?: Usuario }
}

export interface EnvioRespostaPayload {
  conversa_id: string
  texto: string
  id_idempotencia?: string
  mudar_para_aguardando?: boolean
  simular_falha?: boolean
}

export interface EnvioRespostaResultado {
  sucesso: boolean
  meta_message_id?: string
  motivo_erro?: string
  ja_processada?: boolean
  aviso?: string
  mensagem: Mensagem
  conversa?: {
    id: string
    situacao: Situacao
    ultima_mensagem_data: string
  }
}

export type SituacaoConexao = 'desconectada' | 'conectada' | 'reconectar'
export type AppSituacaoMeta = 'em teste' | 'em revisão' | 'publicado'

export interface RegrasOficiaisMeta {
  janela_padrao_horas: number
  janela_padrao_descricao: string
  janela_human_agent_dias: number
  janela_human_agent_descricao: string
  iniciativa_conversa: string
  iniciativa_conversa_descricao: string
  limites_envio: {
    send_api_texto_links_reacoes_rps: number
    send_api_audio_video_rps: number
    conversations_api_rps: number
    descricao: string
  }
  tamanho_maximo_texto_bytes: number
  tamanho_maximo_texto_descricao: string
  permissoes_exigidas: string[]
  permissoes_descricao: string
  fonte_oficial: string
}

export interface ConexaoMetaStatus {
  id?: string
  situacao: SituacaoConexao
  app_situacao?: AppSituacaoMeta
  data_mudanca_situacao?: string
  conta_usuario?: string
  conta_nome?: string
  conta_id?: string
  data_conexao?: string
  app_nome?: string
  app_id?: string
  app_secret_mascarado?: string
  tem_app_secret?: boolean
  verify_token?: string
  verify_token_mascarado?: string
  url_login?: string
  regras_meta?: RegrasOficiaisMeta
}

export interface HistoricoConexao extends RecordModel {
  usuario_id?: string
  autor_nome: string
  acao: string
  detalhes?: string
  data?: string
}

export type SituacaoAvisoWebhook = 'aceito' | 'rejeitado' | 'eco'
export type TipoEventoWebhook = 'mensagem' | 'eco' | 'status' | 'outro'

export interface AvisoWebhook extends RecordModel {
  identificador_evento: string
  tipo_evento: TipoEventoWebhook
  situacao: SituacaoAvisoWebhook
  motivo_rejeicao?: string
  remetente_id?: string
  destinatario_id?: string
  texto_mensagem?: string
  payload?: any
  data_recebimento: string
  conversa_id?: string
}

export interface ValidacaoJanelaResposta {
  valido: boolean
  dentro_janela?: boolean
  motivo?: 'sem_mensagem_previa' | 'limite_bytes_excedido' | 'fora_da_janela' | 'data_invalida'
  tipo_janela?: string
  limite_horas?: number
  horas_decorridas?: number
  horas_restantes?: number
  limite_bytes?: number
  bytes_atuais?: number
  bytes?: number
  mensagem: string
}
