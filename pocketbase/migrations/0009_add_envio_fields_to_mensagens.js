migrate(
  (app) => {
    const mensagensCol = app.findCollectionByNameOrId('mensagens')

    // 1. Campo para motivo do erro (quando situacao === 'erro')
    if (!mensagensCol.fields.getByName('motivo_erro')) {
      mensagensCol.fields.add(
        new TextField({
          name: 'motivo_erro',
          required: false,
        }),
      )
    }

    // 2. Campo para chave de idempotência do envio (evita envio duplo em cliques repetidos)
    if (!mensagensCol.fields.getByName('id_idempotencia')) {
      mensagensCol.fields.add(
        new TextField({
          name: 'id_idempotencia',
          required: false,
        }),
      )
    }

    app.save(mensagensCol)

    // 3. Índice para busca rápida e deduplicação de idempotência
    try {
      mensagensCol.addIndex('idx_mensagens_idempotencia', false, 'id_idempotencia', '')
      app.save(mensagensCol)
    } catch (_) {}
  },
  (app) => {
    try {
      const mensagensCol = app.findCollectionByNameOrId('mensagens')
      if (mensagensCol.fields.getByName('id_idempotencia')) {
        try {
          mensagensCol.removeIndex('idx_mensagens_idempotencia')
        } catch (_) {}
        mensagensCol.fields.removeByName('id_idempotencia')
      }
      if (mensagensCol.fields.getByName('motivo_erro')) {
        mensagensCol.fields.removeByName('motivo_erro')
      }
      app.save(mensagensCol)
    } catch (_) {}
  },
)
