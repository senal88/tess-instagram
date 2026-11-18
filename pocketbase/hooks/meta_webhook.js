routerAdd('GET', '/backend/v1/meta/webhook', (e) => {
  const query = e.requestInfo().query || {}
  const mode = query['hub.mode'] || ''
  const token = query['hub.verify_token'] || ''
  const challenge = query['hub.challenge'] || ''

  let conexaoRecord = null
  try {
    const list = $app.findRecordsByFilter('conexao_meta', "id != ''", '-created', 1, 0)
    if (list && list.length > 0) {
      conexaoRecord = list[0]
    }
  } catch (err) {
    return e.json(500, { error: 'Erro ao consultar configuração da Meta.' })
  }

  if (!conexaoRecord) {
    return e.json(404, { error: 'Configuração da Meta não encontrada.' })
  }

  const expectedToken = conexaoRecord.getString('verify_token') || ''

  // Validação estrita: mode deve ser subscribe e token deve coincidir exatamente com o verify_token salvo
  if (!mode || !token || mode !== 'subscribe' || !expectedToken || token !== expectedToken) {
    // Registrar tentativa de verificação rejeitada na tabela de avisos_webhook para auditoria
    try {
      const avisosCol = $app.findCollectionByNameOrId('avisos_webhook')
      const rec = new Record(avisosCol)
      const eventId = 'vfy_reject_' + $security.randomString(24)
      rec.set('identificador_evento', eventId)
      rec.set('tipo_evento', 'outro')
      rec.set('situacao', 'rejeitado')
      rec.set(
        'motivo_rejeicao',
        !token
          ? 'Token de verificação ausente na chamada.'
          : mode !== 'subscribe'
            ? 'Modo inválido: esperado subscribe, recebido ' + mode
            : 'Token de verificação incorreto.',
      )
      rec.set('data_recebimento', new Date().toISOString())
      rec.set('payload', {
        mode: mode,
        query: query,
        timestamp: new Date().toISOString(),
      })
      $app.save(rec)
    } catch (_) {}

    return e.json(403, { error: 'Token de verificação inválido ou modo incompatível.' })
  }

  // Se o token confere e o mode é subscribe, retorna o challenge em texto puro conforme protocolo da Meta
  return e.string(200, challenge)
})

routerAdd('POST', '/backend/v1/meta/webhook', (e) => {
  const reqInfo = e.requestInfo()
  const headers = reqInfo.headers || {}
  const body = reqInfo.body || {}
  const nowIso = new Date().toISOString()

  // 1. Obter conexão ativa da Meta
  let conexaoRecord = null
  try {
    const list = $app.findRecordsByFilter('conexao_meta', "id != ''", '-created', 1, 0)
    if (list && list.length > 0) {
      conexaoRecord = list[0]
    }
  } catch (_) {}

  const appSecret = conexaoRecord ? conexaoRecord.getString('app_secret') : ''
  const accessToken = conexaoRecord ? conexaoRecord.getString('access_token') : ''

  // 2. Validação da assinatura X-Hub-Signature-256 (se app_secret configurado e assinatura enviada)
  const xHubSignature =
    headers['x-hub-signature-256'] ||
    headers['X-Hub-Signature-256'] ||
    headers['x_hub_signature_256'] ||
    ''

  let avisosCol = null
  try {
    avisosCol = $app.findCollectionByNameOrId('avisos_webhook')
  } catch (_) {
    return e.json(500, { error: 'Coleção avisos_webhook não encontrada.' })
  }

  // Se temos app_secret configurado e o cabeçalho X-Hub-Signature-256 foi enviado, validar HMAC-SHA256
  // Nota: reqInfo.body é o objeto parsed; $security.hs256 assina strings com a chave
  // Se a assinatura for explicitamente inválida:
  if (appSecret && xHubSignature) {
    try {
      const rawBodyStr = JSON.stringify(body)
      const expectedHash = $security.hs256(rawBodyStr, appSecret)
      const expectedHeader = 'sha256=' + expectedHash
      // Se a assinatura não confere:
      if (xHubSignature !== expectedHeader && xHubSignature !== expectedHash) {
        // Registra aviso rejeitado
        const rec = new Record(avisosCol)
        rec.set('identificador_evento', 'sig_reject_' + $security.randomString(28))
        rec.set('tipo_evento', 'outro')
        rec.set('situacao', 'rejeitado')
        rec.set('motivo_rejeicao', 'Assinatura X-Hub-Signature-256 inválida.')
        rec.set('data_recebimento', nowIso)
        rec.set('payload', {
          headers: { 'x-hub-signature-256': xHubSignature ? '[PRESENTE]' : '' },
          body: body,
        })
        try {
          $app.save(rec)
        } catch (_) {}

        return e.json(403, { error: 'Assinatura do webhook inválida.' })
      }
    } catch (_) {
      // Falha ao computar hmac não deve derrubar requisições legítimas se JSON variar
    }
  }

  // 3. Identificar se o payload é um evento da Meta
  // Estrutura padrão Meta: { object: 'instagram' | 'page', entry: [ { id: '...', messaging: [ ... ] } ] }
  const entries = body.entry || []
  if (!Array.isArray(entries) || entries.length === 0) {
    // Pode ser um teste ou aviso de verificação POST
    const eventId = String(body.id || body.mid || 'evt_' + $security.randomString(24))
    try {
      const rec = new Record(avisosCol)
      rec.set('identificador_evento', eventId)
      rec.set('tipo_evento', 'outro')
      rec.set('situacao', 'aceito')
      rec.set('data_recebimento', nowIso)
      rec.set('payload', body)
      $app.save(rec)
    } catch (_) {}

    return e.json(200, { status: 'EVENT_RECEIVED' })
  }

  // Buscar atendente padrão para novas conversas
  let atendentePadraoId = ''
  try {
    const atendentes = $app.findRecordsByFilter(
      'users',
      "role = 'atendente' || role = 'admin'",
      '-created',
      5,
      0,
    )
    if (atendentes.length > 0) {
      // Prioriza atendente, senão admin
      const at = atendentes.find((u) => u.getString('role') === 'atendente') || atendentes[0]
      atendentePadraoId = at.id
    }
  } catch (_) {}

  // 4. Iterar sobre as entries e mensagens
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] || {}
    const messagingList = entry.messaging || []

    for (let j = 0; j < messagingList.length; j++) {
      const event = messagingList[j] || {}
      const senderId = event.sender && event.sender.id ? String(event.sender.id) : ''
      const recipientId = event.recipient && event.recipient.id ? String(event.recipient.id) : ''
      const message = event.message || null
      const delivery = event.delivery || null
      const read = event.read || null

      // Obter ou fabricar identificador único do evento (pode ser mid da mensagem ou composto com timestamp)
      let eventId = ''
      if (message && message.mid) {
        eventId = String(message.mid)
      } else if (delivery && delivery.mids && delivery.mids.length > 0) {
        eventId = 'deliv_' + String(delivery.mids[0])
      } else if (read && read.watermark) {
        eventId = 'read_' + senderId + '_' + String(read.watermark)
      } else if (event.timestamp) {
        eventId = 'evt_' + senderId + '_' + String(event.timestamp) + '_' + j
      } else {
        eventId = 'evt_' + $security.randomString(32)
      }

      // REGRA OBRIGATÓRIA: Identificar eco / confirmação de envio da CENTRAL
      // Na Meta, mensagens enviadas pela própria página/central voltam com:
      // message.is_echo === true, ou senderId igual ao id da conta profissional conectada
      const isEcho =
        Boolean(message && message.is_echo) ||
        Boolean(conexaoRecord && senderId && senderId === conexaoRecord.getString('conta_id'))

      // Se for eco: registrar como 'eco' sem criar mensagem no histórico (a central já registrou no envio)
      if (isEcho) {
        try {
          const recEcho = new Record(avisosCol)
          recEcho.set('identificador_evento', eventId)
          recEcho.set('tipo_evento', 'eco')
          recEcho.set('situacao', 'eco')
          recEcho.set('remetente_id', senderId)
          recEcho.set('destinatario_id', recipientId)
          recEcho.set('texto_mensagem', message ? String(message.text || '') : '')
          recEcho.set('data_recebimento', nowIso)
          recEcho.set('payload', event)
          $app.save(recEcho)
        } catch (_) {
          // Se já existia, ignorar silenciosamente (idempotente)
        }
        continue
      }

      // Se for evento de status (delivery / read) sem nova mensagem de cliente:
      if (!message && (delivery || read)) {
        try {
          const recStatus = new Record(avisosCol)
          recStatus.set('identificador_evento', eventId)
          recStatus.set('tipo_evento', 'status')
          recStatus.set('situacao', 'aceito')
          recStatus.set('remetente_id', senderId)
          recStatus.set('destinatario_id', recipientId)
          recStatus.set('data_recebimento', nowIso)
          recStatus.set('payload', event)
          $app.save(recStatus)
        } catch (_) {}
        continue
      }

      // Se não tem texto ou mensagem válida:
      if (!message) {
        try {
          const recOutro = new Record(avisosCol)
          recOutro.set('identificador_evento', eventId)
          recOutro.set('tipo_evento', 'outro')
          recOutro.set('situacao', 'aceito')
          recOutro.set('data_recebimento', nowIso)
          recOutro.set('payload', event)
          $app.save(recOutro)
        } catch (_) {}
        continue
      }

      // REGRA OBRIGATÓRIA: Checagem atômica no banco contra duplicados (DEDUPLICAÇÃO)
      // O identificador único é inserido na tabela avisos_webhook com índice UNIQUE.
      // Se já existir, a inserção lança erro → ignoramos e respondemos 200 OK sem criar mensagem!
      let avisoRecord = null
      try {
        avisoRecord = new Record(avisosCol)
        avisoRecord.set('identificador_evento', eventId)
        avisoRecord.set('tipo_evento', 'mensagem')
        avisoRecord.set('situacao', 'aceito')
        avisoRecord.set('remetente_id', senderId)
        avisoRecord.set('destinatario_id', recipientId)
        avisoRecord.set('texto_mensagem', String(message.text || ''))
        avisoRecord.set('data_recebimento', nowIso)
        avisoRecord.set('payload', event)
        $app.save(avisoRecord)
      } catch (err) {
        // Já existe o identificador do evento! A Meta reenviou.
        // Responder 200 OK e NÃO duplicar nada.
        continue
      }

      // REGRA OBRIGATÓRIA: Mensagem recebida legítima de cliente.
      // Texto da mensagem
      const textoMensagem = String(message.text || '')
      if (!textoMensagem && !message.attachments) {
        // Mensagem vazia sem anexo
        continue
      }
      const conteudoFinal =
        textoMensagem ||
        (message.attachments && message.attachments.length > 0
          ? '[Mídia/Anexo enviado pelo Instagram]'
          : 'Mensagem do Instagram')

      // REGRA OBRIGATÓRIA: O aviso traz apenas o IDENTIFICADOR do cliente.
      // Buscar nome e @usuário pela API oficial de perfil da Meta usando a conexão ativa:
      // GET https://graph.instagram.com/{ig_id}?fields=username,name&access_token={token}
      // Se não for possível, o cliente fica com nome provisório até a próxima mensagem (ex.: "Cliente <id curto>")
      let clienteNome = ''
      let clienteUsuario = ''

      if (senderId && accessToken) {
        try {
          const profileUrl =
            'https://graph.instagram.com/v21.0/' +
            encodeURIComponent(senderId) +
            '?fields=username,name&access_token=' +
            encodeURIComponent(accessToken)

          const resProfile = $http.send({
            url: profileUrl,
            method: 'GET',
            timeout: 8,
          })

          if (resProfile.statusCode === 200 && resProfile.json) {
            if (resProfile.json.name) {
              clienteNome = String(resProfile.json.name).trim()
            }
            if (resProfile.json.username) {
              const u = String(resProfile.json.username).trim().replace(/^@/, '')
              clienteUsuario = '@' + u
            }
          }
        } catch (_) {
          // Tolerante a falha de rede/API: usará nome provisório
        }
      }

      // Se a busca de perfil não retornou ou não foi possível:
      const idCurto = senderId ? (senderId.length > 6 ? senderId.slice(-6) : senderId) : 'novo'
      if (!clienteNome) {
        clienteNome = 'Cliente ' + idCurto
      }
      if (!clienteUsuario) {
        clienteUsuario = '@ig_' + idCurto
      }

      // 5. Localizar ou criar a identidade do CLIENTE na coleção 'clientes'
      let clienteRecord = null
      let clientesCol = null
      try {
        clientesCol = $app.findCollectionByNameOrId('clientes')
      } catch (_) {}

      if (clientesCol && senderId) {
        try {
          const clientesAchados = $app.findRecordsByFilter(
            'clientes',
            "ig_id = '" + senderId.replace(/'/g, "''") + "'",
            '-created',
            1,
            0,
          )
          if (clientesAchados.length > 0) {
            clienteRecord = clientesAchados[0]
          }
        } catch (_) {}

        if (!clienteRecord && clienteUsuario) {
          try {
            const clientesAchados = $app.findRecordsByFilter(
              'clientes',
              "usuario = '" + clienteUsuario.replace(/'/g, "''") + "'",
              '-created',
              1,
              0,
            )
            if (clientesAchados.length > 0) {
              clienteRecord = clientesAchados[0]
            }
          } catch (_) {}
        }

        if (!clienteRecord) {
          // Criar novo cliente com primeira_interacao
          try {
            clienteRecord = new Record(clientesCol)
            clienteRecord.set('ig_id', senderId)
            clienteRecord.set('nome', clienteNome)
            clienteRecord.set('usuario', clienteUsuario)
            clienteRecord.set('primeira_interacao', nowIso)
            $app.save(clienteRecord)
          } catch (_) {}
        } else {
          // Atualizar perfil se os dados melhoraram
          let alterouCliente = false
          const nomeAtual = clienteRecord.getString('nome') || ''
          const usuarioAtual = clienteRecord.getString('usuario') || ''
          if (
            (nomeAtual.startsWith('Cliente ') || !nomeAtual) &&
            clienteNome &&
            !clienteNome.startsWith('Cliente ')
          ) {
            clienteRecord.set('nome', clienteNome)
            alterouCliente = true
          }
          if (
            (usuarioAtual.startsWith('@ig_') || !usuarioAtual) &&
            clienteUsuario &&
            !clienteUsuario.startsWith('@ig_')
          ) {
            clienteRecord.set('usuario', clienteUsuario)
            alterouCliente = true
          }
          if (alterouCliente) {
            try {
              $app.save(clienteRecord)
            } catch (_) {}
          }
        }
      }

      // 6. Localizar conversa aberta ou criar a conversa do cliente
      // Critério de busca: por cliente_ig_id = senderId OU por cliente_usuario se coincidir
      let conversaRecord = null
      try {
        if (senderId) {
          const achadas = $app.findRecordsByFilter(
            'conversas',
            "cliente_ig_id = '" + senderId.replace(/'/g, "''") + "'",
            '-created',
            1,
            0,
          )
          if (achadas.length > 0) {
            conversaRecord = achadas[0]
          }
        }
      } catch (_) {}

      // Se não encontrou por cliente_ig_id, tenta por @usuario (ex.: cliente semeado ou pré-existente)
      if (!conversaRecord && clienteUsuario) {
        try {
          const achadas = $app.findRecordsByFilter(
            'conversas',
            "cliente_usuario = '" + clienteUsuario.replace(/'/g, "''") + "'",
            '-created',
            1,
            0,
          )
          if (achadas.length > 0) {
            conversaRecord = achadas[0]
          }
        } catch (_) {}
      }

      const conversasCol = $app.findCollectionByNameOrId('conversas')
      const mensagensCol = $app.findCollectionByNameOrId('mensagens')

      if (!conversaRecord) {
        conversaRecord = new Record(conversasCol)
        conversaRecord.set('cliente_nome', clienteNome)
        conversaRecord.set('cliente_usuario', clienteUsuario)
        conversaRecord.set('cliente_ig_id', senderId)
        if (clienteRecord) {
          conversaRecord.set('cliente_id', clienteRecord.id)
        }
        conversaRecord.set('situacao', 'nova')
        conversaRecord.set('atendente_responsavel', atendentePadraoId)
        conversaRecord.set('ultima_mensagem_data', nowIso)
        conversaRecord.set('nao_lidas', 1)
        $app.save(conversaRecord)
      } else {
        // Conversa já existe:
        // Atualizar perfil se antes estava provisório e agora temos dados reais
        const nomeAtual = conversaRecord.getString('cliente_nome') || ''
        const usuarioAtual = conversaRecord.getString('cliente_usuario') || ''
        if (
          (nomeAtual.startsWith('Cliente ') || !nomeAtual) &&
          clienteNome &&
          !clienteNome.startsWith('Cliente ')
        ) {
          conversaRecord.set('cliente_nome', clienteNome)
        }
        if (
          (usuarioAtual.startsWith('@ig_') || !usuarioAtual) &&
          clienteUsuario &&
          !clienteUsuario.startsWith('@ig_')
        ) {
          conversaRecord.set('cliente_usuario', clienteUsuario)
        }
        if (!conversaRecord.getString('cliente_ig_id') && senderId) {
          conversaRecord.set('cliente_ig_id', senderId)
        }
        if (clienteRecord && !conversaRecord.getString('cliente_id')) {
          conversaRecord.set('cliente_id', clienteRecord.id)
        }

        // Se a conversa já estava resolvida, reabrir como nova
        if (conversaRecord.getString('situacao') === 'resolvida') {
          conversaRecord.set('situacao', 'nova')
        }

        // Incrementar não lidas e atualizar data da última mensagem para ir ao topo da inbox
        const unreadAtual = conversaRecord.getInt('nao_lidas') || 0
        conversaRecord.set('nao_lidas', unreadAtual + 1)
        conversaRecord.set('ultima_mensagem_data', nowIso)
        $app.save(conversaRecord)
      }

      // 6. Inserir mensagem no histórico como "recebida", com data e hora
      const novaMensagem = new Record(mensagensCol)
      novaMensagem.set('conversa_id', conversaRecord.id)
      novaMensagem.set('remetente', 'cliente')
      novaMensagem.set('texto', conteudoFinal)
      novaMensagem.set('data_hora', nowIso)
      novaMensagem.set('situacao', 'recebida')
      novaMensagem.set('identificador_externo', eventId)
      $app.save(novaMensagem)

      // Atualizar o aviso com a conversa_id vinculada
      if (avisoRecord) {
        try {
          avisoRecord.set('conversa_id', conversaRecord.id)
          $app.save(avisoRecord)
        } catch (_) {}
      }
    }
  }

  // Responder 200 OK à Meta rapidamente
  return e.json(200, { status: 'EVENT_RECEIVED' })
})
