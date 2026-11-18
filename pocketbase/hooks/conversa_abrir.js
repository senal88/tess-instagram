routerAdd(
  'POST',
  '/backend/v1/conversas/{id}/abrir',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    const conversaId = e.requestInfo().pathParams.id
    if (!conversaId) {
      return e.json(400, { error: 'ID da conversa é obrigatório.' })
    }

    try {
      const conversa = $app.findCollectionByNameOrId('conversas')
      const rec = $app.findFirstRecordByData('conversas', 'id', conversaId)
      if (!rec) {
        return e.json(404, { error: 'Conversa não encontrada.' })
      }

      // Zerar não lidas
      const unread = rec.getInt('nao_lidas') || 0
      if (unread > 0) {
        rec.set('nao_lidas', 0)
        $app.save(rec)
      }

      return e.json(200, {
        id: rec.id,
        nao_lidas: 0,
        situacao: rec.getString('situacao'),
      })
    } catch (err) {
      return e.json(500, { error: 'Erro ao abrir conversa: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)
