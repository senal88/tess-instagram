routerAdd(
  'GET',
  '/backend/v1/copiloto/configuracoes',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    try {
      const configs = $app.findRecordsByFilter('configuracoes_ia', "id != ''", '-created', 1, 0)
      if (configs.length === 0) {
        return e.json(200, {
          tom_de_voz: 'simpático e direto, tratando de você',
          instrucoes_fixas: 'Nunca prometa prazo de entrega ou preço não confirmado.',
          updated: null,
          atualizado_por_nome: null,
        })
      }

      const c = configs[0]
      let autorNome = null
      const autorId = c.getString('atualizado_por')
      if (autorId) {
        try {
          const userRec = $app.findFirstRecordByData('users', 'id', autorId)
          if (userRec) autorNome = userRec.getString('name') || userRec.getString('email')
        } catch (_) {}
      }

      return e.json(200, {
        id: c.id,
        tom_de_voz: c.getString('tom_de_voz') || 'simpático e direto, tratando de você',
        instrucoes_fixas: c.getString('instrucoes_fixas') || '',
        updated: c.getString('updated'),
        atualizado_por_nome: autorNome,
      })
    } catch (err) {
      return e.json(500, { error: 'Erro ao buscar configurações de IA: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/copiloto/configuracoes',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    // Regra: apenas administradores alteram tom de voz e instruções fixas
    if (auth.getString('role') !== 'admin') {
      return e.json(403, {
        error:
          'Permissão negada. Apenas administradores podem configurar o tom de voz e instruções da marca.',
      })
    }

    const body = e.requestInfo().body || {}
    const tomDeVoz = (body.tom_de_voz || '').trim()
    const instrucoesFixas = (body.instrucoes_fixas || '').trim()

    if (!tomDeVoz) {
      return e.json(400, { error: 'O tom de voz da marca é obrigatório.' })
    }

    try {
      const configIaCol = $app.findCollectionByNameOrId('configuracoes_ia')
      const configs = $app.findRecordsByFilter('configuracoes_ia', "id != ''", '-created', 1, 0)

      let record
      if (configs.length > 0) {
        record = configs[0]
      } else {
        record = new Record(configIaCol)
      }

      record.set('tom_de_voz', tomDeVoz)
      record.set('instrucoes_fixas', instrucoesFixas)
      record.set('atualizado_por', auth.id)
      $app.save(record)

      return e.json(200, {
        sucesso: true,
        id: record.id,
        tom_de_voz: tomDeVoz,
        instrucoes_fixas: instrucoesFixas,
        updated: record.getString('updated'),
        atualizado_por_nome: auth.getString('name') || auth.getString('email'),
      })
    } catch (err) {
      return e.json(500, { error: 'Erro ao salvar configurações de IA: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)
