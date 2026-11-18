migrate(
  (app) => {
    const teamRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'atendente')"

    // 1. Criar coleção 'clientes'
    let clientesCol
    try {
      clientesCol = app.findCollectionByNameOrId('clientes')
    } catch (_) {
      clientesCol = new Collection({
        name: 'clientes',
        type: 'base',
        listRule: teamRule,
        viewRule: teamRule,
        createRule: teamRule,
        updateRule: teamRule,
        deleteRule: teamRule,
        fields: [
          { name: 'ig_id', type: 'text', required: true, max: 200 },
          { name: 'nome', type: 'text', required: true, max: 200 },
          { name: 'usuario', type: 'text', required: true, max: 200 },
          { name: 'primeira_interacao', type: 'date', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_clientes_ig_id ON clientes (ig_id)',
          'CREATE INDEX idx_clientes_usuario ON clientes (usuario)',
          'CREATE INDEX idx_clientes_primeira_interacao ON clientes (primeira_interacao)',
        ],
      })
      app.save(clientesCol)
    }

    // 2. Criar coleção 'notas_internas'
    // Regra estrita: "Notas internas NUNCA são enviadas ao cliente e nunca aparecem fora da equipe"
    // Somente admin ou atendente autenticados têm acesso (teamRule)
    let notasCol
    try {
      notasCol = app.findCollectionByNameOrId('notas_internas')
    } catch (_) {
      notasCol = new Collection({
        name: 'notas_internas',
        type: 'base',
        listRule: teamRule,
        viewRule: teamRule,
        createRule: teamRule,
        updateRule: teamRule,
        deleteRule: teamRule,
        fields: [
          {
            name: 'cliente_id',
            type: 'relation',
            required: true,
            collectionId: clientesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'texto', type: 'text', required: true, max: 10000 },
          {
            name: 'autor_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'data', type: 'date', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_notas_cliente ON notas_internas (cliente_id)',
          'CREATE INDEX idx_notas_autor ON notas_internas (autor_id)',
          'CREATE INDEX idx_notas_data ON notas_internas (data DESC)',
        ],
      })
      app.save(notasCol)
    }

    // 3. Adicionar campo 'cliente_id' à coleção 'conversas'
    const conversasCol = app.findCollectionByNameOrId('conversas')
    if (!conversasCol.fields.getByName('cliente_id')) {
      conversasCol.fields.add(
        new RelationField({
          name: 'cliente_id',
          required: false,
          collectionId: clientesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      app.save(conversasCol)
    }

    // 4. Migração e consolidação dos clientes existentes a partir das conversas
    // Garantir que cada conversa tenha cliente_ig_id e aponte para um registro na coleção 'clientes'
    const todasConversas = app.findRecordsByFilter('conversas', "id != ''", 'created', 500, 0)
    for (let i = 0; i < todasConversas.length; i++) {
      const conv = todasConversas[i]
      let igId = conv.getString('cliente_ig_id')
      const nome = conv.getString('cliente_nome') || 'Cliente'
      const usuario = conv.getString('cliente_usuario') || '@cliente'
      const dataCriacao = conv.getString('created') || new Date().toISOString()

      // Se conversa não tem cliente_ig_id (como as sementes iniciais), sintetiza com base no usuário
      if (!igId) {
        igId = 'ig_' + usuario.replace(/[^a-zA-Z0-9_]/g, '')
        conv.set('cliente_ig_id', igId)
      }

      // Buscar cliente correspondente por ig_id
      let clienteRecord = null
      try {
        clienteRecord = app.findFirstRecordByData('clientes', 'ig_id', igId)
      } catch (_) {}

      if (!clienteRecord) {
        clienteRecord = new Record(clientesCol)
        clienteRecord.set('ig_id', igId)
        clienteRecord.set('nome', nome)
        clienteRecord.set('usuario', usuario)
        clienteRecord.set('primeira_interacao', dataCriacao)
        app.save(clienteRecord)
      } else {
        // Se a conversa for mais antiga que a primeira_interacao registrada, atualiza
        const piAtual = clienteRecord.getString('primeira_interacao')
        if (dataCriacao && (!piAtual || new Date(dataCriacao) < new Date(piAtual))) {
          clienteRecord.set('primeira_interacao', dataCriacao)
          app.save(clienteRecord)
        }
      }

      // Vincular conversa ao cliente
      conv.set('cliente_id', clienteRecord.id)
      app.save(conv)
    }

    // 5. Seeding de conversas adicionais e notas para demonstrar os requisitos do teste do usuário:
    // "Júlia manda nova mensagem → conversa sobe com 1 não lida → Camila abre → não lidas zeram
    // → painel lateral mostra "3ª conversa, cliente desde março, 2 conversas anteriores"
    // → clica numa conversa anterior → vê aquele histórico → volta para a conversa atual
    // → escreve nota interna "cliente VIP, prefere resposta curta"..."
    try {
      const juliaCliente = app.findFirstRecordByData('clientes', 'usuario', '@julia.silva')
      if (juliaCliente) {
        // Definir primeira interação de Júlia para março (ex.: 2026-03-10)
        juliaCliente.set('primeira_interacao', '2026-03-10T14:00:00.000Z')
        app.save(juliaCliente)

        // Buscar usuário Camila para associar como autora/atendente
        let camila = null
        try {
          camila = app.findAuthRecordByEmail('_pb_users_auth_', 'camila@atendimento.com')
        } catch (_) {}

        // Verificar quantas conversas Júlia já tem
        const convsJulia = app.findRecordsByFilter(
          'conversas',
          "cliente_id = '" + juliaCliente.id + "'",
          'created',
          10,
          0,
        )

        // Se Júlia tiver apenas 1 conversa, vamos criar 2 conversas anteriores resolvidas para totalizar 3
        if (convsJulia.length < 3) {
          const mensagensCol = app.findCollectionByNameOrId('mensagens')

          // Conversa anterior 1 (março)
          const conv1 = new Record(conversasCol)
          conv1.set('cliente_nome', juliaCliente.getString('nome'))
          conv1.set('cliente_usuario', juliaCliente.getString('usuario'))
          conv1.set('cliente_ig_id', juliaCliente.getString('ig_id'))
          conv1.set('cliente_id', juliaCliente.id)
          conv1.set('situacao', 'resolvida')
          conv1.set('atendente_responsavel', camila ? camila.id : '')
          conv1.set('ultima_mensagem_data', '2026-03-12T16:20:00.000Z')
          conv1.set('nao_lidas', 0)
          app.save(conv1)

          const m1 = new Record(mensagensCol)
          m1.set('conversa_id', conv1.id)
          m1.set('remetente', 'cliente')
          m1.set('texto', 'Olá! Vocês fazem entrega para São Paulo capital?')
          m1.set('data_hora', '2026-03-12T16:00:00.000Z')
          m1.set('situacao', 'recebida')
          app.save(m1)

          const m2 = new Record(mensagensCol)
          m2.set('conversa_id', conv1.id)
          m2.set('remetente', 'central')
          m2.set(
            'texto',
            'Olá, Júlia! Entregamos sim, via Sedex ou transportadora expressa em até 2 dias úteis.',
          )
          m2.set('data_hora', '2026-03-12T16:15:00.000Z')
          m2.set('situacao', 'enviada')
          if (camila) m2.set('atendente_id', camila.id)
          app.save(m2)

          const m3 = new Record(mensagensCol)
          m3.set('conversa_id', conv1.id)
          m3.set('remetente', 'cliente')
          m3.set('texto', 'Ótimo, fiz o pedido agora no site! Muito obrigada.')
          m3.set('data_hora', '2026-03-12T16:20:00.000Z')
          m3.set('situacao', 'recebida')
          app.save(m3)

          // Conversa anterior 2 (junho)
          const conv2 = new Record(conversasCol)
          conv2.set('cliente_nome', juliaCliente.getString('nome'))
          conv2.set('cliente_usuario', juliaCliente.getString('usuario'))
          conv2.set('cliente_ig_id', juliaCliente.getString('ig_id'))
          conv2.set('cliente_id', juliaCliente.id)
          conv2.set('situacao', 'resolvida')
          conv2.set('atendente_responsavel', camila ? camila.id : '')
          conv2.set('ultima_mensagem_data', '2026-06-05T11:45:00.000Z')
          conv2.set('nao_lidas', 0)
          app.save(conv2)

          const m4 = new Record(mensagensCol)
          m4.set('conversa_id', conv2.id)
          m4.set('remetente', 'cliente')
          m4.set('texto', 'Bom dia! O sérum facial voltou ao estoque?')
          m4.set('data_hora', '2026-06-05T11:30:00.000Z')
          m4.set('situacao', 'recebida')
          app.save(m4)

          const m5 = new Record(mensagensCol)
          m5.set('conversa_id', conv2.id)
          m5.set('remetente', 'central')
          m5.set(
            'texto',
            'Bom dia, Júlia! Acabou de reabastecer hoje cedo. Já está disponível no catálogo!',
          )
          m5.set('data_hora', '2026-06-05T11:40:00.000Z')
          m5.set('situacao', 'enviada')
          if (camila) m5.set('atendente_id', camila.id)
          app.save(m5)

          const m6 = new Record(mensagensCol)
          m6.set('conversa_id', conv2.id)
          m6.set('remetente', 'cliente')
          m6.set('texto', 'Perfeito! Já garanti o meu.')
          m6.set('data_hora', '2026-06-05T11:45:00.000Z')
          m6.set('situacao', 'recebida')
          app.save(m6)
        }

        // Criar uma nota inicial para a Júlia (exemplo: prefere resposta curta, já comprou 2 vezes)
        const notasExistentes = app.findRecordsByFilter(
          'notas_internas',
          "cliente_id = '" + juliaCliente.id + "'",
          'created',
          1,
          0,
        )
        if (notasExistentes.length === 0 && camila) {
          const nota1 = new Record(notasCol)
          nota1.set('cliente_id', juliaCliente.id)
          nota1.set(
            'texto',
            'Cliente VIP, já comprou 2 vezes pelo site. Prefere resposta curta e direta.',
          )
          nota1.set('autor_id', camila.id)
          nota1.set('data', '2026-06-05T12:00:00.000Z')
          app.save(nota1)
        }
      }
    } catch (_) {}
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('notas_internas'))
    } catch (_) {}
    try {
      const conversasCol = app.findCollectionByNameOrId('conversas')
      const clienteField = conversasCol.fields.getByName('cliente_id')
      if (clienteField) {
        conversasCol.fields.removeById(clienteField.id)
        app.save(conversasCol)
      }
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('clientes'))
    } catch (_) {}
  },
)
