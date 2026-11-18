import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  History,
  Inbox as InboxIcon,
  Info,
  Instagram,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  atualizarSituacao,
  cancelarInscricoes,
  inscreverConversas,
  inscreverMensagens,
  inscreverMudancas,
  listarConversas,
  listarMensagens,
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
import type {
  Cliente,
  ConexaoMetaStatus,
  Conversa,
  Mensagem,
  NotaInterna,
  Situacao,
} from '@/types/support'

const statusOptions: Array<{ value: Situacao | 'todas'; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'nova', label: 'Nova' },
  { value: 'em_atendimento', label: 'Em Atendimento' },
  { value: 'aguardando_cliente', label: 'Aguardando Cliente' },
  { value: 'resolvida', label: 'Resolvida' },
]
const statusLabel = (status: Situacao) =>
  statusOptions.find((item) => item.value === status)?.label || status
const avatarClass = (status: Situacao) => `avatar status-${status}`

function formatCompact(value: string) {
  const date = new Date(value)
  const now = new Date()
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return time
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${time}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`
}

function StatusBadge({ status }: { status: Situacao }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="empty-state">
      <div className="empty-illustration animate-float">
        <InboxIcon size={34} />
        <span>
          <MessageCircle size={18} />
        </span>
      </div>
      <strong>
        {filtered
          ? 'Nenhuma conversa encontrada com esses filtros.'
          : 'Nenhuma conversa ainda — quando o Instagram estiver conectado, elas aparecem aqui.'}
      </strong>
      {!filtered && (
        <p>A integração oficial com o Instagram poderá preencher esta área automaticamente.</p>
      )}
    </div>
  )
}

export default function Index() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [conexaoStatus, setConexaoStatus] = useState<ConexaoMetaStatus | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [conversasCliente, setConversasCliente] = useState<Conversa[]>([])
  const [notasCliente, setNotasCliente] = useState<NotaInterna[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Situacao | 'todas'>('todas')
  const [draftStatus, setDraftStatus] = useState<Situacao>('nova')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'contexto' | 'notas'>('contexto')
  const [novaNota, setNovaNota] = useState('')
  const [salvandoNota, setSalvandoNota] = useState(false)
  const historyEnd = useRef<HTMLDivElement>(null)

  const selected = conversas.find((item) => item.id === selectedId) || null
  const loadConversations = useCallback(async () => {
    try {
      const data = await listarConversas()
      setConversas(data)
      setSelectedId((current) => {
        if (current && data.some((item) => item.id === current)) return current
        return data[0]?.id || null
      })
    } catch {
      toast.error('Não foi possível carregar as conversas.')
    } finally {
      setLoading(false)
    }
  }, [])
  const loadMessages = useCallback(async (id: string) => {
    try {
      const msgs = await listarMensagens(id)
      setMensagens(msgs)
    } catch {
      toast.error('Não foi possível carregar o histórico.')
    }
  }, [])

  // Carrega contexto e notas do cliente selecionado
  const carregarContextoCliente = useCallback(async (conv: Conversa) => {
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
    setClienteSelecionado(cli)

    const cliId = cli?.id || conv.cliente_id
    const historico = await listarConversasDoCliente(
      cliId,
      conv.cliente_ig_id,
      conv.cliente_usuario,
    )
    setConversasCliente(historico)

    if (cliId) {
      const notas = await listarNotasInternas(cliId)
      setNotasCliente(notas)
    } else {
      setNotasCliente([])
    }
  }, [])

  useEffect(() => {
    void loadConversations()
    void obterStatusConexao()
      .then((st) => setConexaoStatus(st))
      .catch(() => {})

    void inscreverConversas(() => {
      void loadConversations()
    })
    void inscreverMensagens(() => {
      if (selectedId) void loadMessages(selectedId)
      void loadConversations()
    })
    void inscreverMudancas(() => {
      void loadConversations()
    })
    void inscreverNotasInternas(() => {
      if (selected) void carregarContextoCliente(selected)
    })

    // Inscreve em tempo real para mudanças na conexão e situação do app Meta
    let unsubscribeConexao: (() => void) | null = null
    try {
      import('@/lib/pocketbase/client').then(({ default: pbClient }) => {
        pbClient
          .collection('conexao_meta')
          .subscribe('*', () => {
            void obterStatusConexao()
              .then((st) => setConexaoStatus(st))
              .catch(() => {})
          })
          .then((unsub) => {
            unsubscribeConexao = unsub
          })
          .catch(() => {})
      })
    } catch {
      /* intentionally ignored */
    }

    return () => {
      void cancelarInscricoes()
      void cancelarInscricaoNotas()
      if (unsubscribeConexao) {
        try {
          unsubscribeConexao()
        } catch {
          /* intentionally ignored */
        }
      }
    }
  }, [loadConversations, loadMessages, selectedId])

  useEffect(() => {
    if (selected) {
      setDraftStatus(selected.situacao)
      void loadMessages(selected.id)
      void carregarContextoCliente(selected)

      // Zera não lidas se houver
      if (selected.nao_lidas > 0) {
        void zerarNaoLidas(selected.id).then(() => {
          setConversas((prev) =>
            prev.map((c) => (c.id === selected.id ? { ...c, nao_lidas: 0 } : c)),
          )
        })
      }
    }
  }, [selected?.id, selected?.situacao, loadMessages, carregarContextoCliente])
  useEffect(() => {
    historyEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  const lastMessages = useMemo(() => {
    const map = new Map<string, Mensagem>()
    mensagens.forEach((message) => map.set(message.conversa_id, message))
    return map
  }, [mensagens])
  const visible = useMemo(
    () =>
      conversas.filter((conversation) => {
        const query = search.toLocaleLowerCase('pt-BR').trim()
        return (
          (filter === 'todas' || conversation.situacao === filter) &&
          (!query ||
            conversation.cliente_nome.toLocaleLowerCase('pt-BR').includes(query) ||
            conversation.cliente_usuario.toLocaleLowerCase('pt-BR').includes(query))
        )
      }),
    [conversas, filter, search],
  )

  function openConversation(conversation: Conversa) {
    setSelectedId(conversation.id)
    setMobileDetail(true)
    if (conversation.nao_lidas > 0) {
      void zerarNaoLidas(conversation.id).then(() => {
        setConversas((prev) =>
          prev.map((c) => (c.id === conversation.id ? { ...c, nao_lidas: 0 } : c)),
        )
      })
    }
  }

  async function saveStatus() {
    if (!selected || !usuario || draftStatus === selected.situacao) return
    setSaving(true)
    try {
      const updated = await atualizarSituacao(selected, draftStatus, usuario.id)
      setConversas((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      toast.success(`Situação atualizada para '${statusLabel(draftStatus)}'`, { duration: 3000 })
    } catch {
      toast.error('Não foi possível atualizar a situação.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePassarParaEmAtendimento() {
    if (!selected || !usuario || selected.situacao === 'em_atendimento') return
    setSaving(true)
    try {
      const updated = await atualizarSituacao(selected, 'em_atendimento', usuario.id)
      setConversas((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setDraftStatus('em_atendimento')
      toast.success("Situação atualizada para 'Em Atendimento'")
    } catch {
      toast.error('Não foi possível alterar a situação.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCriarNota(e: React.FormEvent) {
    e.preventDefault()
    if (!novaNota.trim() || !usuario) return
    const cliId = clienteSelecionado?.id || selected?.cliente_id
    if (!cliId) {
      toast.error('Identificador do cliente não disponível para salvar nota.')
      return
    }

    setSalvandoNota(true)
    try {
      const created = await criarNotaInterna(cliId, novaNota, usuario.id)
      setNotasCliente((prev) => [created, ...prev])
      setNovaNota('')
      toast.success('Nota interna registrada com sucesso.')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar nota interna.')
    } finally {
      setSalvandoNota(false)
    }
  }

  // Conversas anteriores do cliente selecionado
  const conversasAnteriores = useMemo(() => {
    if (!selected) return []
    return conversasCliente.filter((c) => c.id !== selected.id)
  }, [conversasCliente, selected])

  const totalConversas = conversasCliente.length || 1
  const ordemAtual = useMemo(() => {
    if (!selected || conversasCliente.length === 0) return 1
    const ordenadas = [...conversasCliente].sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
    )
    const idx = ordenadas.findIndex((c) => c.id === selected.id)
    return idx >= 0 ? idx + 1 : conversasCliente.length
  }, [selected, conversasCliente])

  const ordinalLabel = `${ordemAtual}ª conversa`
  const dataDesde = clienteSelecionado?.primeira_interacao || selected?.created
  const mesAnoDesde = dataDesde
    ? `${new Date(dataDesde).toLocaleDateString('pt-BR', { month: 'long' })} de ${new Date(dataDesde).getFullYear()}`
    : ''

  const isConectada = conexaoStatus?.situacao === 'conectada'
  const appSituacao = conexaoStatus?.app_situacao || 'em teste'
  const isPublicado = appSituacao === 'publicado'

  // Análise da janela de resposta oficial da Meta para a conversa selecionada
  const validacaoJanela = useMemo(() => {
    if (!selected) return null
    return validarJanelaRespostaMeta({
      ultimaMensagemData: selected.ultima_mensagem_data,
    })
  }, [selected])

  const formatarDataMudanca = (dataStr?: string) => {
    if (!dataStr) return ''
    try {
      return new Date(dataStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  const renderBadgeSituacaoApp = () => {
    if (appSituacao === 'publicado') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <ShieldCheck size={11} className="text-emerald-700" />
          App Publicado
        </span>
      )
    }
    if (appSituacao === 'em revisão') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
          App em Revisão
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
        App em Teste
      </span>
    )
  }

  return (
    <section className={`inbox-page ${mobileDetail ? 'show-detail' : ''}`}>
      <div className="conversation-panel animate-fade-in-up">
        {/* Alerta oficial no topo da inbox enquanto o app NÃO estiver publicado */}
        {!isPublicado && (
          <div className="bg-amber-50 border-b border-amber-200 px-3.5 py-2 text-[11px] text-amber-950 flex items-start gap-2 shadow-xs transition-all duration-300">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">
              <span className="font-semibold">
                Integração em modo teste — só contas com papel no app mandam mensagem.
              </span>
              <p className="text-amber-800 mt-0.5 text-[10.5px]">
                {appSituacao === 'em revisão'
                  ? 'O aplicativo foi enviado para análise na Meta. Até a aprovação final, apenas administradores e testadores autorizados conseguem interagir.'
                  : 'Para receber mensagens de qualquer seguidor, envie o app para revisão no painel da Meta e marque como "publicado".'}
              </p>
            </div>
            <Link
              to="/conexao"
              className="text-amber-900 underline font-bold hover:text-amber-950 text-[10px] whitespace-nowrap self-center ml-1"
            >
              Ver detalhes
            </Link>
          </div>
        )}

        {/* Indicador fixo da conexão com o Instagram no topo da inbox */}
        <div className="inbox-connection-bar flex-wrap gap-y-1">
          <div className="connection-info flex-wrap">
            <span
              className={`connection-dot ${isConectada ? 'is-connected' : 'is-disconnected'}`}
              title={isConectada ? `Conectada — ${appSituacao}` : 'Desconectada'}
            />
            <Instagram size={13} className="connection-icon" />
            <span className="connection-label">
              {isConectada ? (
                <>
                  <strong>{conexaoStatus?.conta_usuario || 'Instagram'}</strong>{' '}
                  <span className="text-slate-600 text-xs">•</span>
                </>
              ) : (
                <span className="text-slate-500">Instagram: desconectada</span>
              )}
            </span>
            {renderBadgeSituacaoApp()}
            {conexaoStatus?.data_mudanca_situacao && (
              <span
                className="text-[10px] text-slate-500 hidden sm:inline"
                title={`Última alteração de situação: ${formatarDataMudanca(conexaoStatus.data_mudanca_situacao)}`}
              >
                ({formatarDataMudanca(conexaoStatus.data_mudanca_situacao)})
              </span>
            )}
          </div>
          <Link to="/conexao" className="connection-action">
            {isConectada ? (usuario?.role === 'admin' ? 'Gerenciar' : 'Ver conexão') : 'Conectar'}
          </Link>
        </div>

        <header className="panel-title">
          <div>
            <p>Conversas</p>
            <h1>Inbox</h1>
          </div>
          <span>
            {conversas.length} {conversas.length === 1 ? 'conversa' : 'conversas'}
          </span>
        </header>
        <div className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou usuário..."
          />
        </div>
        <div className="filter-label">
          <SlidersHorizontal size={15} /> Filtrar por situação
        </div>
        <div className="filter-tabs">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              className={filter === option.value ? 'active' : ''}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="conversation-list">
          {loading ? (
            <div className="list-loading">
              <Loader2 className="spin" />
              Carregando conversas...
            </div>
          ) : visible.length === 0 ? (
            <EmptyState filtered={Boolean(search || filter !== 'todas')} />
          ) : (
            visible.map((conversation) => {
              const preview =
                lastMessages.get(conversation.id)?.texto ||
                (conversation.id === selectedId ? mensagens[mensagens.length - 1]?.texto : '') ||
                'Abra para visualizar o histórico'
              return (
                <button
                  key={conversation.id}
                  className={`conversation-item ${selectedId === conversation.id ? 'active' : ''}`}
                  onClick={() => openConversation(conversation)}
                >
                  <div className={avatarClass(conversation.situacao)}>
                    {conversation.cliente_nome[0]}
                  </div>
                  <div className="conversation-copy">
                    <div className="conversation-top">
                      <strong>{conversation.cliente_nome}</strong>
                      <div className="flex items-center gap-1.5">
                        <time>{formatCompact(conversation.ultima_mensagem_data)}</time>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/conversa/${conversation.id}`)
                          }}
                          className="text-slate-400 hover:text-pink-600 p-0.5 rounded transition-colors"
                          title="Abrir tela de trabalho da conversa"
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    </div>
                    <span className="username">{conversation.cliente_usuario}</span>
                    <p>{preview}</p>
                    <div className="conversation-meta">
                      <StatusBadge status={conversation.situacao} />
                      {conversation.nao_lidas > 0 && (
                        <span className="unread">{conversation.nao_lidas}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
      <div className="detail-panel animate-fade-in-up">
        {!selected ? (
          <div className="select-prompt">
            <div>
              <MessageCircle size={32} />
            </div>
            <h2>Selecione uma conversa</h2>
            <p>Escolha uma conversa na lista para ver todo o histórico.</p>
          </div>
        ) : (
          <>
            <header className="detail-header">
              <button
                className="back-button"
                onClick={() => setMobileDetail(false)}
                aria-label="Voltar para a lista"
              >
                <ArrowLeft />
              </button>
              <div className={avatarClass(selected.situacao)}>{selected.cliente_nome[0]}</div>
              <div className="detail-customer min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong>{selected.cliente_nome}</strong>
                  <span>{selected.cliente_usuario}</span>
                </div>
                <p className="text-[11px] text-slate-500 font-normal mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{ordinalLabel}</span>
                  {mesAnoDesde && (
                    <>
                      <span>•</span>
                      <span>Cliente desde {mesAnoDesde}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/conversa/${selected.id}`}
                  className="hidden md:inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg transition-colors"
                  title="Abrir tela de trabalho dedicada com histórico completo"
                >
                  <ExternalLink size={13} />
                  <span>Tela inteira</span>
                </Link>
                <StatusBadge status={selected.situacao} />
              </div>
            </header>

            {/* Painel lateral de Contexto & Notas Internas integrado na visualização */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* HISTÓRICO DE MENSAGENS */}
              <div className="flex-1 flex flex-col min-w-0 border-b md:border-b-0 md:border-r border-slate-200">
                <div className="message-history flex-1 overflow-y-auto">
                  {mensagens.map((message) => (
                    <div
                      key={message.id}
                      className={`message-row ${message.remetente === 'central' ? 'sent' : 'received'}`}
                    >
                      <article className="message-bubble">
                        <strong>
                          {message.remetente === 'central'
                            ? message.expand?.atendente_id?.name || 'Central de Atendimento'
                            : selected.cliente_nome}
                        </strong>
                        <p>{message.texto}</p>
                        <footer>
                          <time>{formatCompact(message.data_hora)}</time>
                          {message.situacao === 'erro' && (
                            <span className="message-error">
                              <CircleAlert size={14} /> Erro
                            </span>
                          )}
                          {message.situacao === 'enviada' && <Check size={13} />}
                        </footer>
                      </article>
                    </div>
                  ))}
                  <div ref={historyEnd} />
                </div>

                {/* Bloco de conformidade com as regras da Meta & Janela de Resposta */}
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs shrink-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <ShieldCheck size={14} className="text-pink-600" />
                      <span>Regras da Meta (Janela de Resposta)</span>
                    </div>
                    {validacaoJanela?.dentro_janela ? (
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check size={12} /> Janela de 24h ativa ({validacaoJanela.horas_restantes}h
                        restantes)
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CircleAlert size={12} /> Janela de 24h expirada
                      </span>
                    )}
                  </div>

                  {!validacaoJanela?.dentro_janela ? (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px] leading-relaxed">
                      <strong className="block font-bold mb-0.5">Envio bloqueado pela Meta:</strong>
                      {validacaoJanela?.mensagem}
                    </div>
                  ) : (
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Dentro do período de 24 horas da última mensagem do cliente. Respostas até
                      1.000 bytes.
                    </p>
                  )}
                </div>

                <footer className="status-editor shrink-0">
                  <div>
                    <span>Situação da conversa</span>
                    <small>Atualize o andamento deste atendimento</small>
                  </div>
                  <div className="status-actions">
                    {selected.situacao === 'nova' && (
                      <button
                        type="button"
                        onClick={handlePassarParaEmAtendimento}
                        disabled={saving}
                        className="px-2.5 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors inline-flex items-center gap-1 mr-1"
                        title="Passar situação diretamente para 'Em Atendimento'"
                      >
                        <Check size={13} /> Em Atendimento
                      </button>
                    )}
                    <label className="select-wrap">
                      <select
                        value={draftStatus}
                        onChange={(e) => setDraftStatus(e.target.value as Situacao)}
                      >
                        {statusOptions.slice(1).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} />
                    </label>
                    <button
                      className="primary-button save-status"
                      disabled={saving || draftStatus === selected.situacao}
                      onClick={saveStatus}
                    >
                      {saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Salvar
                    </button>
                  </div>
                </footer>
              </div>

              {/* PAINEL LATERAL DE CONTEXTO E NOTAS INTERNAS */}
              <div className="w-full md:w-72 lg:w-80 bg-slate-50/50 flex flex-col shrink-0 overflow-hidden">
                {/* Abas */}
                <div className="flex border-b border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setSidebarTab('contexto')}
                    className={`flex-1 py-2 text-xs font-bold border-b-2 flex items-center justify-center gap-1 transition-colors ${
                      sidebarTab === 'contexto'
                        ? 'border-pink-600 text-pink-700 bg-slate-50'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <History size={12} /> Contexto
                    <span className="text-[10px] bg-slate-200 px-1.5 rounded-full">
                      {totalConversas}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('notas')}
                    className={`flex-1 py-2 text-xs font-bold border-b-2 flex items-center justify-center gap-1 transition-colors ${
                      sidebarTab === 'notas'
                        ? 'border-pink-600 text-pink-700 bg-slate-50'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Lock size={12} className="text-amber-600" /> Notas
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 rounded-full border border-amber-200">
                      {notasCliente.length}
                    </span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {sidebarTab === 'contexto' ? (
                    <>
                      {/* Resumo do cliente */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2">
                        <div className="text-xs text-slate-600">
                          <strong className="block text-slate-900 font-bold text-sm">
                            {selected.cliente_nome}
                          </strong>
                          <span className="text-pink-600 font-medium">
                            {selected.cliente_usuario}
                          </span>
                        </div>
                        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">
                              Conversas
                            </span>
                            <strong className="text-slate-800">{ordinalLabel}</strong>
                            <span className="text-[10px] text-slate-500 block">
                              ({totalConversas} no total)
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">
                              Cliente desde
                            </span>
                            <strong className="text-slate-800">{mesAnoDesde || 'Recente'}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Conversas Anteriores */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                            <History size={12} className="text-slate-500" />
                            Conversas anteriores ({conversasAnteriores.length})
                          </span>
                          <span className="text-[10px] text-slate-400">Só deste cliente</span>
                        </div>

                        {conversasAnteriores.length === 0 ? (
                          <div className="p-3 bg-white rounded-lg border border-slate-200 text-center text-xs text-slate-500">
                            <strong>Nenhuma conversa anterior.</strong>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Este é o primeiro atendimento registrado.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {conversasAnteriores.map((ant) => (
                              <button
                                key={ant.id}
                                type="button"
                                onClick={() => openConversation(ant)}
                                className="w-full text-left p-2.5 bg-white rounded-lg border border-slate-200 hover:border-pink-300 hover:bg-pink-50/20 transition-all group"
                              >
                                <div className="flex items-center justify-between gap-1 text-[11px] mb-0.5">
                                  <StatusBadge status={ant.situacao} />
                                  <time className="text-[10px] text-slate-400">
                                    {formatCompact(ant.ultima_mensagem_data)}
                                  </time>
                                </div>
                                <span className="text-[11px] font-medium text-pink-700 group-hover:underline">
                                  Ver histórico →
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Notas Internas */}
                      <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-950">
                        <strong className="flex items-center gap-1 font-bold text-amber-900">
                          <Lock size={12} className="text-amber-700" /> Uso exclusivo da equipe
                        </strong>
                        <p className="text-[10.5px] text-amber-800 mt-0.5">
                          Notas nunca são enviadas ao cliente e ficam visíveis em qualquer conversa
                          deste cliente.
                        </p>
                      </div>

                      <form onSubmit={handleCriarNota} className="space-y-2">
                        <textarea
                          value={novaNota}
                          onChange={(e) => setNovaNota(e.target.value)}
                          placeholder="Observação da equipe (ex.: cliente VIP, prefere resposta curta)..."
                          rows={2}
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-pink-500 resize-none"
                          disabled={salvandoNota}
                        />
                        <button
                          type="submit"
                          disabled={salvandoNota || !novaNota.trim()}
                          className="w-full py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                        >
                          {salvandoNota ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Plus size={12} />
                          )}
                          Salvar nota
                        </button>
                      </form>

                      <div className="space-y-2">
                        {notasCliente.length === 0 ? (
                          <div className="p-3 bg-white rounded-lg border border-slate-200 text-center text-xs text-slate-500">
                            <strong>Nenhuma nota interna ainda.</strong>
                            <p className="text-[10.5px] text-slate-400 mt-0.5">
                              Registre a primeira observação da equipe.
                            </p>
                          </div>
                        ) : (
                          notasCliente.map((n) => (
                            <div
                              key={n.id}
                              className="p-2.5 bg-white rounded-lg border border-amber-200 text-xs space-y-1 shadow-2xs"
                            >
                              <p className="text-slate-800 leading-snug">{n.texto}</p>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                                <span className="font-semibold text-slate-600">
                                  {n.expand?.autor_id?.name || 'Equipe'}
                                </span>
                                <time>{formatCompact(n.data)}</time>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
