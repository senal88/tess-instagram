routerAdd(
  'POST',
  '/backend/v1/meta/app-status',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Não autenticado.' })
    }

    const role = auth.getString('role')
    if (role !== 'admin') {
      return e.json(403, {
        error: 'Apenas administradores podem alterar a situação do aplicativo.',
      })
    }

    const body = e.requestInfo().body || {}
    const novaSituacao = body.app_situacao

    const situacoesValidas = ['em teste', 'em revisão', 'publicado']
    if (!novaSituacao || situacoesValidas.indexOf(novaSituacao) === -1) {
      return e.json(400, {
        error: 'Situação inválida. Valores aceitos: "em teste", "em revisão" ou "publicado".',
      })
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

    const situacaoAnterior = conexao.getString('app_situacao') || 'em teste'
    if (situacaoAnterior === novaSituacao) {
      return e.json(200, {
        success: true,
        message: 'A situação já era "' + novaSituacao + '". Nenhuma alteração feita.',
        app_situacao: novaSituacao,
        data_mudanca_situacao: conexao.getString('data_mudanca_situacao') || '',
      })
    }

    const agora = new Date()
    const agoraIso = agora.toISOString()

    conexao.set('app_situacao', novaSituacao)
    conexao.set('data_mudanca_situacao', agoraIso)
    $app.save(conexao)

    // Registra no histórico: o que mudou, quem mudou e quando
    try {
      const histCol = $app.findCollectionByNameOrId('historico_conexao')
      const hist = new Record(histCol)
      hist.set('usuario_id', auth.id)
      hist.set('autor_nome', auth.getString('name') || 'Administrador')
      hist.set('acao', 'Mudança de situação do app')
      hist.set(
        'detalhes',
        'Situação do aplicativo na Meta alterada de "' +
          situacaoAnterior +
          '" para "' +
          novaSituacao +
          '".',
      )
      $app.save(hist)
    } catch (_) {}

    return e.json(200, {
      success: true,
      app_situacao: novaSituacao,
      situacao_anterior: situacaoAnterior,
      data_mudanca_situacao: agoraIso,
      autor: auth.getString('name') || 'Administrador',
    })
  },
  $apis.requireAuth(),
)
