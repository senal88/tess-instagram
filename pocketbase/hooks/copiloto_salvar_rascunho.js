routerAdd(
  'POST',
  '/backend/v1/copiloto/salvar-rascunho',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    const body = e.requestInfo().body || {}
    const conversaId = body.conversa_id
    const rascunhoTexto = body.rascunho_texto !== undefined ? String(body.rascunho_texto) : ''
    const rascunhoSituacao = body.rascunho_situacao || 'editado'

    if (!conversaId) {
      return e.json(400, { error: 'O identificador da conversa (conversa_id) é obrigatório.' })
    }

    // Permitidos: 'nenhum', 'sugestao', 'editado', 'pronto_para_envio'
    const permitidos = ['nenhum', 'sugestao', 'editado', 'pronto_para_envio']
    if (!permitidos.includes(rascunhoSituacao)) {
      return e.json(400, { error: 'Situação de rascunho inválida.' })
    }

    try {
      const conversaRec = $app.findFirstRecordByData('conversas', 'id', conversaId)
      if (!conversaRec) {
        return e.json(404, { error: 'Conversa não encontrada.' })
      }

      conversaRec.set('rascunho_texto', rascunhoTexto)
      conversaRec.set('rascunho_situacao', rascunhoSituacao)
      $app.save(conversaRec)

      return e.json(200, {
        sucesso: true,
        conversa_id: conversaId,
        rascunho_texto: rascunhoTexto,
        rascunho_situacao: rascunhoSituacao,
      })
    } catch (err) {
      return e.json(500, {
        error: 'Erro ao salvar rascunho da conversa: ' + String(err),
      })
    }
  },
  $apis.requireAuth(),
)
