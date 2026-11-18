routerAdd(
  'POST',
  '/backend/v1/meta/save-settings',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Não autenticado.' })
    }

    const role = auth.getString('role')
    if (role !== 'admin') {
      return e.json(403, { error: 'Apenas administradores podem alterar configurações.' })
    }

    const body = e.requestInfo().body || {}

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
      return e.json(404, { error: 'Configuração não encontrada.' })
    }

    const alteracoes = []

    if (body.app_nome !== undefined) {
      const oldVal = conexao.getString('app_nome')
      if (oldVal !== body.app_nome) {
        conexao.set('app_nome', body.app_nome)
        alteracoes.push('Nome do app atualizado para "' + body.app_nome + '"')
      }
    }

    if (body.app_id !== undefined) {
      const oldVal = conexao.getString('app_id')
      if (oldVal !== body.app_id) {
        conexao.set('app_id', body.app_id)
        alteracoes.push('App ID atualizado')
      }
    }

    if (body.app_secret !== undefined && body.app_secret.trim() !== '') {
      if (!body.app_secret.startsWith('••••')) {
        conexao.set('app_secret', body.app_secret.trim())
        alteracoes.push('Chave secreta do app atualizada')
      }
    }

    if (body.url_login !== undefined) {
      const oldVal = conexao.getString('url_login')
      if (oldVal !== body.url_login) {
        conexao.set('url_login', body.url_login)
        alteracoes.push('URL de login do Instagram atualizada')
      }
    }

    if (body.regenerate_verify_token === true) {
      const newToken = 'ig_vfy_' + $security.randomString(32)
      conexao.set('verify_token', newToken)
      alteracoes.push('Verify Token regenerado')
    }

    $app.save(conexao)

    // Registra no histórico se houve alterações
    if (alteracoes.length > 0) {
      try {
        const histCol = $app.findCollectionByNameOrId('historico_conexao')
        const hist = new Record(histCol)
        hist.set('usuario_id', auth.id)
        hist.set('autor_nome', auth.getString('name') || 'Administrador')
        hist.set('acao', 'Configurações atualizadas')
        hist.set('detalhes', alteracoes.join('; '))
        $app.save(hist)
      } catch (_) {}
    }

    const rawSecret = conexao.getString('app_secret') || ''
    let maskedSecret = ''
    if (rawSecret.length > 0) {
      maskedSecret = rawSecret.length <= 4 ? '••••••••' : '••••••••' + rawSecret.slice(-4)
    }

    const rawVerify = conexao.getString('verify_token') || ''
    let maskedVerify = ''
    if (rawVerify.length > 0) {
      maskedVerify = rawVerify.length <= 4 ? '••••••••' : '••••••••' + rawVerify.slice(-4)
    }

    return e.json(200, {
      success: true,
      id: conexao.id,
      situacao: conexao.getString('situacao'),
      conta_usuario: conexao.getString('conta_usuario'),
      conta_nome: conexao.getString('conta_nome'),
      conta_id: conexao.getString('conta_id'),
      data_conexao: conexao.getString('data_conexao'),
      app_nome: conexao.getString('app_nome'),
      app_id: conexao.getString('app_id'),
      app_secret_mascarado: maskedSecret,
      tem_app_secret: Boolean(rawSecret),
      verify_token_mascarado: maskedVerify,
      verify_token: rawVerify,
      url_login: conexao.getString('url_login'),
    })
  },
  $apis.requireAuth(),
)
