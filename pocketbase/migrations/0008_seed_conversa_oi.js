migrate(
  (app) => {
    try {
      const clientesCol = app.findCollectionByNameOrId('clientes')
      const conversasCol = app.findCollectionByNameOrId('conversas')
      const mensagensCol = app.findCollectionByNameOrId('mensagens')

      let clienteLucas = null
      try {
        clienteLucas = app.findFirstRecordByData('clientes', 'usuario', '@lucas.teste')
      } catch (_) {
        clienteLucas = new Record(clientesCol)
        clienteLucas.set('ig_id', 'ig_lucasteste')
        clienteLucas.set('nome', 'Lucas')
        clienteLucas.set('usuario', '@lucas.teste')
        clienteLucas.set('primeira_interacao', '2026-09-30T08:00:00.000Z')
        app.save(clienteLucas)
      }

      let conversaOi = null
      try {
        conversaOi = app.findFirstRecordByData('conversas', 'cliente_usuario', '@lucas.teste')
      } catch (_) {
        conversaOi = new Record(conversasCol)
        conversaOi.set('cliente_nome', 'Lucas')
        conversaOi.set('cliente_usuario', '@lucas.teste')
        conversaOi.set('cliente_ig_id', 'ig_lucasteste')
        conversaOi.set('cliente_id', clienteLucas.id)
        conversaOi.set('situacao', 'nova')
        conversaOi.set('ultima_mensagem_data', '2026-09-30T08:15:00.000Z')
        conversaOi.set('nao_lidas', 1)
        conversaOi.set('rascunho_situacao', 'nenhum')
        app.save(conversaOi)

        const mOi = new Record(mensagensCol)
        mOi.set('conversa_id', conversaOi.id)
        mOi.set('remetente', 'cliente')
        mOi.set('texto', 'oi')
        mOi.set('data_hora', '2026-09-30T08:15:00.000Z')
        mOi.set('situacao', 'recebida')
        app.save(mOi)
      }
    } catch (e) {
      console.log('Erro ao semear Lucas:', e)
    }
  },
  (app) => {
    try {
      const conv = app.findFirstRecordByData('conversas', 'cliente_usuario', '@lucas.teste')
      if (conv) app.delete(conv)
      const cli = app.findFirstRecordByData('clientes', 'usuario', '@lucas.teste')
      if (cli) app.delete(cli)
    } catch (_) {}
  },
)
