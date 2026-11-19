const RL = (typeof window !== 'undefined' ? window.RL : global.RL) || {};
if (typeof window !== 'undefined') window.RL = RL;
if (typeof global !== 'undefined') global.RL = RL;

RL.voz = (function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let ouvindo = false;
  let aguardandoConfirmacaoSOS = false;
  let timeoutSOS = null;

  //Contrato da voz para a Interface
  const callbacks = {
    onInicio: () => {},
    onFim: () => {},
    onResultadoParcial: () => {},
    onComando: () => {},
    onErro: () => {},
    onPedirConfirmacaoSOS: () => {}
  };

  function configurar(novosCallbacks) {
    Object.assign(callbacks, novosCallbacks);
  }

  function limparEstadoSOS() {
    aguardandoConfirmacaoSOS = false;
    clearTimeout(timeoutSOS);
  }

  //Interpretador + Confirmação em duas etapas para SOS
  function interpretarFrase(textoBruto) {
    const texto = (textoBruto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    if (!texto) return { intencao: "DESCONHECIDO", original: textoBruto };

    if (aguardandoConfirmacaoSOS) {
      if (/\b(sim|confirmar|confirmo|enviar|pode mandar|sos|acionar)\b/.test(texto)) {
        limparEstadoSOS();
        return { intencao: "SOS_CONFIRMADO", original: textoBruto };
      }
      if (/\b(nao|cancelar|cancela|parar|errado)\b/.test(texto)) {
        limparEstadoSOS();
        return { intencao: "SOS_CANCELADO", original: textoBruto };
      }
    }


    if (/\b(socorro|emergencia|sos|ajuda urgente|perigo)\b/.test(texto)) {
      aguardandoConfirmacaoSOS = true;
      clearTimeout(timeoutSOS);
      timeoutSOS = setTimeout(limparEstadoSOS, 15000);
      return { intencao: "SOS_PENDENTE", original: textoBruto };
    }

    if (/\b(perfil cego|pessoa cega|deficiencia visual|modo cego)\b/.test(texto)) {
      return { intencao: "PERFIL", perfil: "cego", original: textoBruto };
    }
    if (/\b(perfil cadeirante|cadeira de rodas|modo cadeirante)\b/.test(texto)) {
      return { intencao: "PERFIL", perfil: "cadeirante", original: textoBruto };
    }

    // Destinos falados ("ir para Paulista", "rota para Sé")
    const matchDestino = texto.match(/^(?:ir para|rota para|levar para|navegar para|como chegar (?:na|no|em)|destino)\s+(.+)$/);
    if (matchDestino && matchDestino[1]) {
      return { intencao: "NAVEGAR_DESTINO", destinoTexto: matchDestino[1].trim(), original: textoBruto };
    }

    // Controles de navegação ao vivo
    if (/\b(iniciar navegacao|navegar|comecar rota)\b/.test(texto)) {
      return { intencao: "INICIAR_NAVEGACAO", original: textoBruto };
    }
    if (/\b(pausar|retomar)\b/.test(texto)) {
      return { intencao: "PAUSAR_NAVEGACAO", original: textoBruto };
    }
    if (/\b(encerrar|parar navegacao|cancelar rota)\b/.test(texto)) {
      return { intencao: "ENCERRAR_NAVEGACAO", original: textoBruto };
    }
    if (/\b(proximo passo|avancar)\b/.test(texto)) {
      return { intencao: "PROXIMO_PASSO", original: textoBruto };
    }

    // Reportar barreira (sincronizado com #tipoBarreira do index.html)
    if (/\b(reportar|registrar|avisar|barreira|buraco|calcada|quebrada|rampa|tatil|obra|veiculo|156)\b/.test(texto)) {
      let tipo = "sem_rampa";
      if (/\b(buraco|quebrada|irregular)\b/.test(texto)) tipo = "calcada_quebrada";
      else if (/\b(tatil|piso tatil)\b/.test(texto)) tipo = "piso_tatil_interrompido";
      else if (/\b(veiculo|carro|estacionado)\b/.test(texto)) tipo = "veiculo_bloqueando";
      else if (/\b(obra|sinalizacao)\b/.test(texto)) tipo = "obra_sem_sinalizacao";

      const usarAqui = /\b(aqui|neste local|agora|perto)\b/.test(texto);
      return { intencao: "REPORTAR_BARREIRA", tipoBarreira: tipo, usarAqui, original: textoBruto };
    }

    if (/\b(chamar voluntario|pedir apoio|voluntario|acompanhamento)\b/.test(texto)) {
      return { intencao: "CHAMAR_VOLUNTARIO", original: textoBruto };
    }
    if (/\b(alto contraste|contraste)\b/.test(texto)) {
      return { intencao: "ALTERNAR_CONTRASTE", original: textoBruto };
    }
    if (/\b(aumentar fonte|fonte maior|tamanho do texto)\b/.test(texto)) {
      return { intencao: "ALTERNAR_FONTE", original: textoBruto };
    }
    if (/\b(onde estou|minha localizacao)\b/.test(texto)) {
      return { intencao: "ONDE_ESTOU", original: textoBruto };
    }
    if (/\b(o que posso dizer|ajuda|comandos)\b/.test(texto)) {
      return { intencao: "AJUDA_COMANDOS", original: textoBruto };
    }

    return { intencao: "DESCONHECIDO", original: textoBruto };
  }

  //Lugares falados via RL.geo
  async function resolverLugarFalado(textoLugar) {
    const termo = (textoLugar || "").toLowerCase().trim();
    if (!window.RL || !RL.geo) throw new Error("Módulo RL.geo não carregado.");

    if (["aqui", "meu local", "minha localizacao", "onde estou"].includes(termo)) {
      return await RL.geo.obterPosicaoAtual();
    }
    return await RL.geo.buscarEndereco(textoLugar);
  }

  //Reconhecimento pt-BR com tratamento de erros
  function iniciar() {
    if (!SpeechRecognition) {
      callbacks.onErro({ codigo: "NAO_SUPORTADO", mensagem: "Navegador sem suporte a reconhecimento de voz." });
      return false;
    }
    if (ouvindo) return true;

    recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { ouvindo = true; callbacks.onInicio(); };

    recognition.onresult = async (event) => {
      let transcricaoFinal = "";
      let transcricaoParcial = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) transcricaoFinal += res[0].transcript;
        else transcricaoParcial += res[0].transcript;
      }

      if (transcricaoParcial) callbacks.onResultadoParcial(transcricaoParcial);

      if (transcricaoFinal) {
        const comando = interpretarFrase(transcricaoFinal);

        if (comando.intencao === "SOS_PENDENTE") {
          callbacks.onPedirConfirmacaoSOS(comando);
          return;
        }

        try {
          if (comando.intencao === "NAVEGAR_DESTINO" && comando.destinoTexto) {
            comando.lugar = await resolverLugarFalado(comando.destinoTexto);
          } else if (comando.intencao === "REPORTAR_BARREIRA" && comando.usarAqui) {
            comando.lugar = await resolverLugarFalado("aqui");
          } else if (comando.intencao === "ONDE_ESTOU") {
            comando.lugar = await resolverLugarFalado("aqui");
          }
        } catch (err) {
          callbacks.onErro({ codigo: "ERRO_GEO", mensagem: "Não foi possível localizar o endereço falado.", detalhe: err.message });
        }

        callbacks.onComando(comando);
      }
    };

    recognition.onerror = (event) => {
      ouvindo = false;
      const mapaErros = {
        "not-allowed": "Permissão de microfone negada. Libere no cadeado da barra de endereço.",
        "service-not-allowed": "Serviço de voz bloqueado pelo navegador.",
        "no-speech": "Nenhuma fala foi detectada. Pressione Alt+M e tente novamente.",
        "audio-capture": "Nenhum microfone encontrado no dispositivo.",
        "network": "Erro de rede no reconhecimento de voz.",
        "aborted": "Captura de voz cancelada."
      };
      callbacks.onErro({ codigo: event.error, mensagem: mapaErros[event.error] || "Erro desconhecido no reconhecimento de voz." });
    };

    recognition.onend = () => { ouvindo = false; callbacks.onFim(); };

    try {
      recognition.start();
      return true;
    } catch (e) {
      callbacks.onErro({ codigo: "FALHA_INICIO", mensagem: "Não foi possível iniciar o microfone." });
      return false;
    }
  }

  function parar() {
    if (recognition && ouvindo) {
      try { recognition.abort(); } catch (e) {}
    }
    ouvindo = false;
  }

  return {
    configurar,
    iniciar,
    parar,
    interpretarFrase,
    resolverLugarFalado,
    estaOuvindo: () => ouvindo,
    suportado: () => Boolean(SpeechRecognition)
  };
})();