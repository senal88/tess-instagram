routerAdd(
  'POST',
  '/backend/v1/copiloto/sugerir-resposta',
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

      // 1. Mensagens da conversa
      const msgs = $app.findRecordsByFilter(
        'mensagens',
        "conversa_id = '" + conversaId + "'",
        'data_hora',
        200,
        0,
      )

      // 2. Notas internas do cliente
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

      // 3. Tom de voz e instruções fixas
      let tomDeVoz = 'simpático e direto, tratando de você'
      let instrucoesFixas = 'Nunca prometa prazo de entrega ou preço não confirmado.'
      try {
        const configs = $app.findRecordsByFilter('configuracoes_ia', "id != ''", '-created', 1, 0)
        if (configs.length > 0) {
          tomDeVoz = configs[0].getString('tom_de_voz') || tomDeVoz
          instrucoesFixas = configs[0].getString('instrucoes_fixas') || instrucoesFixas
        }
      } catch (_) {}

      const clienteNome = conversaRec.getString('cliente_nome') || 'Cliente'
      const clienteUsuario = conversaRec.getString('cliente_usuario') || '@cliente'
      const ultimoResumo = conversaRec.getString('ultimo_resumo_texto') || ''

      // Checagem de contexto suficiente
      let ehMuitoCurta = false
      if (msgs.length === 0) {
        ehMuitoCurta = true
      } else if (msgs.length === 1) {
        const t = msgs[0].getString('texto').trim().toLowerCase()
        if (t.length <= 15 || t === 'oi' || t === 'olá' || t === 'ola' || t === 'bom dia') {
          ehMuitoCurta = true
        }
      }

      let sugestaoFinal = ''

      if (ehMuitoCurta) {
        sugestaoFinal = 'Olá, ' + clienteNome + '! Tudo bem? Como podemos ajudar você hoje? 😊'
      } else {
        const historicoLinhas = []
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i]
          const autor = m.getString('remetente') === 'central' ? 'Central' : clienteNome
          historicoLinhas.push(autor + ': ' + m.getString('texto'))
        }

        const promptMensagem =
          'Ação solicitada: SUGERIR RESPOSTA PARA O ATENDENTE\n\n' +
          'DADOS DA CONVERSA:\n' +
          'Cliente: ' +
          clienteNome +
          ' (' +
          clienteUsuario +
          ')\n\n' +
          'HISTÓRICO DA CONVERSA:\n' +
          historicoLinhas.join('\n') +
          '\n\n' +
          (ultimoResumo ? 'ÚLTIMO RESUMO DA CONVERSA:\n' + ultimoResumo + '\n\n' : '') +
          (notasTexto ? 'NOTAS INTERNAS DESTE CLIENTE:\n' + notasTexto + '\n\n' : '') +
          'CONFIGURAÇÃO DA MARCA:\n' +
          '- Tom de voz: ' +
          tomDeVoz +
          '\n' +
          '- Instruções fixas: ' +
          instrucoesFixas +
          '\n\n' +
          'DIRETRIZES DO RASCUNHO:\n' +
          '1. Escreva APENAS o texto da mensagem que o atendente enviará para o cliente.\n' +
          '2. Considere o histórico, o que foi combinado e o que está pendente (ex.: se foi combinada coleta na terça, confirme a coleta e peça o que falta, como endereço/CEP).\n' +
          '3. Siga com fidelidade o tom de voz da marca e as instruções fixas.\n' +
          '4. Seja direto, acolhedor e profissional. Não coloque cabeçalhos, títulos ou explicações extras: apenas o texto da resposta pronta para o atendente ler e editar.'

        const resultadoAgente = $ai.agent('copiloto-atendimento-instagram').chat({
          user_id: auth.id,
          message: promptMensagem,
        })

        sugestaoFinal =
          resultadoAgente && resultadoAgente.content ? resultadoAgente.content.trim() : ''
        if (!sugestaoFinal) {
          sugestaoFinal =
            'Olá, ' +
            clienteNome +
            '! Estamos aqui para ajudar. Poderia nos passar mais detalhes para prosseguirmos com seu atendimento?'
        }
      }

      const agoraIso = new Date().toISOString()

      // Atualizar rascunho na conversa com situação 'sugestao'
      conversaRec.set('rascunho_texto', sugestaoFinal)
      conversaRec.set('rascunho_situacao', 'sugestao')
      conversaRec.set('ultima_sugestao_data', agoraIso)
      conversaRec.set('ultima_sugestao_autor', auth.id)
      $app.save(conversaRec)

      // Registrar auditoria na coleção copiloto_registros
      const copilotoRegCol = $app.findCollectionByNameOrId('copiloto_registros')
      const reg = new Record(copilotoRegCol)
      reg.set('conversa_id', conversaId)
      reg.set('tipo', 'sugestao')
      reg.set('conteudo', sugestaoFinal)
      reg.set('solicitado_por', auth.id)
      reg.set('data', agoraIso)
      $app.save(reg)

      return e.json(200, {
        sucesso: true,
        rascunho_texto: sugestaoFinal,
        rascunho_situacao: 'sugestao',
        data: agoraIso,
        solicitado_por: {
          id: auth.id,
          name: auth.getString('name') || auth.getString('email'),
        },
      })
    } catch (err) {
      return e.json(500, {
        error: 'Não foi possível gerar a sugestão de resposta no momento: ' + String(err),
      })
    }
  },
  $apis.requireAuth(),
)
