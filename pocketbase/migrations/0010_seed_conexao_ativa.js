migrate(
  (app) => {
    try {
      const list = app.findRecordsByFilter('conexao_meta', "id != ''", '-created', 1, 0)
      if (list && list.length > 0) {
        const conexao = list[0]
        if (conexao.getString('situacao') !== 'conectada') {
          conexao.set('situacao', 'conectada')
          conexao.set('conta_usuario', '@loja.exemplo')
          conexao.set('conta_nome', 'Loja Exemplo Profissional')
          conexao.set('conta_id', '17841400000000')
          conexao.set('data_conexao', new Date().toISOString())
          conexao.set('access_token', 'ig_long_lived_simulated_' + $security.randomString(40))
          conexao.set(
            'token_expira_em',
            new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          )
          app.save(conexao)
        }
      }
    } catch (_) {}
  },
  (app) => {
    // Reversão
  },
)
