migrate(
  (app) => {
    const adminOnlyRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const teamRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'atendente')"

    // 1. Coleção 'configuracoes_ia' (tom de voz da marca e instruções fixas)
    // Leitura: toda a equipe autenticada. Escrita/atualização: apenas administradores
    let configIaCol
    try {
      configIaCol = app.findCollectionByNameOrId('configuracoes_ia')
    } catch (_) {
      configIaCol = new Collection({
        name: 'configuracoes_ia',
        type: 'base',
        listRule: teamRule,
        viewRule: teamRule,
        createRule: adminOnlyRule,
        updateRule: adminOnlyRule,
        deleteRule: adminOnlyRule,
        fields: [
          { name: 'tom_de_voz', type: 'text', required: true, max: 2000 },
          { name: 'instrucoes_fixas', type: 'text', required: false, max: 5000 },
          {
            name: 'atualizado_por',
            type: 'relation',
            required: false,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      })
      app.save(configIaCol)
    }

    // Registro padrão inicial de configurações de IA
    const configsExistentes = app.findRecordsByFilter(
      'configuracoes_ia',
      "id != ''",
      'created',
      1,
      0,
    )
    if (configsExistentes.length === 0) {
      const configPadrao = new Record(configIaCol)
      configPadrao.set('tom_de_voz', 'simpático e direto, tratando de você')
      configPadrao.set(
        'instrucoes_fixas',
        'Nunca prometa prazo de entrega ou preço não confirmado. Sempre seja empático e acolhedor.',
      )
      try {
        const adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'patric.martins@adapta.org')
        if (adminUser) configPadrao.set('atualizado_por', adminUser.id)
      } catch (_) {}
      app.save(configPadrao)
    }

    // 2. Coleção 'copiloto_registros' (auditoria persistida de resumos e sugestões gerados)
    let registrosCol
    try {
      registrosCol = app.findCollectionByNameOrId('copiloto_registros')
    } catch (_) {
      registrosCol = new Collection({
        name: 'copiloto_registros',
        type: 'base',
        listRule: teamRule,
        viewRule: teamRule,
        createRule: teamRule,
        updateRule: teamRule,
        deleteRule: adminOnlyRule,
        fields: [
          {
            name: 'conversa_id',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('conversas').id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['resumo', 'sugestao'],
            maxSelect: 1,
          },
          { name: 'conteudo', type: 'text', required: true, max: 10000 },
          {
            name: 'solicitado_por',
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
          'CREATE INDEX idx_copiloto_conversa ON copiloto_registros (conversa_id)',
          'CREATE INDEX idx_copiloto_tipo ON copiloto_registros (tipo)',
          'CREATE INDEX idx_copiloto_data ON copiloto_registros (data DESC)',
        ],
      })
      app.save(registrosCol)
    }

    // 3. Adicionar campos de rascunho de IA e resumo na coleção 'conversas'
    const conversasCol = app.findCollectionByNameOrId('conversas')
    let saveConversas = false

    if (!conversasCol.fields.getByName('rascunho_texto')) {
      conversasCol.fields.add(
        new TextField({
          name: 'rascunho_texto',
          required: false,
          max: 5000,
        }),
      )
      saveConversas = true
    }

    if (!conversasCol.fields.getByName('rascunho_situacao')) {
      conversasCol.fields.add(
        new SelectField({
          name: 'rascunho_situacao',
          required: false,
          values: ['nenhum', 'sugestao', 'editado', 'pronto_para_envio'],
          maxSelect: 1,
        }),
      )
      saveConversas = true
    }

    if (!conversasCol.fields.getByName('ultimo_resumo_texto')) {
      conversasCol.fields.add(
        new TextField({
          name: 'ultimo_resumo_texto',
          required: false,
          max: 5000,
        }),
      )
      saveConversas = true
    }

    if (!conversasCol.fields.getByName('ultimo_resumo_data')) {
      conversasCol.fields.add(
        new DateField({
          name: 'ultimo_resumo_data',
          required: false,
        }),
      )
      saveConversas = true
    }

    if (!conversasCol.fields.getByName('ultimo_resumo_autor')) {
      conversasCol.fields.add(
        new RelationField({
          name: 'ultimo_resumo_autor',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        }),
      )
      saveConversas = true
    }

    if (!conversasCol.fields.getByName('ultima_sugestao_data')) {
      conversasCol.fields.add(
        new DateField({
          name: 'ultima_sugestao_data',
          required: false,
        }),
      )
      saveConversas = true
    }

    if (!conversasCol.fields.getByName('ultima_sugestao_autor')) {
      conversasCol.fields.add(
        new RelationField({
          name: 'ultima_sugestao_autor',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        }),
      )
      saveConversas = true
    }

    if (saveConversas) {
      app.save(conversasCol)
    }

    // 4. Declaração do AGENTE DE IA NATIVO da plataforma Skip Cloud
    // Slug: 'copiloto-atendimento-instagram'
    $ai.agents.define(app, {
      slug: 'copiloto-atendimento-instagram',
      name: 'Copiloto de Atendimento Instagram',
      description:
        'Copiloto com IA para a Central de Atendimento Instagram Direct. Resume conversas e sugere rascunhos de resposta.',
      systemPrompt: `Você é o Copiloto de IA oficial da Central de Atendimento do Instagram Direct.
Seu papel é auxiliar atendentes humanos com:
1) "Resumir conversa": Ler o histórico da conversa e gerar um resumo conciso contendo estritamente:
   - Quem é o cliente
   - O que pediu
   - O que já foi combinado
   - O que está pendente
2) "Sugerir resposta": Escrever um rascunho de resposta para a caixa de mensagem do atendente, considerando o histórico, o resumo e eventuais notas internas da equipe.

REGRAS OBRIGATÓRIAS E INEGOCIÁVEIS:
- A IA NUNCA envia mensagens. Você gera apenas rascunhos para leitura e edição por atendentes humanos.
- CONVERSA CURTA DEMAIS OU SEM CONTEXTO: responda honestamente e exatamente com a mensagem clara de que ainda não há contexto suficiente (ex.: "Ainda não tenho contexto suficiente para resumir/sugerir resposta. A conversa possui poucas mensagens ou apenas saudações iniciais."). NUNCA invente pedido, preço, número de pedido, prazo de entrega ou endereço.
- PRIVACIDADE E ISOLAMENTO: Use estritamente as mensagens e notas internas fornecidas no prompt daquela conversa específica. Nunca misture nem suponha dados de outros clientes.
- TOM DE VOZ E INSTRUÇÕES DA MARCA: Respeite rigorosamente o tom de voz da marca configurado pelo administrador e as instruções fixas passadas na solicitação.
- IDIOMA: Responda sempre em Português do Brasil (pt-BR).`,
      tier: 'fast',
      tools: [],
      memory: [
        {
          type: 'text',
          payload: {
            text: 'Diretrizes gerais do atendimento Instagram: atendimento cordial, profissional e transparente. Nunca prometa prazos de entrega ou preços sem confirmação expressa. Se não houver contexto suficiente, declare honestamente.',
          },
        },
      ],
    })

    // 5. Seeding das 12 mensagens do caso de teste da Júlia
    // "conversa da Júlia tem 12 mensagens sobre a troca de um pedido → Camila clica 'Resumir'
    // → resumo: 'Júlia pediu troca do pedido 1234 por tamanho; combinamos coleta na terça; falta confirmar o endereço'
    // → Camila clica 'Sugerir resposta' → rascunho confirma a coleta e pede o endereço, no tom da marca
    // → Camila edita o final → situação 'pronto para envio' → numa conversa com uma única mensagem 'oi'
    // → o resumo diz honestamente que ainda não há contexto suficiente."
    try {
      const juliaCliente = app.findFirstRecordByData('clientes', 'usuario', '@julia.silva')
      const mensagensCol = app.findCollectionByNameOrId('mensagens')

      let camilaUser = null
      try {
        camilaUser = app.findAuthRecordByEmail('_pb_users_auth_', 'camila@atendimento.com')
      } catch (_) {}

      if (juliaCliente) {
        // Encontrar a conversa ativa de Júlia (o21wb3k5mzkbvgw)
        let conversaAtivaJulia = null
        try {
          conversaAtivaJulia = app.findFirstRecordByData('conversas', 'id', 'o21wb3k5mzkbvgw')
        } catch (_) {
          try {
            const list = app.findRecordsByFilter(
              'conversas',
              "cliente_id = '" + juliaCliente.id + "' && situacao != 'resolvida'",
              '-created',
              1,
              0,
            )
            if (list.length > 0) conversaAtivaJulia = list[0]
          } catch (_) {}
        }

        if (conversaAtivaJulia) {
          // Checar quantas mensagens existem
          const msgsExistentes = app.findRecordsByFilter(
            'mensagens',
            "conversa_id = '" + conversaAtivaJulia.id + "'",
            'data_hora',
            50,
            0,
          )

          // Se a conversa não tem as 12 mensagens da troca do pedido 1234, recriamos as mensagens
          // para atender com precisão o cenário de teste oficial
          const precisaAtualizarCenario =
            msgsExistentes.length < 12 ||
            !msgsExistentes.some((m) => m.getString('texto').includes('1234'))

          if (precisaAtualizarCenario) {
            // Remover mensagens antigas desta conversa ativa
            for (let i = 0; i < msgsExistentes.length; i++) {
              try {
                app.delete(msgsExistentes[i])
              } catch (_) {}
            }

            // Inserir 12 mensagens completas sobre a troca do pedido 1234
            const dialogo12 = [
              {
                remetente: 'cliente',
                texto: 'Olá! Preciso fazer a troca de um produto do pedido 1234, vocês me ajudam?',
                data_hora: '2026-09-29T10:00:00.000Z',
              },
              {
                remetente: 'central',
                texto:
                  'Olá, Júlia! Claro que sim 😊 Qual produto do pedido 1234 você deseja trocar?',
                data_hora: '2026-09-29T10:05:00.000Z',
              },
              {
                remetente: 'cliente',
                texto: 'É o vestido floral midi. Ele ficou um pouco apertado no busto.',
                data_hora: '2026-09-29T10:08:00.000Z',
              },
              {
                remetente: 'central',
                texto: 'Entendi perfeitamente! Você gostaria de trocar pelo tamanho maior (G)?',
                data_hora: '2026-09-29T10:12:00.000Z',
              },
              {
                remetente: 'cliente',
                texto: 'Isso mesmo, queria a troca pelo tamanho G, por favor.',
                data_hora: '2026-09-29T10:15:00.000Z',
              },
              {
                remetente: 'central',
                texto:
                  'Temos o tamanho G em estoque reservado para você! Como você prefere fazer a devolução?',
                data_hora: '2026-09-29T10:20:00.000Z',
              },
              {
                remetente: 'cliente',
                texto:
                  'Vocês conseguem fazer coleta aqui em casa? Seria muito mais fácil para mim.',
                data_hora: '2026-09-29T10:25:00.000Z',
              },
              {
                remetente: 'central',
                texto:
                  'Conseguimos sim! Temos disponibilidade de coleta domiciliar da transportadora na próxima terça-feira.',
                data_hora: '2026-09-29T10:30:00.000Z',
              },
              {
                remetente: 'cliente',
                texto: 'Perfeito, terça-feira fica ótimo para mim! Combinado!',
                data_hora: '2026-09-29T10:35:00.000Z',
              },
              {
                remetente: 'central',
                texto:
                  'Ótimo, combinamos a coleta na terça então! Para agendarmos certinho no sistema, você pode me confirmar o endereço completo com CEP?',
                data_hora: '2026-09-29T10:40:00.000Z',
              },
              {
                remetente: 'cliente',
                texto: 'Vou pegar o comprovante aqui para passar o CEP exato.',
                data_hora: '2026-09-29T10:45:00.000Z',
              },
              {
                remetente: 'cliente',
                texto: 'Vocês precisam de algum ponto de referência também para a coleta na terça?',
                data_hora: '2026-09-30T09:02:00.000Z',
              },
            ]

            for (let i = 0; i < dialogo12.length; i++) {
              const item = dialogo12[i]
              const m = new Record(mensagensCol)
              m.set('conversa_id', conversaAtivaJulia.id)
              m.set('remetente', item.remetente)
              m.set('texto', item.texto)
              m.set('data_hora', item.data_hora)
              m.set('situacao', item.remetente === 'cliente' ? 'recebida' : 'enviada')
              if (item.remetente === 'central' && camilaUser) {
                m.set('atendente_id', camilaUser.id)
              }
              app.save(m)
            }

            conversaAtivaJulia.set('ultima_mensagem_data', '2026-09-30T09:02:00.000Z')
            conversaAtivaJulia.set('nao_lidas', 1)
            conversaAtivaJulia.set('situacao', 'em_atendimento')
            if (camilaUser) conversaAtivaJulia.set('atendente_responsavel', camilaUser.id)
            app.save(conversaAtivaJulia)
          }
        }

        // Seeding de conversa com mensagem curta "oi" para testar o caso de honestidade
        // "numa conversa com uma única mensagem 'oi' → o resumo diz honestamente que ainda não há contexto suficiente."
        let conversaOi = null
        try {
          conversaOi = app.findFirstRecordByData('conversas', 'cliente_usuario', '@lucas.teste')
        } catch (_) {}

        if (!conversaOi) {
          // Criar cliente Lucas
          let clienteLucas = null
          const clientesCol = app.findCollectionByNameOrId('clientes')
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

          conversaOi = new Record(conversasCol)
          conversaOi.set('cliente_nome', 'Lucas')
          conversaOi.set('cliente_usuario', '@lucas.teste')
          conversaOi.set('cliente_ig_id', 'ig_lucasteste')
          conversaOi.set('cliente_id', clienteLucas.id)
          conversaOi.set('situacao', 'nova')
          conversaOi.set('ultima_mensagem_data', '2026-09-30T08:15:00.000Z')
          conversaOi.set('nao_lidas', 1)
          app.save(conversaOi)

          const mOi = new Record(mensagensCol)
          mOi.set('conversa_id', conversaOi.id)
          mOi.set('remetente', 'cliente')
          mOi.set('texto', 'oi')
          mOi.set('data_hora', '2026-09-30T08:15:00.000Z')
          mOi.set('situacao', 'recebida')
          app.save(mOi)
        }
      }
    } catch (e) {
      console.log('Aviso ao semear cenário da etapa 6:', e)
    }
  },
  (app) => {
    try {
      $ai.agents.delete(app, 'copiloto-atendimento-instagram')
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('copiloto_registros'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('configuracoes_ia'))
    } catch (_) {}
  },
)
