routerAdd(
  'POST',
  '/backend/v1/copiloto/resumir',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    const body = e.requestInfo().body || {}
    const conversaId = body.conversa_id

    if (!conversaId) {
      return e.json(400, { error: 'O identificador da conversa (conversa_id) é obrigatório.' })
    }

    try {
      const conversaRec = $app.findFirstRecordByData('conversas', 'id', conversaId)
      if (!conversaRec) {
        return e.json(404, { error: 'Conversa não encontrada.' })
      }

      // 1. Carregar mensagens apenas desta conversa em ordem cronológica
      const msgs = $app.findRecordsByFilter(
        'mensagens',
        "conversa_id = '" + conversaId + "'",
        'data_hora',
        200,
        0,
      )

      // 2. Carregar notas internas apenas deste cliente
      let notasTexto = ''
      const clienteId = conversaRec.getString('cliente_id')
      if (clienteId) {
        try {
          const notasRecs = $app.findRecordsByFilter(
            'notas_internas',
            "cliente_id = '" + clienteId + "'",
            '-data',
            20,
            0,
          )
          if (notasRecs.length > 0) {
            const arr = []
            for (let i = 0; i < notasRecs.length; i++) {
              arr.push('- ' + notasRecs[i].getString('texto'))
            }
            notasTexto = arr.join('\n')
          }
        } catch (_) {}
      }

      // 3. Carregar configuração de tom de voz e instruções fixas
      let tomDeVoz = 'simpático e direto, tratando de você'
      let instrucoesFixas = 'Nunca prometa prazo de entrega ou preço não confirmado.'
      try {
        const configs = $app.findRecordsByFilter('configuracoes_ia', "id != ''", '-created', 1, 0)
        if (configs.length > 0) {
          tomDeVoz = configs[0].getString('tom_de_voz') || tomDeVoz
          instrucoesFixas = configs[0].getString('instrucoes_fixas') || instrucoesFixas
        }
      } catch (_) {}

      // Verificação de histórico curto demais ou sem contexto
      // Se houver 0 mensagens ou apenas 1 mensagem curta (ex.: "oi"), a regra de honestidade se aplica
      const clienteNome = conversaRec.getString('cliente_nome') || 'Cliente'
      const clienteUsuario = conversaRec.getString('cliente_usuario') || '@cliente'

      let ehMuitoCurta = false
      if (msgs.length === 0) {
        ehMuitoCurta = true
      } else if (msgs.length === 1) {
        const t = msgs[0].getString('texto').trim().toLowerCase()
        if (t.length <= 15 || t === 'oi' || t === 'olá' || t === 'ola' || t === 'bom dia') {
          ehMuitoCurta = true
        }
      }

      let resumoFinal = ''

      if (ehMuitoCurta) {
        resumoFinal =
          'Ainda não tenho contexto suficiente para resumir esta conversa. O cliente enviou apenas uma saudação inicial ou o histórico ainda não possui detalhes da solicitação.'
      } else {
        // Formatar histórico para o prompt
        const historicoLinhas = []
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i]
          const autor = m.getString('remetente') === 'central' ? 'Central' : clienteNome
          historicoLinhas.push(autor + ': ' + m.getString('texto'))
        }

        const promptMensagem =
          'Ação solicitada: RESUMIR CONVERSA\n\n' +
          'DADOS DA CONVERSA:\n' +
          'Cliente: ' +
          clienteNome +
          ' (' +
          clienteUsuario +
          ')\n' +
          'Total de mensagens: ' +
          msgs.length +
          '\n\n' +
          'HISTÓRICO DA CONVERSA (apenas desta conversa):\n' +
          historicoLinhas.join('\n') +
          '\n\n' +
          (notasTexto ? 'NOTAS INTERNAS DESTE CLIENTE:\n' + notasTexto + '\n\n' : '') +
          'CONFIGURAÇÃO DA MARCA:\n' +
          '- Tom de voz: ' +
          tomDeVoz +
          '\n' +
          '- Instruções fixas: ' +
          instrucoesFixas +
          '\n\n' +
          'INSTRUÇÃO ESPECÍFICA:\n' +
          'Gere um resumo curto e objetivo contendo exatamente os 4 pontos:\n' +
          '1) Quem é o cliente\n' +
          '2) O que pediu\n' +
          '3) O que já foi combinado\n' +
          '4) O que está pendente\n\n' +
          'Se a conversa for muito curta ou não tiver contexto de pedido/dúvida, responda honestamente que ainda não tem contexto suficiente. Nunca invente dados.'

        // Chamar o agente de IA nativo da plataforma Skip Cloud
        const resultadoAgente = $ai.agent('copiloto-atendimento-instagram').chat({
          user_id: auth.id,
          message: promptMensagem,
        })

        resumoFinal =
          resultadoAgente && resultadoAgente.content ? resultadoAgente.content.trim() : ''
        if (!resumoFinal) {
          resumoFinal =
            clienteNome +
            ' entrou em contato via Instagram Direct. Aguardando maior detalhamento para síntese completa.'
        }
      }

      const agoraIso = new Date().toISOString()

      // Atualizar campos na conversa
      conversaRec.set('ultimo_resumo_texto', resumoFinal)
      conversaRec.set('ultimo_resumo_data', agoraIso)
      conversaRec.set('ultimo_resumo_autor', auth.id)
      $app.save(conversaRec)

      // Registrar auditoria na coleção copiloto_registros
      const copilotoRegCol = $app.findCollectionByNameOrId('copiloto_registros')
      const reg = new Record(copilotoRegCol)
      reg.set('conversa_id', conversaId)
      reg.set('tipo', 'resumo')
      reg.set('conteudo', resumoFinal)
      reg.set('solicitado_por', auth.id)
      reg.set('data', agoraIso)
      $app.save(reg)

      return e.json(200, {
        sucesso: true,
        resumo: resumoFinal,
        data: agoraIso,
        solicitado_por: {
          id: auth.id,
          name: auth.getString('name') || auth.getString('email'),
        },
      })
    } catch (err) {
      return e.json(500, {
        error: 'Não foi possível gerar o resumo da conversa no momento: ' + String(err),
      })
    }
  },
  $apis.requireAuth(),
)
