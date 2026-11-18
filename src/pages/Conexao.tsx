import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  History,
  Info,
  Instagram,
  Key,
  Layers,
  Link as LinkIcon,
  Loader2,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  alterarSituacaoApp,
  desconectarContaInstagram,
  getFrontendRedirectUrl,
  getWebhookCallbackUrl,
  listarAvisosWebhook,
  listarHistoricoConexao,
  obterStatusConexao,
  REGRAS_OFICIAIS_META,
  salvarConfiguracoesMeta,
  trocarCodigoOAuth,
} from '@/services/conexao'
import { obterConfiguracoesIA, salvarConfiguracoesIA } from '@/services/copiloto'
import { Bot, MessageSquare } from 'lucide-react'
import type {
  AppSituacaoMeta,
  AvisoWebhook,
  ConexaoMetaStatus,
  ConfiguracoesIA,
  HistoricoConexao,
} from '@/types/support'

export default function Conexao() {
  const { usuario } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isAdmin = usuario?.role === 'admin'

  // Estados principais
  const [status, setStatus] = useState<ConexaoMetaStatus | null>(null)
  const [historico, setHistorico] = useState<HistoricoConexao[]>([])
  const [avisosWebhook, setAvisosWebhook] = useState<AvisoWebhook[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  const [conectando, setConectando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [alterandoSituacao, setAlterandoSituacao] = useState(false)
  const [copiadoCampo, setCopiadoCampo] = useState<string | null>(null)

  // Formulário Dados do App
  const [appNome, setAppNome] = useState('')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [urlLogin, setUrlLogin] = useState('')

  // Configurações do Copiloto IA (Etapa 6: tom de voz e instruções fixas)
  const [tomDeVoz, setTomDeVoz] = useState('simpático e direto, tratando de você')
  const [instrucoesFixas, setInstrucoesFixas] = useState(
    'Nunca prometa prazo de entrega ou preço não confirmado. Sempre seja empático e acolhedor.',
  )
  const [salvandoConfigIa, setSalvandoConfigIa] = useState(false)
  const [configIaInfo, setConfigIaInfo] = useState<{ updated?: string; autor?: string }>({})

  // Valores gerados pelo projeto
  const redirectUri = useMemo(() => getFrontendRedirectUrl(), [])
  const webhookCallbackUrl = useMemo(() => getWebhookCallbackUrl(), [])

  // Carrega status e histórico
  const carregarDados = useCallback(async () => {
    try {
      const data = await obterStatusConexao()
      setStatus(data)
      setAppNome(data.app_nome || '')
      setAppId(data.app_id || '')
      setUrlLogin(data.url_login || '')
      // app_secret é mantido em branco no formulário para indicar que não será alterado a menos que o admin digite novo
      setAppSecret('')

      // Carregar configurações de IA
      try {
        const cfgIa = await obterConfiguracoesIA()
        if (cfgIa.tom_de_voz) setTomDeVoz(cfgIa.tom_de_voz)
        if (cfgIa.instrucoes_fixas !== undefined) setInstrucoesFixas(cfgIa.instrucoes_fixas)
        setConfigIaInfo({
          updated: cfgIa.updated,
          autor: cfgIa.atualizado_por_nome,
        })
      } catch {
        /* ignore */
      }

      if (isAdmin) {
        const hist = await listarHistoricoConexao()
        setHistorico(hist)
        const avisos = await listarAvisosWebhook(20)
        setAvisosWebhook(avisos)
      }
    } catch {
      toast.error('Erro ao carregar dados da conexão.')
    } finally {
      setCarregando(false)
    }
  }, [isAdmin])

  // Tratamento do retorno da Meta no redirect (/conexao?code=... ou ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    const errorParam = params.get('error')
    const errorDescription = params.get('error_description') || params.get('error_reason')

    if (errorParam) {
      toast.error(
        'Autorização cancelada ou não concluída no Instagram. Nenhuma conexão foi alterada.',
        { duration: 6000 },
      )
      // Limpa os query params da URL sem recarregar a página
      navigate('/conexao', { replace: true })
      return
    }

    if (code) {
      const completarConexao = async () => {
        setConectando(true)
        try {
          const res = await trocarCodigoOAuth(code, redirectUri)
          toast.success(
            `Conta ${res.conta_usuario} conectada com sucesso! Situação: conectada — modo teste.`,
            { duration: 5000 },
          )
          await carregarDados()
        } catch (err: any) {
          const msg =
            err?.data?.error ||
            err?.message ||
            'Não foi possível completar a conexão. O código expirou (1h), já foi utilizado ou é inválido.'
          toast.error(msg, { duration: 6000 })
        } finally {
          setConectando(false)
          // Limpa o código da URL para não reenviar em refresh
          navigate('/conexao', { replace: true })
        }
      }

      void completarConexao()
    }
  }, [location.search, navigate, redirectUri, carregarDados])

  useEffect(() => {
    void carregarDados()

    // Inscreve no realtime da conexão para refletir mudanças feitas por outros admins/instâncias
    let unsubscribeConexao: (() => void) | null = null
    try {
      import('@/lib/pocketbase/client').then(({ default: pbClient }) => {
        pbClient
          .collection('conexao_meta')
          .subscribe('*', () => {
            void carregarDados()
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
      if (unsubscribeConexao) {
        try {
          unsubscribeConexao()
        } catch {
          /* intentionally ignored */
        }
      }
    }
  }, [carregarDados])

  // Função para Admin alterar a situação do aplicativo
  const handleAlterarSituacao = async (nova: AppSituacaoMeta) => {
    if (!isAdmin) return
    const atual = status?.app_situacao || 'em teste'
    if (atual === nova) return

    let mensagemConfirmacao = `Deseja realmente alterar a situação do app para "${nova.toUpperCase()}"?`
    if (nova === 'publicado') {
      mensagemConfirmacao =
        'Confirmar alteração para PUBLICADO?\n\nFaça isso apenas após a Meta aprovar todas as permissões e publicar o app em developers.facebook.com. O alerta de modo teste será removido da Inbox e a central passará a operar para todos os usuários.'
    } else if (nova === 'em revisão') {
      mensagemConfirmacao =
        'Confirmar alteração para EM REVISÃO?\n\nMarque esta opção logo após submeter os dados e permissões no painel da Meta for Developers para análise.'
    }

    if (!window.confirm(mensagemConfirmacao)) return

    setAlterandoSituacao(true)
    try {
      const res = await alterarSituacaoApp(nova)
      toast.success(`Situação do app atualizada para "${res.app_situacao}"!`, { duration: 4000 })
      await carregarDados()
    } catch (err: any) {
      toast.error(err?.data?.error || err?.message || 'Erro ao alterar situação do app.')
    } finally {
      setAlterandoSituacao(false)
    }
  }

  // Função para copiar com feedback visual
  const copiarTexto = async (texto: string, campo: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiadoCampo(campo)
      toast.success('Copiado para a área de transferência!')
      setTimeout(() => setCopiadoCampo(null), 2000)
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  // Salvar Dados do App e URL de login
  const handleSalvarConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return

    setSalvandoConfig(true)
    try {
      const payload: {
        app_nome?: string
        app_id?: string
        app_secret?: string
        url_login?: string
      } = {
        app_nome: appNome.trim(),
        app_id: appId.trim(),
        url_login: urlLogin.trim(),
      }

      // Se preencheu nova chave secreta
      if (appSecret.trim()) {
        payload.app_secret = appSecret.trim()
      }

      const res = await salvarConfiguracoesMeta(payload)
      setStatus(res)
      setAppSecret('')
      toast.success('Configurações salvas e registradas no histórico!')
      const hist = await listarHistoricoConexao()
      setHistorico(hist)
    } catch (err: any) {
      toast.error(err?.data?.error || 'Erro ao salvar configurações.')
    } finally {
      setSalvandoConfig(false)
    }
  }

  // Salvar Configurações do Copiloto IA (só Administrador)
  const handleSalvarConfigIa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    if (!tomDeVoz.trim()) {
      toast.error('O tom de voz da marca é obrigatório.')
      return
    }

    setSalvandoConfigIa(true)
    try {
      const res = await salvarConfiguracoesIA(tomDeVoz.trim(), instrucoesFixas.trim())
      setConfigIaInfo({
        updated: res.updated,
        autor: res.atualizado_por_nome,
      })
      toast.success('Configurações do Copiloto de IA salvas com sucesso!')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar configurações de IA.')
    } finally {
      setSalvandoConfigIa(false)
    }
  }

  // Ação "Conectar conta" usando a URL EXATA cadastrada pelo Admin
  const handleConectarConta = () => {
    const url = status?.url_login || urlLogin
    if (!url || !url.trim()) {
      toast.error(
        'Nenhuma URL de login do Instagram cadastrada. Por favor, cole a URL de autorização no bloco de dados e salve antes de conectar.',
        { duration: 5000 },
      )
      return
    }

    try {
      // Validação básica se é uma URL válida
      new URL(url.trim())
    } catch {
      toast.error('A URL de login cadastrada não é uma URL válida. Verifique e salve novamente.')
      return
    }

    // Regra crítica: o projeto NUNCA altera ou substitui essa URL
    window.location.href = url.trim()
  }

  // Desconectar conta conectada
  const handleDesconectar = async () => {
    if (!isAdmin) return
    const confirma = window.confirm(
      'Tem certeza que deseja desconectar esta conta do Instagram? As conversas existentes na Inbox serão mantidas intactas.',
    )
    if (!confirma) return

    setDesconectando(true)
    try {
      await desconectarContaInstagram()
      toast.success('Conta desconectada com sucesso. As conversas foram preservadas.')
      await carregarDados()
    } catch {
      toast.error('Erro ao desconectar conta.')
    } finally {
      setDesconectando(false)
    }
  }

  const appSituacao = status?.app_situacao || 'em teste'

  const formatarData = (dataStr?: string) => {
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

  const situacaoBadge = () => {
    const s = status?.situacao || 'desconectada'
    if (s === 'conectada') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Conectada
          </span>
          {badgeAppSituacao()}
        </div>
      )
    }
    if (s === 'reconectar') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Reconectar necessário
          </span>
          {badgeAppSituacao()}
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          Desconectada
        </span>
        {badgeAppSituacao()}
      </div>
    )
  }

  const badgeAppSituacao = () => {
    if (appSituacao === 'publicado') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 size={13} className="text-emerald-700" />
          Publicado
        </span>
      )
    }
    if (appSituacao === 'em revisão') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
          Em revisão
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
        <span className="w-2 h-2 rounded-full bg-amber-600" />
        Em teste
      </span>
    )
  }

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-pink-600" />
        <p className="text-sm font-medium">Carregando dados da conexão com a Meta...</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-fade-in-up">
      {/* Banner de status durante a troca do código */}
      {conectando && (
        <div className="p-4 bg-pink-50 border border-pink-200 rounded-xl flex items-center gap-3 text-pink-900 shadow-sm animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin text-pink-600 flex-shrink-0" />
          <div>
            <strong className="block text-sm font-bold">Completando conexão...</strong>
            <p className="text-xs text-pink-700">
              Trocando o código de autorização único pelo token de longa duração e validando a conta
              do Instagram.
            </p>
          </div>
        </div>
      )}

      {/* Cabeçalho da página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-pink-600 font-semibold text-xs tracking-wider uppercase">
            <Instagram size={15} />
            <span>Integração Oficial Meta</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Conexão com o Instagram
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerencie a integração da conta profissional com a API do Instagram Graph e Meta for
            Developers.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">{situacaoBadge()}</div>
      </div>

      {/* Bloco 1: Cartão da Conta Conectada ou Pronta para Conexão */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                status?.situacao === 'conectada'
                  ? 'bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Instagram size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {status?.situacao === 'conectada' && status.conta_usuario
                    ? status.conta_usuario
                    : 'Nenhuma conta conectada'}
                </h2>
                {status?.situacao === 'conectada' && (
                  <span className="text-emerald-600 text-xs font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Ativa
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {status?.situacao === 'conectada'
                  ? `${status.conta_nome || 'Conta Profissional'} • Conexão realizada em ${
                      formatarData(status.data_conexao) || 'recente'
                    }`
                  : 'A conexão é feita pelo login direto no Instagram, autorizando as permissões da conta profissional.'}
              </p>
              {status?.situacao === 'reconectar' && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span>
                    O token de acesso expirou ou foi revogado no Instagram. Clique no botão abaixo
                    para renovar o acesso.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Botões de Ação para Admin */}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleConectarConta}
                disabled={conectando || desconectando}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 active:scale-95 transition shadow-sm disabled:opacity-50"
              >
                <Instagram size={17} />
                <span>
                  {status?.situacao === 'conectada'
                    ? 'Reconectar / Trocar conta'
                    : status?.situacao === 'reconectar'
                      ? 'Reconectar conta'
                      : 'Conectar conta'}
                </span>
              </button>

              {status?.situacao === 'conectada' && (
                <button
                  type="button"
                  onClick={handleDesconectar}
                  disabled={desconectando || conectando}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 active:scale-95 transition disabled:opacity-50"
                >
                  {desconectando ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  <span>Desconectar</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BLOCO ETAPA 3: Indicador & Controle da Situação do App na Meta */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Situação do Aplicativo na Meta</h2>
              {badgeAppSituacao()}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Controle de ciclo de vida do app conforme o painel{' '}
              <strong className="text-slate-700">Meta for Developers</strong>.
              {status?.data_mudanca_situacao && (
                <span className="ml-1 text-slate-600 font-medium">
                  Última alteração em: {formatarData(status.data_mudanca_situacao)}.
                </span>
              )}
            </p>
          </div>

          {/* Controle exclusivo para Administrador */}
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 px-2 uppercase tracking-wider">
                Alterar situação:
              </span>
              <button
                type="button"
                onClick={() => handleAlterarSituacao('em teste')}
                disabled={alterandoSituacao || appSituacao === 'em teste'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  appSituacao === 'em teste'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                } disabled:opacity-70`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-300" />
                Em teste
              </button>
              <button
                type="button"
                onClick={() => handleAlterarSituacao('em revisão')}
                disabled={alterandoSituacao || appSituacao === 'em revisão'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  appSituacao === 'em revisão'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                } disabled:opacity-70`}
              >
                <span className="w-2 h-2 rounded-full bg-indigo-300" />
                Em revisão
              </button>
              <button
                type="button"
                onClick={() => handleAlterarSituacao('publicado')}
                disabled={alterandoSituacao || appSituacao === 'publicado'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  appSituacao === 'publicado'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                } disabled:opacity-70`}
              >
                <CheckCircle2 size={13} />
                Publicado
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5">
              <Lock size={12} className="text-slate-400" />
              <span>Apenas administradores alteram a situação do app</span>
            </div>
          )}
        </div>

        {/* Explicação da situação atual */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div
            className={`p-3 rounded-xl border transition ${
              appSituacao === 'em teste'
                ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-200'
                : 'bg-slate-50 border-slate-200 text-slate-500 opacity-75'
            }`}
          >
            <div className="font-bold text-slate-900 flex items-center justify-between mb-1">
              <span>1. Em teste</span>
              {appSituacao === 'em teste' && (
                <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                  Atual
                </span>
              )}
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Modo de desenvolvimento. Apenas contas registradas com papel no app (administradores,
              desenvolvedores e testadores na Meta) conseguem enviar e receber mensagens.
            </p>
          </div>

          <div
            className={`p-3 rounded-xl border transition ${
              appSituacao === 'em revisão'
                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200'
                : 'bg-slate-50 border-slate-200 text-slate-500 opacity-75'
            }`}
          >
            <div className="font-bold text-slate-900 flex items-center justify-between mb-1">
              <span>2. Em revisão</span>
              {appSituacao === 'em revisão' && (
                <span className="text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded font-bold">
                  Atual
                </span>
              )}
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              O app foi submetido para análise da equipe da Meta com as permissões de mensagens.
              Enquanto aguarda aprovação, continua restrito a contas com papel.
            </p>
          </div>

          <div
            className={`p-3 rounded-xl border transition ${
              appSituacao === 'publicado'
                ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-200'
                : 'bg-slate-50 border-slate-200 text-slate-500 opacity-75'
            }`}
          >
            <div className="font-bold text-slate-900 flex items-center justify-between mb-1">
              <span>3. Publicado (Live)</span>
              {appSituacao === 'publicado' && (
                <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">
                  Atual
                </span>
              )}
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Aprovado pela Meta e ativo publicamente. Qualquer cliente ou seguidor do Instagram
              pode enviar mensagens para a conta e ser atendido pela central.
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          BLOCO ETAPA 6: CONFIGURAÇÃO DO COPILOTO COM IA (TOM DE VOZ & INSTRUÇÕES)
          (Acessível apenas a administradores para edição; atendentes veem modo leitura)
          ===================================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 text-white flex items-center justify-center shadow-xs">
              <Bot size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Configuração do Copiloto de IA
                </h2>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                  Agente Nativo Skip Cloud
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Defina as diretrizes que a IA segue ao resumir conversas e sugerir rascunhos de
                resposta.
              </p>
            </div>
          </div>

          {configIaInfo.updated && (
            <div className="text-[11px] text-slate-400 self-start md:self-auto">
              Última atualização por{' '}
              <strong className="text-slate-600">{configIaInfo.autor || 'Admin'}</strong> em{' '}
              {formatarData(configIaInfo.updated)}
            </div>
          )}
        </div>

        {isAdmin ? (
          <form onSubmit={handleSalvarConfigIa} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Tom de voz da marca <span className="text-pink-600">*</span>
              </label>
              <input
                type="text"
                value={tomDeVoz}
                onChange={(e) => setTomDeVoz(e.target.value)}
                placeholder='Ex.: "simpático e direto, tratando de você"'
                className="w-full text-xs px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-100 text-slate-800 bg-white"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Orienta o estilo de redação das respostas sugeridas para os clientes no Direct.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Instruções fixas da marca (guardrails)
              </label>
              <textarea
                rows={3}
                value={instrucoesFixas}
                onChange={(e) => setInstrucoesFixas(e.target.value)}
                placeholder='Ex.: "nunca prometa prazo de entrega; sempre confirme o endereço antes de fechar; mencione a política de troca de 30 dias"'
                className="w-full text-xs p-3 border border-slate-200 rounded-xl outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-100 text-slate-800 resize-none bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Regras inegociáveis injetadas no prompt do agente a cada solicitação.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Lock size={12} /> Somente administradores podem alterar o tom e instruções da
                marca.
              </span>
              <button
                type="submit"
                disabled={salvandoConfigIa}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs text-white bg-slate-900 hover:bg-slate-800 active:scale-95 transition shadow-xs disabled:opacity-50"
              >
                {salvandoConfigIa ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>Salvar Configurações de IA</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <div>
              <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wide">
                Tom de voz configurado:
              </span>
              <p className="text-slate-900 font-medium mt-0.5 italic">
                "{tomDeVoz || 'simpático e direto, tratando de você'}"
              </p>
            </div>
            {instrucoesFixas && (
              <div>
                <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wide">
                  Instruções fixas ativas:
                </span>
                <p className="text-slate-600 mt-0.5 leading-relaxed whitespace-pre-wrap">
                  {instrucoesFixas}
                </p>
              </div>
            )}
            <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-200 flex items-center gap-1">
              <Lock size={12} />
              Apenas administradores podem editar o tom de voz e instruções da marca.
            </p>
          </div>
        )}
      </div>

      {/* BLOCO ETAPA 3: REGRAS E LIMITES OFICIAIS DA META (Visível para Admin e Atendente — Somente Leitura) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-pink-100 text-pink-700 flex items-center justify-center">
              <Shield size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Regras Oficiais e Limites Vigentes da Meta
              </h2>
              <p className="text-xs text-slate-500">
                Parâmetros oficiais que regem a troca de mensagens na API do Instagram (não
                editáveis).
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md self-start md:self-auto border border-slate-200">
            {REGRAS_OFICIAIS_META.fonte_oficial}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* Card 1: Janela Padrão de 24 horas */}
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Calendar size={14} className="text-pink-600" />
                  Janela de Resposta Padrão
                </span>
                <span className="text-[10px] font-extrabold text-pink-700 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded">
                  24 horas
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {REGRAS_OFICIAIS_META.janela_padrao_descricao}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10.5px] text-slate-500">
              Fora desta janela, novas mensagens são bloqueadas pela Meta.
            </div>
          </div>

          {/* Card 2: Janela Human Agent */}
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <User size={14} className="text-indigo-600" />
                  Janela Human Agent
                </span>
                <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                  7 dias
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {REGRAS_OFICIAIS_META.janela_human_agent_descricao}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10.5px] text-slate-500">
              Tag específica: <code className="font-mono text-indigo-700">human_agent</code>.
            </div>
          </div>

          {/* Card 3: Iniciativa da Conversa */}
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ArrowRight size={14} className="text-amber-600" />
                  Iniciativa da Conversa
                </span>
                <span className="text-[10px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  Cliente primeiro
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {REGRAS_OFICIAIS_META.iniciativa_conversa_descricao}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10.5px] text-slate-500">
              O botão de resposta só é liberado mediante mensagem recebida.
            </div>
          </div>

          {/* Card 4: Limites de Envio (Rate Limits) */}
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers size={14} className="text-emerald-600" />
                  Limites de Envio (Rate Limits)
                </span>
                <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  100 req/s
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {REGRAS_OFICIAIS_META.limites_envio.descricao}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10.5px] text-slate-500">
              Por conta profissional conectada.
            </div>
          </div>

          {/* Card 5: Tamanho do Texto */}
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Info size={14} className="text-sky-600" />
                  Tamanho Máximo do Texto
                </span>
                <span className="text-[10px] font-extrabold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                  1.000 bytes
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {REGRAS_OFICIAIS_META.tamanho_maximo_texto_descricao}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10.5px] text-slate-500">
              Textos acima de 1.000 bytes são automaticamente rejeitados.
            </div>
          </div>

          {/* Card 6: Permissões Exigidas */}
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-purple-600" />
                  Permissões Obrigatórias
                </span>
                <span className="text-[10px] font-extrabold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                  2 escopos
                </span>
              </div>
              <div className="space-y-1 mb-2">
                {REGRAS_OFICIAIS_META.permissoes_exigidas.map((perm) => (
                  <div
                    key={perm}
                    className="font-mono text-[11px] bg-purple-50 text-purple-900 px-2 py-0.5 rounded border border-purple-200 inline-block mr-1"
                  >
                    {perm}
                  </div>
                ))}
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                {REGRAS_OFICIAIS_META.permissoes_descricao}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10.5px] text-slate-500">
              Exigidas na análise de verificação do app na Meta.
            </div>
          </div>
        </div>
      </div>

      {/* Visão para Atendentes (não-admin) */}
      {!isAdmin && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-slate-700">
          <div className="flex items-center gap-2 text-slate-900 font-bold mb-2">
            <Shield size={18} className="text-pink-600" />
            <h3>Acesso de Atendimento</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Você tem permissão para visualizar o status da conexão com o Instagram, a situação do
            app ({appSituacao}) e as regras vigentes da Meta. Os parâmetros de desenvolvedor da
            Meta, credenciais e chaves de segurança são restritos aos administradores do sistema.
          </p>
        </div>
      )}

      {/* Seção Completa de Configuração (exclusiva para Administradores) */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* BLOCO: Configuração para a Meta (O que o projeto GERA para colar lá) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-pink-100 text-pink-700 flex items-center justify-center">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Configuração para a Meta</h2>
                    <p className="text-xs text-slate-500">
                      Copie estes valores e cole no Painel de Desenvolvedores da Meta.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Item 1: URL de callback do webhook */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <LinkIcon size={13} className="text-pink-600" />
                      URL de callback do webhook
                    </label>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded">
                      GET + POST
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 overflow-x-auto select-all">
                      {webhookCallbackUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copiarTexto(webhookCallbackUrl, 'webhook')}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                      title="Copiar URL"
                    >
                      {copiadoCampo === 'webhook' ? (
                        <Check size={14} className="text-emerald-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                      <span>{copiadoCampo === 'webhook' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1">
                    <Info size={13} className="text-pink-500 flex-shrink-0 mt-0.5" />
                    <span>
                      Cole em: <strong>Painel Meta → Instagram → Webhooks → Configurar</strong> no
                      campo <em>URL de retorno de chamada</em>.
                    </span>
                  </p>
                </div>

                {/* Item 2: Verify token */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Key size={13} className="text-pink-600" />
                      Verify token (código de verificação)
                    </label>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Gerado pelo projeto
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 overflow-x-auto select-all">
                      {status?.verify_token || 'Token não gerado'}
                    </code>
                    <button
                      type="button"
                      onClick={() => copiarTexto(status?.verify_token || '', 'verify_token')}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                      title="Copiar token"
                    >
                      {copiadoCampo === 'verify_token' ? (
                        <Check size={14} className="text-emerald-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                      <span>{copiadoCampo === 'verify_token' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1">
                    <Info size={13} className="text-pink-500 flex-shrink-0 mt-0.5" />
                    <span>
                      Cole em: <strong>Painel Meta → Instagram → Webhooks</strong> no campo{' '}
                      <em>Token de verificação</em> ao salvar o webhook.
                    </span>
                  </p>
                </div>

                {/* Item 3: URL de redirecionamento OAuth */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ExternalLink size={13} className="text-pink-600" />
                      URL de redirecionamento OAuth
                    </label>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded">
                      OAuth 2.0
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 overflow-x-auto select-all">
                      {redirectUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => copiarTexto(redirectUri, 'redirect_uri')}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                      title="Copiar URL de redirecionamento"
                    >
                      {copiadoCampo === 'redirect_uri' ? (
                        <Check size={14} className="text-emerald-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                      <span>{copiadoCampo === 'redirect_uri' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1">
                    <Info size={13} className="text-pink-500 flex-shrink-0 mt-0.5" />
                    <span>
                      Cole em:{' '}
                      <strong>
                        Painel Meta → Instagram → Configuração da API → URLs de redirecionamento
                        OAuth válidas
                      </strong>
                      .
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-[11px] text-amber-900 flex items-start gap-2">
              <ShieldAlert size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Regra de segurança:</strong> A Meta fará um teste de verificação chamando a
                URL de callback com o <em>hub.verify_token</em> configurado. O backend responde com
                o <em>hub.challenge</em> automaticamente.
              </span>
            </div>
          </div>

          {/* BLOCO: Dados do App (O que VEM da Meta para cá + URL de Login) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Layers size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Dados do App na Meta</h2>
                <p className="text-xs text-slate-500">
                  Preencha as informações obtidas no painel de desenvolvedores.
                </p>
              </div>
            </div>

            <form onSubmit={handleSalvarConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome do App na Meta
                </label>
                <input
                  type="text"
                  value={appNome}
                  onChange={(e) => setAppNome(e.target.value)}
                  placeholder="Ex.: Central Atendimento Dev"
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Identificador do App (App ID)
                </label>
                <input
                  type="text"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="Ex.: 123456789012345"
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-100"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Lock size={12} className="text-slate-500" /> Chave Secreta do App (App Secret)
                  </label>
                  {status?.tem_app_secret && (
                    <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Salvo ({status.app_secret_mascarado})
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder={
                    status?.tem_app_secret
                      ? 'Deixe em branco para manter a chave atual ou digite nova'
                      : 'Cole a chave secreta gerada no painel da Meta'
                  }
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-100"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Por segurança, chaves secretas nunca são reexibidas completas após salvas.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  URL de login do Instagram (Autorização OAuth)
                </label>
                <textarea
                  rows={3}
                  value={urlLogin}
                  onChange={(e) => setUrlLogin(e.target.value)}
                  placeholder="https://api.instagram.com/oauth/authorize?client_id=...&redirect_uri=...&scope=instagram_business_basic,instagram_business_manage_messages&response_type=code"
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-pink-600 focus:ring-2 focus:ring-pink-100 resize-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Cole a URL de autorização montada no painel da Meta com App ID e permissões. O
                  sistema usará <strong>exatamente esta URL</strong> ao clicar em "Conectar conta".
                </p>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  type="submit"
                  disabled={salvandoConfig}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-slate-900 hover:bg-slate-800 active:scale-95 transition disabled:opacity-50"
                >
                  {salvandoConfig ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Salvar Dados do App</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BLOCO: Histórico de Configuração (exclusivo para Administrador) */}
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <History size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Histórico de Configuração</h2>
                <p className="text-xs text-slate-500">
                  Registro de auditoria de alterações nas credenciais e conexões da Meta.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={carregarDados}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-slate-100"
              title="Atualizar histórico"
            >
              <RefreshCw size={13} />
              <span>Atualizar</span>
            </button>
          </div>

          {historico.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center italic">
              Nenhuma alteração registrada até o momento.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
              {historico.map((item) => (
                <div key={item.id} className="p-3.5 hover:bg-slate-50/70 transition text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{item.acao}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-600 flex items-center gap-1">
                        <User size={12} className="text-slate-400" />
                        {item.autor_nome}
                      </span>
                    </div>
                    <time className="text-[11px] text-slate-400">
                      {new Date(item.created).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  {item.detalhes && (
                    <p className="text-slate-500 mt-1 text-[11px] font-mono leading-relaxed bg-slate-50 p-2 rounded border border-slate-200/60">
                      {item.detalhes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BLOCO ETAPA 4: Registro de Avisos Recebidos do Webhook (Exclusivo Admin) */}
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-pink-100 text-pink-700 flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Registro de Avisos do Webhook (Etapa 4)
                </h2>
                <p className="text-xs text-slate-500">
                  Histórico em tempo real de eventos recebidos da Meta, controle de deduplicação e
                  auditoria de recusas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={carregarDados}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-slate-100 self-start sm:self-auto"
              title="Atualizar avisos"
            >
              <RefreshCw size={13} />
              <span>Atualizar</span>
            </button>
          </div>

          {avisosWebhook.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Nenhum aviso recebido ainda pelo webhook. Quando a Meta enviar mensagens ou
              verificações para a URL de callback, os eventos aparecerão aqui automaticamente.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Situação</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Identificador do Evento</th>
                    <th className="py-2.5 px-3">Mensagem / Motivo</th>
                    <th className="py-2.5 px-3 text-right">Data e Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {avisosWebhook.map((aviso) => {
                    let badge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 size={11} /> Aceito
                      </span>
                    )
                    if (aviso.situacao === 'rejeitado') {
                      badge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          <AlertTriangle size={11} /> Rejeitado
                        </span>
                      )
                    } else if (aviso.situacao === 'eco') {
                      badge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                          <Sparkles size={11} /> Eco (Central)
                        </span>
                      )
                    }

                    return (
                      <tr key={aviso.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 whitespace-nowrap">{badge}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 capitalize">
                          {aviso.tipo_evento}
                        </td>
                        <td
                          className="py-2.5 px-3 font-mono text-[11px] text-slate-600 max-w-[200px] truncate"
                          title={aviso.identificador_evento}
                        >
                          {aviso.identificador_evento}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-[280px]">
                          {aviso.motivo_rejeicao ? (
                            <span className="text-rose-700 font-medium">
                              {aviso.motivo_rejeicao}
                            </span>
                          ) : aviso.texto_mensagem ? (
                            <span className="truncate block" title={aviso.texto_mensagem}>
                              "{aviso.texto_mensagem}"
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Sem conteúdo textual</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400 whitespace-nowrap text-[11px]">
                          {formatarData(aviso.data_recebimento || aviso.created)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
