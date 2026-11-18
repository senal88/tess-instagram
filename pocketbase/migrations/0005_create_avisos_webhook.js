migrate(
  (app) => {
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const conversasCol = app.findCollectionByNameOrId('conversas')

    // 1. Coleção avisos_webhook (registro idempotente de eventos de webhook da Meta)
    const avisosCol = new Collection({
      name: 'avisos_webhook',
      type: 'base',
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        { name: 'identificador_evento', type: 'text', required: true },
        {
          name: 'tipo_evento',
          type: 'select',
          required: true,
          values: ['mensagem', 'eco', 'status', 'outro'],
          maxSelect: 1,
          default: 'mensagem',
        },
        {
          name: 'situacao',
          type: 'select',
          required: true,
          values: ['aceito', 'rejeitado', 'eco'],
          maxSelect: 1,
          default: 'aceito',
        },
        { name: 'motivo_rejeicao', type: 'text', required: false },
        { name: 'remetente_id', type: 'text', required: false },
        { name: 'destinatario_id', type: 'text', required: false },
        { name: 'texto_mensagem', type: 'text', required: false },
        { name: 'payload', type: 'json', required: false },
        { name: 'data_recebimento', type: 'date', required: true },
        {
          name: 'conversa_id',
          type: 'relation',
          required: false,
          collectionId: conversasCol.id,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_avisos_identificador ON avisos_webhook (identificador_evento)',
        'CREATE INDEX idx_avisos_situacao ON avisos_webhook (situacao)',
        'CREATE INDEX idx_avisos_data ON avisos_webhook (data_recebimento DESC)',
      ],
    })
    app.save(avisosCol)

    // 2. Garantir que coleções conversas e mensagens suportem identificadores longos e vínculo com id Instagram
    // Adicionar cliente_ig_id em conversas (para indexar por ID único de cliente da Meta)
    if (!conversasCol.fields.getByName('cliente_ig_id')) {
      conversasCol.fields.add(
        new TextField({
          name: 'cliente_ig_id',
          required: false,
        }),
      )
      app.save(conversasCol)
      conversasCol.addIndex('idx_conversas_cliente_ig_id', false, 'cliente_ig_id', '')
      app.save(conversasCol)
    }

    // Adicionar identificador_externo (mid) em mensagens para rastreamento direto e deduplicação
    const mensagensCol = app.findCollectionByNameOrId('mensagens')
    if (!mensagensCol.fields.getByName('identificador_externo')) {
      mensagensCol.fields.add(
        new TextField({
          name: 'identificador_externo',
          required: false,
        }),
      )
      app.save(mensagensCol)
      mensagensCol.addIndex(
        'idx_mensagens_identificador_externo',
        false,
        'identificador_externo',
        '',
      )
      app.save(mensagensCol)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('avisos_webhook'))
    } catch (_) {}

    try {
      const conversasCol = app.findCollectionByNameOrId('conversas')
      if (conversasCol.fields.getByName('cliente_ig_id')) {
        conversasCol.removeIndex('idx_conversas_cliente_ig_id')
        conversasCol.fields.removeByName('cliente_ig_id')
        app.save(conversasCol)
      }
    } catch (_) {}

    try {
      const mensagensCol = app.findCollectionByNameOrId('mensagens')
      if (mensagensCol.fields.getByName('identificador_externo')) {
        mensagensCol.removeIndex('idx_mensagens_identificador_externo')
        mensagensCol.fields.removeByName('identificador_externo')
        app.save(mensagensCol)
      }
    } catch (_) {}
  },
)
