routerAdd(
  'POST',
  '/backend/v1/meta/validar-janela',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Não autenticado.' })
    }

    const body = e.requestInfo().body || {}
    const ultimaMensagemData = body.ultima_mensagem_data
    const isHumanAgent = Boolean(body.human_agent)
    const isClickToDirect = Boolean(body.click_to_direct)
    const textoMensagem = body.texto || ''

    if (!ultimaMensagemData) {
      return e.json(400, {
        valido: false,
        motivo: 'sem_mensagem_previa',
        mensagem:
          'Não é possível responder: o cliente ainda não enviou uma mensagem. A documentação oficial da Meta proíbe que a empresa inicie conversas ativamente no Direct do Instagram.',
      })
    }

    // Validação de tamanho da mensagem (UTF-8 max 1000 bytes)
    // No JS da VM PocketBase, string length em caracteres ou bytes
    let byteLength = 0
    for (let i = 0; i < textoMensagem.length; i++) {
      const code = textoMensagem.charCodeAt(i)
      if (code <= 0x7f) byteLength += 1
      else if (code <= 0x7ff) byteLength += 2
      else if (code >= 0xd800 && code <= 0xdbff) {
        // Surrogate pair (4 bytes)
        byteLength += 4
        i++
      } else byteLength += 3
    }

    if (byteLength > 1000) {
      return e.json(400, {
        valido: false,
        motivo: 'limite_bytes_excedido',
        bytes_atuais: byteLength,
        limite_bytes: 1000,
        mensagem:
          'O envio foi bloqueado: a mensagem possui ' +
          byteLength +
          ' bytes e excede o limite oficial de 1.000 bytes em UTF-8 da Send API da Meta. Reduza o texto antes de enviar.',
      })
    }

    const agoraMs = new Date().getTime()
    const ultimaMs = new Date(ultimaMensagemData).getTime()
    if (isNaN(ultimaMs)) {
      return e.json(400, {
        valido: false,
        motivo: 'data_invalida',
        mensagem: 'Data da última mensagem do cliente inválida.',
      })
    }

    const diffMs = agoraMs - ultimaMs
    const diffHoras = diffMs / (1000 * 60 * 60)

    // Regras de limites de janela da Meta
    // Janela padrão: 24 horas (ou 7 dias = 168 horas se click-to-direct)
    // Human agent: 7 dias (168 horas)
    let limiteHoras = 24
    let tipoJanela = 'padrao_24h'

    if (isHumanAgent) {
      limiteHoras = 7 * 24 // 168h
      tipoJanela = 'human_agent_7d'
    } else if (isClickToDirect) {
      limiteHoras = 7 * 24 // 168h
      tipoJanela = 'click_to_direct_7d'
    }

    const dentroDaJanela = diffHoras <= limiteHoras
    const horasRestantes = Math.max(0, Math.floor(limiteHoras - diffHoras))

    if (!dentroDaJanela) {
      const mensagemBloqueio = isHumanAgent
        ? 'Envio bloqueado: a janela estendida Human Agent de 7 dias expirou desde a última mensagem do cliente. Conforme a documentação oficial da Meta, novas mensagens só podem ser enviadas após o cliente interagir novamente.'
        : 'Envio bloqueado: a janela padrão de resposta de 24 horas encerrou-se. Conforme as regras oficiais da Meta for Developers, mensagens enviadas fora da janela de 24 horas são rejeitadas. Você pode solicitar ao cliente uma nova mensagem ou ativar a tag Human Agent se qualificado.'

      return e.json(200, {
        valido: false,
        dentro_janela: false,
        motivo: 'fora_da_janela',
        tipo_janela: tipoJanela,
        limite_horas: limiteHoras,
        horas_decorridas: Math.round(diffHoras * 10) / 10,
        mensagem: mensagemBloqueio,
      })
    }

    return e.json(200, {
      valido: true,
      dentro_janela: true,
      tipo_janela: tipoJanela,
      limite_horas: limiteHoras,
      horas_decorridas: Math.round(diffHoras * 10) / 10,
      horas_restantes: horasRestantes,
      bytes: byteLength,
      mensagem: 'Dentro da janela de resposta oficial da Meta.',
    })
  },
  $apis.requireAuth(),
)
