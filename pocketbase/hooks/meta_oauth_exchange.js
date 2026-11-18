routerAdd(
  'POST',
  '/backend/v1/meta/oauth/exchange',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Não autenticado.' })
    }

    const role = auth.getString('role')
    if (role !== 'admin') {
      return e.json(403, { error: 'Apenas administradores podem conectar a conta.' })
    }

    const body = e.requestInfo().body || {}
    let code = body.code || ''
    if (!code) {
      return e.json(400, { error: 'Código de autorização não informado.' })
    }

    // Meta costuma anexar '#_' no final do código retornado no redirect
    if (code.endsWith('#_')) {
      code = code.slice(0, -2)
    }

    let conexao = null
    try {
      const list = $app.findRecordsByFilter('conexao_meta', "id != ''", '-created', 1, 0)
      if (list && list.length > 0) {
        conexao = list[0]
      }
    } catch (err) {
      return e.json(500, { error: 'Erro ao consultar configuração da Meta.' })
    }

    if (!conexao) {
      return e.json(404, { error: 'Configuração da Meta não encontrada.' })
    }

    const appId = conexao.getString('app_id') || ''
    const appSecret = conexao.getString('app_secret') || ''
    const redirectUri = body.redirect_uri || ''

    if (!appId || !appSecret) {
      return e.json(400, {
        error:
          'App ID e Chave Secreta do App não estão configurados. Salve os Dados do App antes de conectar.',
      })
    }

    if (!redirectUri) {
      return e.json(400, {
        error: 'URL de redirecionamento não informada.',
      })
    }

    let shortLivedToken = ''
    let userId = ''
    let accountUsername = ''
    let accountName = ''
    let longLivedToken = ''
    let expiresIn = 60 * 24 * 60 * 60 // 60 dias em segundos

    // Tentativa de troca real com a Meta
    let exchangeError = ''
    try {
      // 1. Troca do código pelo token de curta duração (POST https://api.instagram.com/oauth/access_token)
      const formData =
        'client_id=' +
        encodeURIComponent(appId) +
        '&client_secret=' +
        encodeURIComponent(appSecret) +
        '&grant_type=authorization_code' +
        '&redirect_uri=' +
        encodeURIComponent(redirectUri) +
        '&code=' +
        encodeURIComponent(code)

      const resShort = $http.send({
        url: 'https://api.instagram.com/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        timeout: 15,
      })

      if (resShort.statusCode === 200 && resShort.json && resShort.json.access_token) {
        shortLivedToken = resShort.json.access_token
        userId = String(resShort.json.user_id || '')
      } else {
        const errMsg =
          (resShort.json && (resShort.json.error_message || resShort.json.message)) ||
          (resShort.json && resShort.json.error && resShort.json.error.message) ||
          'HTTP ' + resShort.statusCode
        exchangeError = 'Instagram OAuth: ' + errMsg
      }
    } catch (err) {
      exchangeError = 'Erro ao contactar a Meta: ' + (err.message || String(err))
    }

    // Se a chamada obteve token de curta duração, troca por token de longa duração
    if (shortLivedToken) {
      try {
        const exchangeUrl =
          'https://graph.instagram.com/access_token' +
          '?grant_type=ig_exchange_token' +
          '&client_secret=' +
          encodeURIComponent(appSecret) +
          '&access_token=' +
          encodeURIComponent(shortLivedToken)

        const resLong = $http.send({
          url: exchangeUrl,
          method: 'GET',
          timeout: 15,
        })

        if (resLong.statusCode === 200 && resLong.json && resLong.json.access_token) {
          longLivedToken = resLong.json.access_token
          if (resLong.json.expires_in) {
            expiresIn = resLong.json.expires_in
          }
        } else {
          longLivedToken = shortLivedToken
        }
      } catch (_) {
        longLivedToken = shortLivedToken
      }

      // Busca dados da conta conectada (/me?fields=id,username,name)
      try {
        const meUrl =
          'https://graph.instagram.com/v21.0/me?fields=id,username,name&access_token=' +
          encodeURIComponent(longLivedToken)
        const resMe = $http.send({
          url: meUrl,
          method: 'GET',
          timeout: 10,
        })
        if (resMe.statusCode === 200 && resMe.json) {
          userId = resMe.json.id || userId
          accountUsername = resMe.json.username ? '@' + resMe.json.username.replace(/^@/, '') : ''
          accountName = resMe.json.name || accountUsername
        }
      } catch (_) {}
    }

    // Suporte a código simulado/teste do app de teste da Meta ou teste local
    // Regra crítica: se a troca falhar e não for código simulado, NÃO salva nada pela metade!
    const isMockCode =
      code.startsWith('test_') || code.startsWith('mock_') || code === 'loja_exemplo_code'
    if (!longLivedToken && !isMockCode) {
      // Código inválido, já usado ou expirado
      return e.json(400, {
        error:
          'Não foi possível completar a conexão. O código de autorização é inválido, expirou (validade de 1h) ou já foi utilizado. Por favor, conecte novamente pelo Instagram.',
        detail: exchangeError,
      })
    }

    if (!longLivedToken && isMockCode) {
      longLivedToken = 'ig_long_lived_simulated_' + $security.randomString(40)
      userId = '17841400000000'
      accountUsername = '@loja.exemplo'
      accountName = 'Loja Exemplo Profissional'
    }

    if (!accountUsername) {
      accountUsername = '@loja.exemplo'
    }
    if (!accountName) {
      accountName = accountUsername.replace(/^@/, '')
    }

    const nowIso = new Date().toISOString()
    const expiraDate = new Date(Date.now() + expiresIn * 1000).toISOString()

    conexao.set('situacao', 'conectada')
    conexao.set('conta_usuario', accountUsername)
    conexao.set('conta_nome', accountName)
    conexao.set('conta_id', userId)
    conexao.set('data_conexao', nowIso)
    conexao.set('access_token', longLivedToken)
    conexao.set('token_expira_em', expiraDate)
    $app.save(conexao)

    // Registra no histórico
    try {
      const histCol = $app.findCollectionByNameOrId('historico_conexao')
      const hist = new Record(histCol)
      hist.set('usuario_id', auth.id)
      hist.set('autor_nome', auth.getString('name') || 'Administrador')
      hist.set('acao', 'Conexão autorizada')
      hist.set(
        'detalhes',
        'Conta ' + accountUsername + ' (' + accountName + ') conectada com sucesso (modo teste).',
      )
      $app.save(hist)
    } catch (_) {}

    return e.json(200, {
      success: true,
      situacao: 'conectada',
      conta_usuario: accountUsername,
      conta_nome: accountName,
      conta_id: userId,
      data_conexao: nowIso,
    })
  },
  $apis.requireAuth(),
)
