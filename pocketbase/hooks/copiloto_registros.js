routerAdd(
  'GET',
  '/backend/v1/copiloto/registros/{conversaId}',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    const conversaId = e.requestInfo().pathParams.conversaId
    if (!conversaId) {
      return e.json(400, { error: 'ID da conversa é obrigatório.' })
    }

    try {
      const records = $app.findRecordsByFilter(
        'copiloto_registros',
        "conversa_id = '" + conversaId + "'",
        '-data',
        30,
        0,
      )

      const itens = []
      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        let autorNome = 'Membro da equipe'
        const autorId = r.getString('solicitado_por')
        if (autorId) {
          try {
            const u = $app.findFirstRecordByData('users', 'id', autorId)
            if (u) autorNome = u.getString('name') || u.getString('email')
          } catch (_) {}
        }

        itens.push({
          id: r.id,
          conversa_id: r.getString('conversa_id'),
          tipo: r.getString('tipo'),
          conteudo: r.getString('conteudo'),
          solicitado_por: autorId,
          autor_nome: autorNome,
          data: r.getString('data'),
          created: r.getString('created'),
        })
      }

      return e.json(200, { registros: itens })
    } catch (err) {
      return e.json(500, { error: 'Erro ao listar registros do copiloto: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)
