import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  History,
  Info,
  Instagram,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  atualizarSituacao,
  cancelarInscricoes,
  enviarRespostaOficial,
  inscreverMensagens,
  inscreverMudancas,
  listarMensagens,
  obterConversa,
  zerarNaoLidas,
} from '@/services/conversas'
import {
  buscarClientePorIgOuUsuario,
  cancelarInscricaoNotas,
  criarNotaInterna,
  inscreverNotasInternas,
  listarConversasDoCliente,
  listarNotasInternas,
  obterCliente,
} from '@/services/clientes'
import { obterStatusConexao, validarJanelaRespostaMeta } from '@/services/conexao'
import {
  obterRegistrosCopiloto,
  salvarRascunho,
  solicitarResumoConversa,
  solicitarSugestaoResposta,
} from '@/services/copiloto'
import { Bot, CheckCircle, Edit3, FileText, Lightbulb, RefreshCw, Sparkles } from 'lucide-react'
import type {
  Cliente,
  Conversa,
  CopilotoRegistro,
  Mensagem,
  NotaInterna,
  Situacao,
  SituacaoRascunho,
} from '@/types/support'

const statusOptions: Array<{ value: Situacao; label: string }> = [
  { value: 'nova', label: 'Nova' },
  { value: 'em_atendimento', label: 'Em Atendimento' },
  { value: 'aguardando_cliente', label: 'Aguardando Cliente' },
  { value: 'resolvida', label: 'Resolvida' },
]

function statusLabel(status: Situacao) {
  return statusOptions.find((item) => item.value === status)?.label || status
}

function avatarClass(status: Situacao) {
  return `avatar status-${status}`
}

function formatFullDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatMonthYear(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  const mes = date.toLocaleDateString('pt-BR', { month: 'long' })
  const ano = date.getFullYear()
  return `${mes} de ${ano}`
}

function formatCompact(value: string) {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return time
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${time}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`
}

export default function ConversaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { usuario } = useAuth()

  // State da conversa e dados relacionados
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [conversasCliente, setConversasCliente] = useState<Conversa[]>([])
  const [notas, setNotas] = useState<NotaInterna[]>([])
  const [registrosCopiloto, setRegistrosCopiloto] = useState<CopilotoRegistro[]>([])

  // State de UI
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)
  const [draftStatus, setDraftStatus] = useState<Situacao>('nova')
  const [activeTab, setActiveTab] = useState<'contexto' | 'notas' | 'auditoria'>('contexto')
  const [novaNotaTexto, setNovaNotaTexto] = useState('')
  const [salvandoNota, setSalvandoNota] = useState(false)

  // Estado da Conexão Meta
  const [conexaoAtiva, setConexaoAtiva] = useState<boolean>(false)
  const [carregandoConexao, setCarregandoConexao] = useState<boolean>(true)

  // Estados do Copiloto de IA
  const [resumindo, setResumindo] = useState(false)
  const [sugerindo, setSugerindo] = useState(false)
  const [resumoTexto, setResumoTexto] = useState<string>('')
  const [resumoData, setResumoData] = useState<string | null>(null)
  const [resumoAutorNome, setResumoAutorNome] = useState<string | null>(null)

  // Estados da Caixa de Resposta / Rascunho / Envio Oficial (Etapa 7)
  const [rascunhoTexto, setRascunhoTexto] = useState<string>('')
  const [rascunhoSituacao, setRascunhoSituacao] = useState<SituacaoRascunho>('nenhum')
  const [salvandoRascunho, setSalvandoRascunho] = useState(false)

  // Modais de Envio e Reenvio
  const [dialogoEnvioAberto, setDialogoEnvioAberto] = useState(false)
  const [textoParaEnviar, setTextoParaEnviar] = useState('')
  const [idempotenciaAtual, setIdempotenciaAtual] = useState('')
  const [mudarParaAguardando, setMudarParaAguardando] = useState(true)
  const [enviandoResposta, setEnviandoResposta] = useState(false)

  // Histórico de navegação interna: se veio da conversa atual para uma anterior
  const originConversaId = (location.state as { fromConversaId?: string } | undefined)
    ?.fromConversaId
  const historyEnd = useRef<HTMLDivElement>(null)

  // 1. Carregar conversa principal e histórico completo de mensagens
  const carregarDadosConversa = useCallback(async (conversaId: string) => {
    try {
      const conv = await obterConversa(conversaId)
      setConversa(conv)
      setDraftStatus(conv.situacao)

      // Se tem não lidas, zera imediatamente no servidor
      if (conv.nao_lidas > 0) {
        void zerarNaoLidas(conv.id).then(() => {
          setConversa((curr) => (curr ? { ...curr, nao_lidas: 0 } : curr))
        })
      }

      // Carregar histórico COMPLETO (todas as mensagens)
      const msgs = await listarMensagens(conv.id)
      setMensagens(msgs)

      // Resolver cliente
      let cli: Cliente | null = null
      if (conv.cliente_id) {
        try {
          cli = await obterCliente(conv.cliente_id)
        } catch {
          /* ignore */
        }
      }
      if (!cli) {
        cli = await buscarClientePorIgOuUsuario(conv.cliente_ig_id, conv.cliente_usuario)
      }
      setCliente(cli)

      // Carregar conversas do cliente (para o painel de contexto)
      const cliId = cli?.id || conv.cliente_id
      const todasDoCliente = await listarConversasDoCliente(
        cliId,
        conv.cliente_ig_id,
        conv.cliente_usuario,
      )
      setConversasCliente(todasDoCliente)

      // Carregar notas internas do cliente
      if (cliId) {
        const notasDoCliente = await listarNotasInternas(cliId)
        setNotas(notasDoCliente)
      } else {
        setNotas([])
      }

      // Inicializar campos do copiloto vindos da conversa
      setResumoTexto(conv.ultimo_resumo_texto || '')
      setResumoData(conv.ultimo_resumo_data || null)
      setResumoAutorNome(conv.expand?.ultimo_resumo_autor?.name || null)

      setRascunhoTexto(conv.rascunho_texto || '')
      setRascunhoSituacao(conv.rascunho_situacao || (conv.rascunho_texto ? 'sugestao' : 'nenhum'))

      // Carregar auditoria de registros do copiloto
      try {
        const regs = await obterRegistrosCopiloto(conv.id)
        setRegistrosCopiloto(regs)
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error('Erro ao carregar conversa:', err)
      toast.error('Conversa não encontrada ou indisponível.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Carregar status da conexão Meta
  const carregarStatusMeta = useCallback(async () => {
    try {
      const status = await obterStatusConexao()
      setConexaoAtiva(status.situacao === 'conectada')
    } catch {
      setConexaoAtiva(false)
    } finally {
      setCarregandoConexao(false)
    }
  }, [])

  useEffect(() => {
    void carregarStatusMeta()
  }, [carregarStatusMeta])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    void carregarDadosConversa(id)
  }, [id, carregarDadosConversa])

  // Inscrições em tempo real para novas mensagens, mudanças de situação e novas notas
  useEffect(() => {
    if (!id) return

    const unsubMsgs = inscreverMensagens(() => {
      void listarMensagens(id).then(setMensagens)
    })

    const unsubMudancas = inscreverMudancas(() => {
      void obterConversa(id).then((conv) => {
        setConversa(conv)
        setDraftStatus(conv.situacao)
      })
    })

    const unsubNotas = inscreverNotasInternas(() => {
      const cliId = cliente?.id || conversa?.cliente_id
      if (cliId) {
        void listarNotasInternas(cliId).then(setNotas)
      }
    })

    return () => {
      void unsubMsgs.then((u) => u?.())
      void unsubMudancas.then((u) => u?.())
      void unsubNotas.then((u) => u?.())
      void cancelarInscricaoNotas()
      void cancelarInscricoes()
    }
  }, [id, cliente?.id, conversa?.cliente_id])

  // Scroll automático para a mensagem mais recente ao carregar
  useEffect(() => {
    historyEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  // Janela oficial Meta (24h) baseada na última mensagem recebida do cliente
  const validacaoJanela = useMemo(() => {
    if (!conversa) return null

    // Encontrar data da última mensagem recebida do cliente no histórico
    const msgsCliente = mensagens.filter(
      (m) => m.remetente === 'cliente' && m.situacao === 'recebida',
    )
    const ultimaMsgData =
      msgsCliente.length > 0
        ? msgsCliente[msgsCliente.length - 1].data_hora
        : conversa.ultima_mensagem_data

    return validarJanelaRespostaMeta({
      ultimaMensagemData: ultimaMsgData,
    })
  }, [conversa, mensagens])

  // Salvar troca de situação
  async function handleSalvarSituacao() {
    if (!conversa || !usuario || draftStatus === conversa.situacao) return
    setSavingStatus(true)
    try {
      const atualizada = await atualizarSituacao(conversa, draftStatus, usuario.id)
      setConversa(atualizada)
      toast.success(`Situação alterada para '${statusLabel(draftStatus)}'`, {
        duration: 3000,
      })
    } catch {
      toast.error('Não foi possível atualizar a situação.')
    } finally {
      setSavingStatus(false)
    }
  }

  // Passar situação direto para "em atendimento" ao abrir conversa
  async function handlePassarParaEmAtendimento() {
    if (!conversa || !usuario || conversa.situacao === 'em_atendimento') return
    setSavingStatus(true)
    try {
      const atualizada = await atualizarSituacao(conversa, 'em_atendimento', usuario.id)
      setConversa(atualizada)
      setDraftStatus('em_atendimento')
      toast.success("Situação atualizada para 'Em Atendimento'")
    } catch {
      toast.error('Não foi possível alterar a situação.')
    } finally {
      setSavingStatus(false)
    }
  }

  // Adicionar nota interna
  async function handleCriarNota(e: React.FormEvent) {
    e.preventDefault()
    if (!novaNotaTexto.trim() || !usuario) return
    const cliId = cliente?.id || conversa?.cliente_id
    if (!cliId) {
      toast.error('Identificador do cliente não disponível para salvar nota.')
      return
    }

    setSalvandoNota(true)
    try {
      const notaCriada = await criarNotaInterna(cliId, novaNotaTexto, usuario.id)
      setNotas((prev) => [notaCriada, ...prev])
      setNovaNotaTexto('')
      toast.success('Nota interna registrada com sucesso.')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar nota interna.')
    } finally {
      setSalvandoNota(false)
    }
  }

  // COPILOTO DE IA: 1. Resumir conversa
  async function handleResumirConversa() {
    if (!conversa || resumindo) return
    setResumindo(true)
    try {
      const resp = await solicitarResumoConversa(conversa.id)
      setResumoTexto(resp.resumo)
      setResumoData(resp.data)
      setResumoAutorNome(resp.solicitado_por.name)
      // Alternar para aba contexto para que o atendente veja o resumo imediatamente
      setActiveTab('contexto')
      // Atualizar registros
      void obterRegistrosCopiloto(conversa.id).then(setRegistrosCopiloto)
      toast.success('Resumo gerado pelo Copiloto de IA!')
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível gerar o resumo da conversa no momento.')
    } finally {
      setResumindo(false)
    }
  }

  // COPILOTO DE IA: 2. Sugerir resposta
  async function handleSugerirResposta() {
    if (!conversa || sugerindo) return
    setSugerindo(true)
    try {
      const resp = await solicitarSugestaoResposta(conversa.id)
      setRascunhoTexto(resp.rascunho_texto)
      setRascunhoSituacao('sugestao')
      // Atualizar registros
      void obterRegistrosCopiloto(conversa.id).then(setRegistrosCopiloto)
      toast.success('Sugestão de resposta criada como rascunho!')
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível gerar a sugestão de resposta no momento.')
    } finally {
      setSugerindo(false)
    }
  }

  // COPILOTO DE IA: 3. Edição do atendente no texto do rascunho
  function handleAlterarTextoRascunho(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const novo = e.target.value
    setRascunhoTexto(novo)
    if (!novo.trim()) {
      setRascunhoSituacao('nenhum')
    } else if (rascunhoSituacao === 'sugestao' || rascunhoSituacao === 'pronto_para_envio') {
      setRascunhoSituacao('editado')
    } else if (rascunhoSituacao === 'nenhum') {
      setRascunhoSituacao('editado')
    }
  }

  // COPILOTO DE IA: 4. Salvar rascunho manualmente
  async function handleSalvarRascunhoManual(novaSituacao?: SituacaoRascunho) {
    if (!conversa) return
    const sit = novaSituacao || rascunhoSituacao
    setSalvandoRascunho(true)
    try {
      await salvarRascunho(conversa.id, rascunhoTexto, sit)
      setRascunhoSituacao(sit)
      toast.success(`Rascunho salvo (${sit.replace('_', ' ')}).`)
    } catch {
      toast.error('Erro ao salvar rascunho.')
    } finally {
      setSalvandoRascunho(false)
    }
  }

  // COPILOTO DE IA: 5. Marcar como "pronto para envio"
  async function handleMarcarProntoParaEnvio() {
    if (!rascunhoTexto.trim()) {
      toast.error('Digite ou gere uma sugestão antes de marcar como pronto.')
      return
    }
    await handleSalvarRascunhoManual('pronto_para_envio')
  }

  // COPILOTO DE IA: 6. Limpar rascunho
  async function handleLimparRascunho() {
    if (!conversa) return
    setSalvandoRascunho(true)
    try {
      await salvarRascunho(conversa.id, '', 'nenhum')
      setRascunhoTexto('')
      setRascunhoSituacao('nenhum')
      toast.success('Rascunho limpo.')
    } catch {
      toast.error('Erro ao limpar rascunho.')
    } finally {
      setSalvandoRascunho(false)
    }
  }

  // ETAPA 7: ENVIO OFICIAL PELA META COM CONFIRMAÇÃO HUMANA EXPLÍCITA
  function abrirDialogoEnvio(textoCustomizado?: string) {
    const texto = (textoCustomizado !== undefined ? textoCustomizado : rascunhoTexto).trim()
    if (!texto) {
      toast.error('Digite ou gere uma resposta antes de enviar.')
      return
    }
    if (!conexaoAtiva) {
      toast.error('Conecte a conta do Instagram nas configurações para enviar mensagens.')
      return
    }
    if (validacaoJanela && !validacaoJanela.dentro_janela) {
      toast.error('Envio bloqueado: a janela de resposta de 24h encerrou-se.')
      return
    }

    setTextoParaEnviar(texto)
    // Gera ID de idempotência único por tentativa de envio no cliente
    setIdempotenciaAtual('env_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10))
    setDialogoEnvioAberto(true)
  }

  async function handleConfirmarEnvio() {
    if (!conversa || !textoParaEnviar.trim() || enviandoResposta) return

    setEnviandoResposta(true)
    try {
      const res = await enviarRespostaOficial({
        conversa_id: conversa.id,
        texto: textoParaEnviar.trim(),
        id_idempotencia: idempotenciaAtual,
        mudar_para_aguardando: mudarParaAguardando,
      })

      if (res.sucesso) {
        toast.success('Resposta enviada com sucesso pela via oficial da Meta!')
        setRascunhoTexto('')
        setRascunhoSituacao('nenhum')
        setDialogoEnvioAberto(false)

        // Atualizar lista de mensagens e conversa
        void listarMensagens(conversa.id).then(setMensagens)
        void obterConversa(conversa.id).then((conv) => {
          setConversa(conv)
          setDraftStatus(conv.situacao)
        })
      } else {
        toast.error(res.motivo_erro || 'Erro ao enviar resposta. Verifique o status da mensagem.')
        setDialogoEnvioAberto(false)
        void listarMensagens(conversa.id).then(setMensagens)
      }
    } catch (err: any) {
      console.error('Falha no envio oficial:', err)
      const msgErro =
        err?.data?.error ||
        err?.message ||
        'Não foi possível concluir o envio oficial. Tente novamente.'
      toast.error(msgErro)
      setDialogoEnvioAberto(false)
      // Atualizar mensagens para caso tenha sido salvo registro de erro
      void listarMensagens(conversa.id).then(setMensagens)
    } finally {
      setEnviandoResposta(false)
    }
  }

  // Tentar de novo para mensagem com erro no histórico (reenvia o mesmo texto)
  function handleTentarDeNovo(mensagemErro: Mensagem) {
    abrirDialogoEnvio(mensagemErro.texto)
  }

  // Conversas anteriores: TODAS as conversas do cliente exceto a que está aberta no momento
  const conversasAnteriores = useMemo(() => {
    if (!conversa) return []
    return conversasCliente.filter((c) => c.id !== conversa.id)
  }, [conversasCliente, conversa])

  // Total de conversas do cliente
  const totalConversasCliente = conversasCliente.length || 1

  // Posição ordinal desta conversa (ex.: 3ª conversa se houver 2 anteriores)
  // Calculamos a ordem cronológica pelo created ou ultima_mensagem_data
  const ordemConversaAtual = useMemo(() => {
    if (!conversa || conversasCliente.length === 0) return 1
    const ordenadas = [...conversasCliente].sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
    )
    const idx = ordenadas.findIndex((c) => c.id === conversa.id)
    return idx >= 0 ? idx + 1 : conversasCliente.length
  }, [conversa, conversasCliente])

  const ordinalStr = `${ordemConversaAtual}ª conversa`

  // Data desde quando é cliente
  const dataDesdeQuando = cliente?.primeira_interacao || conversa?.created

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-pink-600" />
        <p className="text-sm font-medium">Carregando conversa e contexto...</p>
      </div>
    )
  }

  if (!conversa) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <CircleAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">Conversa não encontrada</h2>
        <p className="text-sm text-slate-600 mb-4">
          A conversa solicitada não existe ou foi arquivada.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800"
        >
          <ArrowLeft size={16} /> Voltar para a Inbox
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] lg:h-screen w-full overflow-hidden bg-slate-100">
      {/* =========================================================================
          COLUNA PRINCIPAL: CABEÇALHO + HISTÓRICO DE MENSAGENS + BARRA DE SITUAÇÃO
          ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-slate-200">
        {/* CABEÇALHO DA CONVERSA */}
        <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shadow-xs shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Se está vendo uma conversa anterior, botão para voltar à conversa de origem */}
            {originConversaId ? (
              <button
                onClick={() => navigate(`/conversa/${originConversaId}`)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg transition-colors shrink-0"
                title="Voltar para a conversa em atendimento"
              >
                <ArrowLeft size={14} />
                <span>Voltar à conversa atual</span>
              </button>
            ) : (
              <Link
                to="/"
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                title="Voltar para a Inbox"
                aria-label="Voltar para a Inbox"
              >
                <ArrowLeft size={19} />
              </Link>
            )}

            <div className={avatarClass(conversa.situacao)}>
              {conversa.cliente_nome ? conversa.cliente_nome[0] : 'C'}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="text-sm md:text-base font-bold text-slate-900 truncate">
                  {conversa.cliente_nome}
                </strong>
                <span className="text-xs font-medium text-pink-600 bg-pink-50 px-2 py-0.5 rounded-md border border-pink-100">
                  {conversa.cliente_usuario}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate flex items-center gap-2 mt-0.5">
                <span>{ordinalStr}</span>
                <span>•</span>
                <span>Cliente desde {formatMonthYear(dataDesdeQuando)}</span>
              </p>
            </div>
          </div>

          {/* SITUAÇÃO & AÇÕES RÁPIDAS NO TOPO */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={`status-badge status-${conversa.situacao}`}>
              {statusLabel(conversa.situacao)}
            </span>

            {/* Ação rápida: passar para 'em atendimento' se a conversa estiver 'nova' */}
            {conversa.situacao === 'nova' && (
              <button
                onClick={handlePassarParaEmAtendimento}
                disabled={savingStatus}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors"
                title="Colocar esta conversa em atendimento imediatamente"
              >
                {savingStatus ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                <span>Assumir atendimento</span>
              </button>
            )}
          </div>
        </header>

        {/* ALERTA DE CONVERSA ANTERIOR (se aplicável) */}
        {originConversaId && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <History size={15} className="text-amber-700 shrink-0" />
              <span>
                Você está visualizando um <strong>atendimento anterior</strong> deste cliente.
              </span>
            </div>
            <button
              onClick={() => navigate(`/conversa/${originConversaId}`)}
              className="text-pink-700 hover:text-pink-900 font-bold underline text-xs"
            >
              Retornar à conversa atual
            </button>
          </div>
        )}

        {/* HISTÓRICO COMPLETO DE MENSAGENS (sem paginação visível) */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-[#f8fafc]">
          {mensagens.length === 0 ? (
            <div className="empty-state my-auto">
              <div className="empty-illustration animate-float">
                <MessageCircle size={32} />
              </div>
              <strong>Nenhuma mensagem registrada nesta conversa.</strong>
              <p>As novas mensagens do Instagram aparecerão aqui em tempo real.</p>
            </div>
          ) : (
            mensagens.map((message) => {
              const isCentral = message.remetente === 'central'
              const nomeAutor = isCentral
                ? message.expand?.atendente_id?.name || 'Central de Atendimento'
                : conversa.cliente_nome

              return (
                <div key={message.id} className={`message-row ${isCentral ? 'sent' : 'received'}`}>
                  <article className="message-bubble">
                    <strong className="text-[11px] block font-semibold text-slate-700 mb-1">
                      {nomeAutor}
                    </strong>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.texto}</p>
                    <footer className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500">
                      <time title={new Date(message.data_hora).toLocaleString('pt-BR')}>
                        {formatCompact(message.data_hora)}
                      </time>
                      {message.situacao === 'erro' && (
                        <span
                          className="inline-flex items-center gap-1 text-rose-700 bg-rose-100 border border-rose-300 px-1.5 py-0.2 rounded font-semibold"
                          title={message.motivo_erro || 'Falha no envio da mensagem'}
                        >
                          <CircleAlert size={12} /> {message.motivo_erro || 'Erro no envio'}
                        </span>
                      )}
                      {message.situacao === 'enviada' && (
                        <span
                          title={
                            message.identificador_externo
                              ? `Enviada via Meta (ID: ${message.identificador_externo})`
                              : 'Enviada via Meta'
                          }
                          className="inline-flex items-center gap-1 text-emerald-700 font-medium"
                        >
                          <Check size={12} className="text-emerald-600" />
                          <span>enviada</span>
                        </span>
                      )}
                      {message.situacao === 'recebida' && (
                        <span className="text-[9px] text-slate-400">Instagram</span>
                      )}
                    </footer>

                    {/* Botão Tentar de Novo quando a mensagem estiver em situação 'erro' */}
                    {message.situacao === 'erro' && isCentral && (
                      <div className="mt-2 pt-1.5 border-t border-rose-200/80 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-rose-800 font-medium truncate">
                          {message.motivo_erro || 'Envio não concluído'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTentarDeNovo(message)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[11px] font-bold transition shadow-2xs shrink-0"
                          title="Reenviar o mesmo texto pela via oficial"
                        >
                          <RefreshCw size={11} />
                          <span>Tentar de novo</span>
                        </button>
                      </div>
                    )}
                  </article>
                </div>
              )
            })
          )}
          <div ref={historyEnd} />
        </div>

        {/* REGRA OFICIAL DA META (JANELA DE RESPOSTA 24H) */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <ShieldCheck size={14} className="text-pink-600" />
              <span>Regra oficial da Meta (Janela de Resposta)</span>
            </div>
            {validacaoJanela?.dentro_janela ? (
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check size={11} /> Janela ativa ({validacaoJanela.horas_restantes}h restantes)
              </span>
            ) : (
              <span className="text-[11px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CircleAlert size={11} /> Janela de 24h expirada
              </span>
            )}
          </div>
          {!validacaoJanela?.dentro_janela && (
            <p className="text-[11px] text-rose-900 mt-1 leading-tight">
              {validacaoJanela?.mensagem ||
                'O cliente precisa enviar uma nova mensagem para reabrir a janela de 24h.'}
            </p>
          )}
        </div>

        {/* =====================================================================
            CAIXA DE RESPOSTA / RASCUNHO EDITÁVEL COM COPILOTO IA (ETAPA 6)
            ===================================================================== */}
        <div className="p-3 md:p-4 bg-white border-t border-slate-200 shrink-0 space-y-2.5">
          {/* BARRA SUPERIOR DA CAIXA: BOTÕES DE AÇÃO DO COPILOTO + STATUS DO RASCUNHO */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Bot size={15} className="text-pink-600" />
                <span>Rascunho de Resposta</span>
              </span>

              {/* Tag da situação do rascunho: "sugestão" | "editado" | "pronto para envio" */}
              {rascunhoSituacao === 'sugestao' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">
                  <Sparkles size={11} className="text-purple-600" />
                  Sugestão da IA
                </span>
              )}
              {rascunhoSituacao === 'editado' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  <Edit3 size={11} className="text-amber-700" />
                  Editado pelo atendente
                </span>
              )}
              {rascunhoSituacao === 'pronto_para_envio' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle size={11} className="text-emerald-700" />
                  Pronto para envio
                </span>
              )}
            </div>

            {/* Ações do Copiloto */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResumirConversa}
                disabled={resumindo || sugerindo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-lg text-xs font-bold transition shadow-2xs disabled:opacity-50"
                title="A IA lê o histórico e devolve um resumo curto no painel de contexto"
              >
                {resumindo ? (
                  <Loader2 size={13} className="animate-spin text-pink-600" />
                ) : (
                  <FileText size={13} />
                )}
                <span>Resumir conversa</span>
              </button>

              <button
                type="button"
                onClick={handleSugerirResposta}
                disabled={sugerindo || resumindo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
                title="A IA escreve um rascunho na caixa de resposta, considerando o resumo, o histórico e as notas internas"
              >
                {sugerindo ? (
                  <Loader2 size={13} className="animate-spin text-white" />
                ) : (
                  <Sparkles size={13} />
                )}
                <span>Sugerir resposta</span>
              </button>
            </div>
          </div>

          {/* ÁREA DE TEXTO DO RASCUNHO SEMPRE EDITÁVEL */}
          <div className="relative">
            <textarea
              value={rascunhoTexto}
              onChange={handleAlterarTextoRascunho}
              rows={3}
              placeholder="Clique em 'Sugerir resposta' para gerar um rascunho com o tom da marca, ou digite livremente aqui..."
              className="w-full text-xs md:text-sm p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 resize-none text-slate-800 placeholder:text-slate-400 bg-white"
            />
          </div>

          {/* BARRA DE AÇÕES DO RASCUNHO + REGRAS HUMANAS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Lock size={12} className="text-slate-400" />
                A IA NUNCA envia mensagem
              </span>
              <span>•</span>
              <span>Apenas cria rascunho editável por humanos</span>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {rascunhoTexto && (
                <button
                  type="button"
                  onClick={handleLimparRascunho}
                  disabled={salvandoRascunho}
                  className="px-2.5 py-1 text-slate-500 hover:text-slate-800 text-xs font-medium rounded-lg hover:bg-slate-100 transition"
                >
                  Limpar
                </button>
              )}

              {rascunhoTexto && rascunhoSituacao !== 'pronto_para_envio' && (
                <button
                  type="button"
                  onClick={() => handleSalvarRascunhoManual('editado')}
                  disabled={salvandoRascunho}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 transition"
                >
                  Salvar rascunho
                </button>
              )}

              {rascunhoTexto && (
                <button
                  type="button"
                  onClick={handleMarcarProntoParaEnvio}
                  disabled={salvandoRascunho || rascunhoSituacao === 'pronto_para_envio'}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs ${
                    rascunhoSituacao === 'pronto_para_envio'
                      ? 'bg-emerald-600 text-white cursor-default'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300'
                  }`}
                >
                  <Check size={13} />
                  <span>
                    {rascunhoSituacao === 'pronto_para_envio'
                      ? 'Pronto para envio'
                      : 'Marcar pronto para envio'}
                  </span>
                </button>
              )}

              {/* BOTÃO PRINCIPAL DE ENVIO OFICIAL (ETAPA 7) */}
              <button
                type="button"
                onClick={() => abrirDialogoEnvio()}
                disabled={
                  !rascunhoTexto.trim() ||
                  !conexaoAtiva ||
                  (validacaoJanela !== null && !validacaoJanela.dentro_janela)
                }
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white text-xs font-bold rounded-lg transition shadow-xs disabled:opacity-45 disabled:cursor-not-allowed"
                title={
                  !conexaoAtiva
                    ? 'Conecte a conta do Instagram para enviar'
                    : validacaoJanela && !validacaoJanela.dentro_janela
                      ? 'Envio bloqueado: fora da janela oficial de 24h'
                      : !rascunhoTexto.trim()
                        ? 'Digite ou gere um rascunho para enviar'
                        : 'Requer confirmação humana explícita antes de enviar'
                }
              >
                <Send size={13} />
                <span>Enviar resposta</span>
              </button>
            </div>
          </div>

          {/* AVISOS DE BLOQUEIO CLAROS SOBRE CONEXÃO OU JANELA */}
          {!carregandoConexao && !conexaoAtiva && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span>
                  <strong>Instagram desconectado:</strong> conecte a conta oficial da Meta nas
                  configurações para habilitar o envio de respostas.
                </span>
              </div>
              <Link
                to="/conexao"
                className="text-pink-700 hover:text-pink-900 underline font-bold shrink-0 text-xs"
              >
                Conectar agora →
              </Link>
            </div>
          )}

          {validacaoJanela && !validacaoJanela.dentro_janela && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-start gap-2">
              <CircleAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Envio bloqueado pela política da Meta:</strong> a janela padrão de 24 horas
                encerrou-se. Conforme as regras oficiais, só é possível responder quando o cliente
                escrever de novo no Direct.
              </div>
            </div>
          )}
        </div>

        {/* RODAPÉ: CONTROLE DE SITUAÇÃO DA CONVERSA */}
        <footer className="status-editor shrink-0">
          <div>
            <span>Situação da conversa</span>
            <small>Troca registrada no histórico com seu usuário e data</small>
          </div>
          <div className="status-actions">
            <label className="select-wrap">
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as Situacao)}
                disabled={savingStatus}
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </label>
            <button
              className="primary-button save-status"
              disabled={savingStatus || draftStatus === conversa.situacao}
              onClick={handleSalvarSituacao}
            >
              {savingStatus ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Salvar
            </button>
          </div>
        </footer>
      </div>

      {/* =========================================================================
          MODAL DE CONFIRMAÇÃO HUMANA EXPLÍCITA DO ENVIO (ETAPA 7)
          "Ao clicar enviar: janela de confirmação mostrando o cliente (@usuário) e o texto completo — só envia com 'confirmar envio'"
          "Nenhuma mensagem sai sem confirmação humana explícita"
          "Confirmar o envio 2 vezes NÃO gera 2 mensagens"
          ========================================================================= */}
      {dialogoEnvioAberto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck size={20} className="text-pink-600" />
                  <span>Confirmação Humana de Envio</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  A resposta sairá pela via oficial da Meta para o Instagram Direct do cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogoEnvioAberto(false)}
                disabled={enviandoResposta}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* DADOS DO DESTINATÁRIO */}
            <div className="bg-pink-50/70 border border-pink-100 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium">Destinatário oficial:</span>
                <span className="font-bold text-pink-700 bg-white px-2 py-0.5 rounded border border-pink-200">
                  {conversa.cliente_usuario}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Nome do cliente:</span>
                <span className="font-semibold text-slate-700">{conversa.cliente_nome}</span>
              </div>
              {conversa.cliente_ig_id && (
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>ID oficial Meta (Direct):</span>
                  <span>{conversa.cliente_ig_id}</span>
                </div>
              )}
            </div>

            {/* TEXTO COMPLETO DA RESPOSTA */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Texto completo que será enviado:
              </label>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
                {textoParaEnviar}
              </div>
            </div>

            {/* OPÇÃO DE TRANSIÇÃO DE SITUAÇÃO APÓS O ENVIO */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={mudarParaAguardando}
                  onChange={(e) => setMudarParaAguardando(e.target.checked)}
                  disabled={enviandoResposta}
                  className="rounded border-slate-300 text-pink-600 focus:ring-pink-500 h-4 w-4"
                />
                <span>Passar a conversa para "Aguardando Cliente" após o envio</span>
              </label>
              <p className="text-[11px] text-slate-500 mt-1 ml-6 leading-tight">
                Recomendado para manter a inbox organizada enquanto o cliente lê e responde.
              </p>
            </div>

            {/* BOTÕES DE AÇÃO: SÓ ENVIA COM "CONFIRMAR ENVIO" */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDialogoEnvioAberto(false)}
                disabled={enviandoResposta}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEnvio}
                disabled={enviandoResposta}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {enviandoResposta ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-white" />
                    <span>Enviando pela via oficial...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Confirmar envio</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAINEL LATERAL: CONTEXTO DO CLIENTE & NOTAS INTERNAS (EQUIPE)
          ========================================================================= */}
      <aside className="w-full lg:w-96 xl:w-[420px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col shrink-0 overflow-hidden">
        {/* CABEÇALHO DO PAINEL LATERAL COM ABAS */}
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 pt-3 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
            <User size={14} className="text-pink-600" />
            <span>Painel do Cliente</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('contexto')}
              className={`flex-1 py-2 text-xs font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'contexto'
                  ? 'border-pink-600 text-pink-700 bg-white rounded-t-md shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <History size={13} />
              <span>Contexto</span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full">
                {totalConversasCliente}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('notas')}
              className={`flex-1 py-2 text-xs font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'notas'
                  ? 'border-pink-600 text-pink-700 bg-white rounded-t-md shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Lock size={12} className="text-amber-600" />
              <span>Notas</span>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-full border border-amber-200">
                {notas.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('auditoria')}
              className={`flex-1 py-2 text-xs font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'auditoria'
                  ? 'border-pink-600 text-pink-700 bg-white rounded-t-md shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bot size={12} className="text-purple-600" />
              <span>IA Logs</span>
              <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.2 rounded-full border border-purple-200">
                {registrosCopiloto.length}
              </span>
            </button>
          </div>
        </div>

        {/* CONTEÚDO DA ABA SELECIONADA */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'contexto' && (
            /* ==========================================
               ABA 1: CONTEXTO DO CLIENTE & RESUMO DO COPILOTO IA
               ========================================== */
            <div className="space-y-4">
              {/* BLOCO DO RESUMO DO COPILOTO IA (ETAPA 6) */}
              <div className="bg-gradient-to-br from-purple-50/80 via-white to-pink-50/60 p-4 rounded-xl border border-purple-200/80 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-purple-950">
                    <Sparkles size={14} className="text-purple-600" />
                    <span>Resumo da Conversa com IA</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResumirConversa}
                    disabled={resumindo}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-pink-700 hover:text-pink-900 hover:bg-pink-100/60 px-2 py-0.5 rounded transition disabled:opacity-50"
                  >
                    {resumindo ? (
                      <Loader2 size={11} className="animate-spin text-pink-600" />
                    ) : (
                      <RefreshCw size={11} />
                    )}
                    <span>{resumoTexto ? 'Atualizar resumo' : 'Gerar resumo'}</span>
                  </button>
                </div>

                {resumindo ? (
                  <div className="p-4 bg-white/70 rounded-lg border border-purple-100 flex items-center justify-center gap-2 text-xs text-purple-700">
                    <Loader2 size={16} className="animate-spin text-purple-600" />
                    <span>
                      Lendo histórico e sintetizando quem é o cliente, pedido e pendências...
                    </span>
                  </div>
                ) : resumoTexto ? (
                  <div className="p-3 bg-white/90 rounded-lg border border-purple-100 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {resumoTexto}
                  </div>
                ) : (
                  <div className="p-3 bg-white/60 rounded-lg border border-dashed border-purple-200 text-center text-xs text-slate-500">
                    <FileText size={16} className="mx-auto mb-1 text-purple-400" />
                    <p>Nenhum resumo gerado ainda para esta conversa.</p>
                    <button
                      type="button"
                      onClick={handleResumirConversa}
                      className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-[11px] font-bold transition shadow-2xs"
                    >
                      <Sparkles size={12} />
                      <span>Gerar resumo agora</span>
                    </button>
                  </div>
                )}

                {resumoData && (
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-purple-100/60">
                    <span>
                      Solicitado por:{' '}
                      <strong className="text-slate-600">{resumoAutorNome || 'Atendente'}</strong>
                    </span>
                    <time title={new Date(resumoData).toLocaleString('pt-BR')}>
                      {formatCompact(resumoData)}
                    </time>
                  </div>
                )}
              </div>

              {/* CARTÃO DE RESUMO DO CLIENTE */}
              <div className="bg-gradient-to-br from-pink-50/70 via-white to-purple-50/50 p-4 rounded-xl border border-pink-100 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
                    {conversa.cliente_nome ? conversa.cliente_nome[0] : 'C'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 text-base leading-tight truncate">
                      {conversa.cliente_nome}
                    </h3>
                    <div className="flex items-center gap-1 text-pink-700 text-xs font-semibold mt-0.5">
                      <Instagram size={13} />
                      <span className="truncate">{conversa.cliente_usuario}</span>
                    </div>
                    {cliente?.ig_id && (
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        ID: {cliente.ig_id}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-pink-100 text-xs">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-[10.5px] text-slate-500 flex items-center gap-1 font-medium">
                      <History size={12} className="text-pink-600" />
                      Atendimentos
                    </span>
                    <strong className="text-sm text-slate-900 font-bold block mt-0.5">
                      {ordinalStr}
                    </strong>
                    <small className="text-[10px] text-slate-500">
                      {totalConversasCliente}{' '}
                      {totalConversasCliente === 1 ? 'conversa no total' : 'conversas no total'}
                    </small>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-[10.5px] text-slate-500 flex items-center gap-1 font-medium">
                      <Calendar size={12} className="text-purple-600" />
                      Cliente desde
                    </span>
                    <strong className="text-sm text-slate-900 font-bold block mt-0.5">
                      {formatMonthYear(dataDesdeQuando)}
                    </strong>
                    <small className="text-[10px] text-slate-500">
                      {formatFullDate(dataDesdeQuando)}
                    </small>
                  </div>
                </div>
              </div>

              {/* LISTA DAS CONVERSAS ANTERIORES DO CLIENTE */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <History size={13} className="text-slate-500" />
                    Conversas Anteriores ({conversasAnteriores.length})
                  </h4>
                  <span className="text-[10px] text-slate-400">Apenas deste cliente</span>
                </div>

                {conversasAnteriores.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                    <MessageSquare size={20} className="mx-auto mb-1 text-slate-400" />
                    <strong>Nenhuma conversa anterior.</strong>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Este é o primeiro atendimento registrado para {conversa.cliente_nome}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversasAnteriores.map((anterior) => (
                      <button
                        key={anterior.id}
                        onClick={() =>
                          navigate(`/conversa/${anterior.id}`, {
                            state: { fromConversaId: originConversaId || conversa.id },
                          })
                        }
                        className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-pink-300 hover:bg-pink-50/30 bg-white transition-all group shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`status-badge status-${anterior.situacao}`}>
                            {statusLabel(anterior.situacao)}
                          </span>
                          <time className="text-[10.5px] text-slate-500 group-hover:text-pink-700">
                            {formatCompact(anterior.ultima_mensagem_data)}
                          </time>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 group-hover:text-pink-900 truncate">
                          Atendimento finalizado
                        </p>
                        <span className="text-[11px] text-pink-600 group-hover:underline inline-flex items-center gap-1 mt-1 font-medium">
                          Ver este histórico completo →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'notas' && (
            /* ==========================================
               ABA 2: NOTAS INTERNAS DA EQUIPE
               ========================================== */
            <div className="space-y-4">
              {/* AVISO DE SEGURANÇA E PRIVACIDADE DAS NOTAS */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
                <Lock size={15} className="text-amber-700 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong className="block font-bold">Uso exclusivo da equipe</strong>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    Notas internas NUNCA são enviadas ao cliente e nunca aparecem fora da equipe.
                    Elas ficam visíveis em qualquer conversa deste cliente.
                  </p>
                </div>
              </div>

              {/* FORMULÁRIO DE NOVA NOTA INTERNA */}
              <form
                onSubmit={handleCriarNota}
                className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2"
              >
                <label className="block text-xs font-bold text-slate-800">
                  Registrar observação sobre {conversa.cliente_nome}:
                </label>
                <textarea
                  value={novaNotaTexto}
                  onChange={(e) => setNovaNotaTexto(e.target.value)}
                  placeholder="Ex.: cliente VIP, prefere resposta curta, já comprou 2 vezes..."
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 resize-none text-slate-800 placeholder:text-slate-400"
                  disabled={salvandoNota}
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={salvandoNota || !novaNotaTexto.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    {salvandoNota ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Plus size={13} />
                    )}
                    <span>Salvar nota interna</span>
                  </button>
                </div>
              </form>

              {/* LISTA DE NOTAS EXISTENTES */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={13} className="text-slate-500" />
                  Notas da Equipe ({notas.length})
                </h4>

                {notas.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                    <Lock size={18} className="mx-auto mb-1 text-slate-400" />
                    <strong>Nenhuma nota interna ainda.</strong>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Registre observações da equipe para orientar os próximos atendimentos.
                    </p>
                  </div>
                ) : (
                  notas.map((nota) => {
                    const nomeAutor = nota.expand?.autor_id?.name || 'Membro da equipe'
                    return (
                      <div
                        key={nota.id}
                        className="p-3 bg-amber-50/30 rounded-xl border border-amber-200/70 hover:border-amber-300 transition-colors shadow-2xs"
                      >
                        <p className="text-xs text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                          {nota.texto}
                        </p>
                        <div className="mt-2 pt-2 border-t border-amber-100 flex items-center justify-between text-[10.5px] text-slate-500">
                          <span className="font-semibold text-slate-700 flex items-center gap-1">
                            <User size={11} className="text-pink-600" />
                            {nomeAutor}
                          </span>
                          <time title={new Date(nota.data).toLocaleString('pt-BR')}>
                            {formatCompact(nota.data)}
                          </time>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'auditoria' && (
            /* ==========================================
               ABA 3: AUDITORIA DO COPILOTO IA
               ========================================== */
            <div className="space-y-4">
              <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl text-xs text-purple-950 flex items-start gap-2.5">
                <Bot size={15} className="text-purple-700 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong className="block font-bold">Registro de Auditoria de IA</strong>
                  <p className="text-purple-800 text-[11px] mt-0.5">
                    Cada resumo e cada sugestão de resposta gerados pelo copiloto ficam registrados
                    com data e quem pediu para fins de conformidade e auditoria interna.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <History size={13} className="text-slate-500" />
                  Histórico de Solicitações ({registrosCopiloto.length})
                </h4>

                {registrosCopiloto.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                    <Bot size={18} className="mx-auto mb-1 text-slate-400" />
                    <strong>Nenhum registro de IA ainda.</strong>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Use os botões "Resumir conversa" ou "Sugerir resposta" para acionar o
                      copiloto.
                    </p>
                  </div>
                ) : (
                  registrosCopiloto.map((reg) => (
                    <div
                      key={reg.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 hover:border-purple-200 transition-colors shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                            reg.tipo === 'resumo'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-pink-100 text-pink-800'
                          }`}
                        >
                          {reg.tipo === 'resumo' ? <FileText size={10} /> : <Sparkles size={10} />}
                          {reg.tipo === 'resumo' ? 'Resumo' : 'Sugestão'}
                        </span>
                        <time className="text-[10.5px] text-slate-400">
                          {formatCompact(reg.data || reg.created)}
                        </time>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed font-mono whitespace-pre-wrap bg-slate-50 p-2 rounded border border-slate-100">
                        {reg.conteudo}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                        <span className="flex items-center gap-1">
                          <User size={10} />
                          Solicitado por:{' '}
                          <strong className="text-slate-600">
                            {reg.autor_nome || 'Atendente'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
