migrate(
  (app) => {
    const adminRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const teamRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'atendente')"

    // 1. Coleção conexao_meta
    const conexaoMeta = new Collection({
      name: 'conexao_meta',
      type: 'base',
      listRule: teamRule,
      viewRule: teamRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        { name: 'app_nome', type: 'text', required: false, max: 200 },
        { name: 'app_id', type: 'text', required: false, max: 100 },
        { name: 'app_secret', type: 'text', required: false, max: 250 },
        { name: 'verify_token', type: 'text', required: true, max: 120 },
        { name: 'url_login', type: 'text', required: false, max: 2000 },
        {
          name: 'situacao',
          type: 'select',
          required: true,
          values: ['desconectada', 'conectada', 'reconectar'],
          maxSelect: 1,
        },
        { name: 'conta_usuario', type: 'text', required: false, max: 100 },
        { name: 'conta_nome', type: 'text', required: false, max: 200 },
        { name: 'conta_id', type: 'text', required: false, max: 100 },
        { name: 'data_conexao', type: 'date', required: false },
        { name: 'access_token', type: 'text', required: false, max: 2000 },
        { name: 'token_expira_em', type: 'date', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_conexao_situacao ON conexao_meta (situacao)'],
    })
    app.save(conexaoMeta)

    // 2. Coleção historico_conexao
    const historico = new Collection({
      name: 'historico_conexao',
      type: 'base',
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        {
          name: 'usuario_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'autor_nome', type: 'text', required: true, max: 150 },
        { name: 'acao', type: 'text', required: true, max: 100 },
        { name: 'detalhes', type: 'text', required: false, max: 1000 },
        { name: 'data', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_historico_created ON historico_conexao (created DESC)'],
    })
    app.save(historico)

    // Provisionamento do registro único de conexao_meta com verify_token gerado aleatoriamente
    let existingConexao = null
    try {
      const records = app.findRecordsByFilter('conexao_meta', "id != ''", '-created', 1, 0)
      if (records && records.length > 0) {
        existingConexao = records[0]
      }
    } catch (_) {}

    if (!existingConexao) {
      const token = 'ig_vfy_' + $security.randomString(32)
      const record = new Record(conexaoMeta)
      record.set('verify_token', token)
      record.set('situacao', 'desconectada')
      record.set('app_nome', '')
      record.set('app_id', '')
      record.set('app_secret', '')
      record.set('url_login', '')
      app.save(record)

      // Registra no histórico inicial
      const histRecord = new Record(historico)
      histRecord.set('autor_nome', 'Sistema')
      histRecord.set('acao', 'Provisionamento de conexão')
      histRecord.set('detalhes', 'Configuração inicial gerada com token de verificação único.')
      app.save(histRecord)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('historico_conexao'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('conexao_meta'))
    } catch (_) {}
  },
)
