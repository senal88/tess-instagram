routerAdd(
  'POST',
  '/backend/v1/meta/disconnect',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Não autenticado.' })
    }

    const role = auth.getString('role')
    if (role !== 'admin') {
      return e.json(403, { error: 'Apenas administradores podem desconectar a conta.' })
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

    const contaAnterior = conexao.getString('conta_usuario') || 'conta'

    conexao.set('situacao', 'desconectada')
    conexao.set('conta_usuario', '')
    conexao.set('conta_nome', '')
    conexao.set('conta_id', '')
    conexao.set('data_conexao', '')
    conexao.set('access_token', '')
    conexao.set('token_expira_em', '')
    $app.save(conexao)

    // Registra no histórico
    try {
      const histCol = $app.findCollectionByNameOrId('historico_conexao')
      const hist = new Record(histCol)
      hist.set('usuario_id', auth.id)
      hist.set('autor_nome', auth.getString('name') || 'Administrador')
      hist.set('acao', 'Conta desconectada')
      hist.set(
        'detalhes',
        'Desconexão manual da conta ' + contaAnterior + '. Conversas existentes foram preservadas.',
      )
      $app.save(hist)
    } catch (_) {}

    return e.json(200, {
      success: true,
      situacao: 'desconectada',
    })
  },
  $apis.requireAuth(),
)
