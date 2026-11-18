routerAdd(
  'GET',
  '/backend/v1/meta/status',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Não autenticado.' })
    }

    const role = auth.getString('role')
    if (role !== 'admin' && role !== 'atendente') {
      return e.json(403, { error: 'Acesso não autorizado.' })
    }

    let conexao = null
    try {
      const list = $app.findRecordsByFilter('conexao_meta', "id != ''", '-created', 1, 0)
      if (list && list.length > 0) {
        conexao = list[0]
      }
    } catch (err) {
      return e.json(500, { error: 'Erro ao consultar conexão.' })
    }

    if (!conexao) {
      return e.json(404, { error: 'Configuração da conexão não encontrada.' })
    }

    const situacao = conexao.getString('situacao') || 'desconectada'
    const conta_usuario = conexao.getString('conta_usuario') || ''
    const conta_nome = conexao.getString('conta_nome') || ''
    const conta_id = conexao.getString('conta_id') || ''
    const data_conexao = conexao.getString('data_conexao') || ''
    const app_situacao = conexao.getString('app_situacao') || 'em teste'
    const data_mudanca_situacao =
      conexao.getString('data_mudanca_situacao') || conexao.getString('updated') || ''

    // Constantes e regras oficiais vigentes da Meta (developers.facebook.com - Instagram API with Instagram Login, 2026)
    const regras_meta = {
      janela_padrao_horas: 24,
      janela_padrao_descricao:
        'Janela padrão de resposta de 24 horas a partir da última mensagem do cliente (até 7 dias se a conversa iniciou por anúncio Click-to-Direct).',
      janela_human_agent_dias: 7,
      janela_human_agent_descricao:
        'Janela Human Agent (tag human_agent) de 7 dias para quando o atendente humano necessita de mais tempo para responder.',
      iniciativa_conversa: 'cliente',
      iniciativa_conversa_descricao:
        'Só é possível responder DEPOIS que o cliente enviou uma mensagem (a empresa não inicia conversas ativamente no Direct).',
      limites_envio: {
        send_api_texto_links_reacoes_rps: 100,
        send_api_audio_video_rps: 10,
        conversations_api_rps: 2,
        descricao:
          'Send API: até 100 chamadas/s por conta para texto, links, reações e stickers; até 10 chamadas/s para áudio e vídeo. Conversations API: 2 chamadas/s.',
      },
      tamanho_maximo_texto_bytes: 1000,
      tamanho_maximo_texto_descricao:
        'Texto da mensagem em codificação UTF-8, com limite estrito de 1.000 bytes.',
      permissoes_exigidas: ['instagram_business_basic', 'instagram_business_manage_messages'],
      permissoes_descricao:
        'Permissões obrigatórias aprovadas na Meta: instagram_business_basic e instagram_business_manage_messages.',
      fonte_oficial:
        'Documentação oficial vigente da Meta for Developers (Instagram API with Instagram Login - Send Messages & Rate Limits, 2026)',
    }

    // Atendente vê dados essenciais, situação do app e regras oficiais
    if (role !== 'admin') {
      return e.json(200, {
        id: conexao.id,
        situacao: situacao,
        app_situacao: app_situacao,
        data_mudanca_situacao: data_mudanca_situacao,
        conta_usuario: conta_usuario,
        conta_nome: conta_nome,
        conta_id: conta_id,
        data_conexao: data_conexao,
        regras_meta: regras_meta,
      })
    }

    // Admin recebe tudo, com segredos mascarados (nunca completos)
    const rawSecret = conexao.getString('app_secret') || ''
    let maskedSecret = ''
    if (rawSecret.length > 0) {
      if (rawSecret.length <= 4) {
        maskedSecret = '••••••••'
      } else {
        maskedSecret = '••••••••' + rawSecret.slice(-4)
      }
    }

    const rawVerify = conexao.getString('verify_token') || ''
    let maskedVerify = ''
    if (rawVerify.length > 0) {
      if (rawVerify.length <= 4) {
        maskedVerify = '••••••••'
      } else {
        maskedVerify = '••••••••' + rawVerify.slice(-4)
      }
    }

    return e.json(200, {
      id: conexao.id,
      situacao: situacao,
      app_situacao: app_situacao,
      data_mudanca_situacao: data_mudanca_situacao,
      conta_usuario: conta_usuario,
      conta_nome: conta_nome,
      conta_id: conta_id,
      data_conexao: data_conexao,
      app_nome: conexao.getString('app_nome') || '',
      app_id: conexao.getString('app_id') || '',
      app_secret_mascarado: maskedSecret,
      tem_app_secret: Boolean(rawSecret),
      verify_token_mascarado: maskedVerify,
      verify_token: rawVerify,
      url_login: conexao.getString('url_login') || '',
      regras_meta: regras_meta,
    })
  },
  $apis.requireAuth(),
)
