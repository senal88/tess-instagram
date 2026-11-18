migrate(
  (app) => {
    const conexaoCol = app.findCollectionByNameOrId('conexao_meta')

    // 1. Adicionar campo app_situacao ("em teste" | "em revisão" | "publicado", default "em teste")
    if (!conexaoCol.fields.getByName('app_situacao')) {
      conexaoCol.fields.add(
        new SelectField({
          name: 'app_situacao',
          required: true,
          values: ['em teste', 'em revisão', 'publicado'],
          maxSelect: 1,
        }),
      )
    }

    // 2. Adicionar campo data_mudanca_situacao (data da última mudança da situação do app)
    if (!conexaoCol.fields.getByName('data_mudanca_situacao')) {
      conexaoCol.fields.add(
        new DateField({
          name: 'data_mudanca_situacao',
          required: false,
        }),
      )
    }

    app.save(conexaoCol)

    // Preenche valor padrão nas conexões existentes se estiver vazio
    try {
      const records = app.findRecordsByFilter('conexao_meta', "id != ''", '-created', 10, 0)
      const nowIso = new Date().toISOString()
      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        let altered = false
        if (!r.getString('app_situacao')) {
          r.set('app_situacao', 'em teste')
          altered = true
        }
        if (!r.getString('data_mudanca_situacao')) {
          r.set('data_mudanca_situacao', nowIso)
          altered = true
        }
        if (altered) {
          app.save(r)
        }
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const conexaoCol = app.findCollectionByNameOrId('conexao_meta')
      if (conexaoCol.fields.getByName('app_situacao')) {
        conexaoCol.fields.removeByName('app_situacao')
      }
      if (conexaoCol.fields.getByName('data_mudanca_situacao')) {
        conexaoCol.fields.removeByName('data_mudanca_situacao')
      }
      app.save(conexaoCol)
    } catch (_) {}
  },
)
