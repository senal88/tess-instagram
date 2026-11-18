migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    let patric
    try {
      patric = app.findAuthRecordByEmail('_pb_users_auth_', 'patric.martins@adapta.org')
      patric.set('name', 'Patric Martins')
      patric.set('role', 'admin')
      patric.setVerified(true)
      app.save(patric)
    } catch (_) {
      patric = new Record(users)
      patric.setEmail('patric.martins@adapta.org')
      patric.setPassword('Skip@Pass')
      patric.setVerified(true)
      patric.set('name', 'Patric Martins')
      patric.set('role', 'admin')
      app.save(patric)
    }

    let camila
    try {
      camila = app.findAuthRecordByEmail('_pb_users_auth_', 'camila@atendimento.com')
      camila.set('name', 'Camila')
      camila.set('role', 'atendente')
      camila.setVerified(true)
      app.save(camila)
    } catch (_) {
      camila = new Record(users)
      camila.setEmail('camila@atendimento.com')
      camila.setPassword('Skip@Pass')
      camila.setVerified(true)
      camila.set('name', 'Camila')
      camila.set('role', 'atendente')
      app.save(camila)
    }

    const conversas = app.findCollectionByNameOrId('conversas')
    const mensagens = app.findCollectionByNameOrId('mensagens')
    const mudancas = app.findCollectionByNameOrId('mudancas_situacao')
    const now = new Date()

    const atTime = (daysAgo, hour, minute) => {
      const date = new Date(now.getTime())
      date.setDate(date.getDate() - daysAgo)
      date.setHours(hour, minute, 0, 0)
      return date.toISOString()
    }

    const seedConversation = (customer, username, status, unread, messageData, changes) => {
      let conversation
      try {
        conversation = app.findFirstRecordByData('conversas', 'cliente_usuario', username)
      } catch (_) {
        conversation = new Record(conversas)
        conversation.set('cliente_nome', customer)
        conversation.set('cliente_usuario', username)
        conversation.set('situacao', status)
        conversation.set('atendente_responsavel', camila.id)
        conversation.set('ultima_mensagem_data', messageData[messageData.length - 1][3])
        conversation.set('nao_lidas', unread)
        app.save(conversation)
      }

      const existingMessages = app.findRecordsByFilter(
        'mensagens',
        "conversa_id = '" + conversation.id + "'",
        'data_hora',
        1,
        0,
      )
      if (existingMessages.length === 0) {
        for (let i = 0; i < messageData.length; i++) {
          const item = messageData[i]
          const message = new Record(mensagens)
          message.set('conversa_id', conversation.id)
          message.set('remetente', item[0])
          message.set('texto', item[1])
          message.set('situacao', item[2])
          message.set('data_hora', item[3])
          if (item[0] === 'central') message.set('atendente_id', camila.id)
          app.save(message)
        }
      }

      const existingChanges = app.findRecordsByFilter(
        'mudancas_situacao',
        "conversa_id = '" + conversation.id + "'",
        'created',
        1,
        0,
      )
      if (existingChanges.length === 0) {
        for (let i = 0; i < changes.length; i++) {
          const item = changes[i]
          const change = new Record(mudancas)
          change.set('conversa_id', conversation.id)
          change.set('situacao_anterior', item[0])
          change.set('situacao_nova', item[1])
          change.set('usuario_id', camila.id)
          app.save(change)
        }
      }
    }

    seedConversation(
      'Júlia',
      '@julia.silva',
      'nova',
      2,
      [
        [
          'cliente',
          'Olá! Vi que vocês divulgaram o lançamento no Instagram e quero saber mais detalhes sobre o produto. Podem me ajudar?',
          'recebida',
          atTime(2, 10, 23),
        ],
        [
          'central',
          'Oi, Júlia! Tudo bem? 😊 Claro, podemos sim! Qual produto você tem interesse?',
          'enviada',
          atTime(2, 11, 5),
        ],
        [
          'cliente',
          'O creme hidratante novo, o de rosas. Quanto custa e tem algum desconto para primeira compra?',
          'recebida',
          atTime(1, 15, 40),
        ],
        ['cliente', 'Vocês estão aí?', 'recebida', atTime(0, 9, 2)],
      ],
      [],
    )

    seedConversation(
      'Marcos',
      '@marcos.pereira',
      'em_atendimento',
      0,
      [
        [
          'cliente',
          'Boa tarde! Fiz um pedido na semana passada e ainda não chegou. Consegue verificar o rastreio para mim?',
          'recebida',
          atTime(1, 14, 12),
        ],
        [
          'central',
          'Boa tarde, Marcos! Vou verificar agora o status do seu pedido e te retorno em instantes.',
          'enviada',
          atTime(1, 14, 20),
        ],
        [
          'central',
          'Seu pedido foi despachado e a previsão de entrega é para amanhã. Segue o código de rastreio: BR123456789.',
          'enviada',
          atTime(1, 14, 35),
        ],
        [
          'cliente',
          'Obrigado! Consegui acompanhar e chegou hoje. Muito obrigado pela atenção!',
          'recebida',
          atTime(0, 11, 47),
        ],
      ],
      [['nova', 'em_atendimento']],
    )

    seedConversation(
      'Bianca',
      '@bianca.lima',
      'resolvida',
      0,
      [
        [
          'cliente',
          'Oi, queria fazer uma troca de um vestido que comprei. Qual o prazo?',
          'recebida',
          atTime(5, 16, 0),
        ],
        [
          'central',
          'Oi, Bianca! O prazo para solicitar a troca é de 30 dias após o recebimento. Vou te enviar os passos.',
          'enviada',
          atTime(5, 16, 10),
        ],
        [
          'cliente',
          'Perfeito, consegui solicitar pelo site. Muito obrigada!',
          'recebida',
          atTime(4, 10, 30),
        ],
        [
          'central',
          'Ficamos felizes em ajudar! Qualquer dúvida é só chamar. 💜',
          'enviada',
          atTime(4, 10, 38),
        ],
      ],
      [
        ['nova', 'em_atendimento'],
        ['em_atendimento', 'resolvida'],
      ],
    )
  },
  (app) => {
    const emails = ['patric.martins@adapta.org', 'camila@atendimento.com']
    for (let i = 0; i < emails.length; i++) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', emails[i]))
      } catch (_) {}
    }
  },
)
