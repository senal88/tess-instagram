migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: true,
          values: ['admin', 'atendente'],
          maxSelect: 1,
          default: 'atendente',
        }),
      )
      app.save(users)
    }

    const teamRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'atendente')"

    const conversas = new Collection({
      name: 'conversas',
      type: 'base',
      listRule: teamRule,
      viewRule: teamRule,
      createRule: teamRule,
      updateRule: teamRule,
      deleteRule: teamRule,
      fields: [
        { name: 'cliente_nome', type: 'text', required: true, max: 160 },
        { name: 'cliente_usuario', type: 'text', required: true, max: 160 },
        {
          name: 'situacao',
          type: 'select',
          required: true,
          values: ['nova', 'em_atendimento', 'aguardando_cliente', 'resolvida'],
          maxSelect: 1,
          default: 'nova',
        },
        {
          name: 'atendente_responsavel',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'ultima_mensagem_data', type: 'date', required: true },
        { name: 'nao_lidas', type: 'number', required: false, onlyInt: true, min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_conversas_cliente_usuario ON conversas (cliente_usuario)',
        'CREATE INDEX idx_conversas_situacao ON conversas (situacao)',
        'CREATE INDEX idx_conversas_atendente ON conversas (atendente_responsavel)',
        'CREATE INDEX idx_conversas_ultima_mensagem ON conversas (ultima_mensagem_data DESC)',
      ],
    })
    app.save(conversas)

    const mensagens = new Collection({
      name: 'mensagens',
      type: 'base',
      listRule: teamRule,
      viewRule: teamRule,
      createRule: teamRule,
      updateRule: teamRule,
      deleteRule: teamRule,
      fields: [
        {
          name: 'conversa_id',
          type: 'relation',
          required: true,
          collectionId: conversas.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'remetente',
          type: 'select',
          required: true,
          values: ['cliente', 'central'],
          maxSelect: 1,
        },
        { name: 'texto', type: 'text', required: true, max: 10000 },
        { name: 'data_hora', type: 'date', required: true },
        {
          name: 'situacao',
          type: 'select',
          required: true,
          values: ['recebida', 'enviada', 'erro'],
          maxSelect: 1,
          default: 'recebida',
        },
        {
          name: 'atendente_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_mensagens_conversa ON mensagens (conversa_id)',
        'CREATE INDEX idx_mensagens_data_hora ON mensagens (data_hora)',
        'CREATE INDEX idx_mensagens_situacao ON mensagens (situacao)',
      ],
    })
    app.save(mensagens)

    const mudancas = new Collection({
      name: 'mudancas_situacao',
      type: 'base',
      listRule: teamRule,
      viewRule: teamRule,
      createRule: teamRule,
      updateRule: teamRule,
      deleteRule: teamRule,
      fields: [
        {
          name: 'conversa_id',
          type: 'relation',
          required: true,
          collectionId: conversas.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'situacao_anterior',
          type: 'select',
          required: true,
          values: ['nova', 'em_atendimento', 'aguardando_cliente', 'resolvida'],
          maxSelect: 1,
        },
        {
          name: 'situacao_nova',
          type: 'select',
          required: true,
          values: ['nova', 'em_atendimento', 'aguardando_cliente', 'resolvida'],
          maxSelect: 1,
        },
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'data', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_mudancas_conversa ON mudancas_situacao (conversa_id)',
        'CREATE INDEX idx_mudancas_usuario ON mudancas_situacao (usuario_id)',
      ],
    })
    app.save(mudancas)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('mudancas_situacao'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('mensagens'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('conversas'))
    } catch (_) {}
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const role = users.fields.getByName('role')
    if (role) {
      users.fields.removeById(role.id)
      app.save(users)
    }
  },
)
