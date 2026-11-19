const RL = (typeof window !== 'undefined' ? window.RL : global.RL) || {};
if (typeof window !== 'undefined') window.RL = RL;
if (typeof global !== 'undefined') global.RL = RL;

RL.comunidade = (function () {
  const CHAVE_SESSAO = "rotalivre_auth_session";
  const CHAVE_ENVIOS = "rotalivre_rate_limit";
  const CHAVE_DENUNCIAS = "rotalivre_denuncias";
  const LIMITE_ENVIOS_POR_HORA = 5;
  const LIMITE_DENUNCIAS_OCULTAR = 3;

  const config = {
    supabaseUrl: window.SUPABASE_URL || "",
    supabaseAnonKey: window.SUPABASE_ANON_KEY || ""
  };

  function configurar(url, anonKey) {
    config.supabaseUrl = url;
    config.supabaseAnonKey = anonKey;
  }

  // Base local de voluntários aprovados para pareamento por distância
  let voluntariosBase = [
    {
      id: "VOL-01",
      nome: "Carlos Mendes",
      regiao: "Estação Trianon-Masp / Av. Paulista",
      lat: -23.562500,
      lon: -46.654000,
      status_aprovacao: "aprovado",
      disponivel: true,
      nota: 4.9
    },
    {
      id: "VOL-02",
      nome: "Marina Alves",
      regiao: "Estação Metrô Sé / Praça da Sé",
      lat: -23.550100,
      lon: -46.634000,
      status_aprovacao: "aprovado",
      disponivel: true,
      nota: 5.0
    },
    {
      id: "VOL-03",
      nome: "Helena Costa (Agente CRAS)",
      regiao: "Consolação / Parque Trianon",
      lat: -23.558200,
      lon: -46.659800,
      status_aprovacao: "aprovado",
      disponivel: true,
      nota: 4.8
    }
  ];

  // Utilitário Haversine (metros)
  function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // Autenticação via Supabase Auth (com fallback local)
  async function autenticar(email, senha, modo = "login", metadados = {}) {
    if (!email || !senha) throw new Error("E-mail e senha são obrigatórios.");

    if (config.supabaseUrl && config.supabaseAnonKey) {
      const endpoint =
        modo === "cadastro"
          ? `${config.supabaseUrl}/auth/v1/signup`
          : `${config.supabaseUrl}/auth/v1/token?grant_type=password`;

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password: senha, data: metadados })
      });

      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.error_description || dados.msg || "Falha na autenticação.");

      const sessao = {
        userId: dados.user?.id || email,
        email,
        nome: metadados.nome || email.split("@")[0],
        accessToken: dados.access_token || null,
        provider: "supabase"
      };
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
      return sessao;
    }

    // Sessão local estruturada compatível com o contrato Supabase
    const sessaoLocal = {
      userId: `usr_${btoa(email).slice(0, 10)}`,
      email,
      nome: metadados.nome || email.split("@")[0],
      papel: metadados.papel || "cidadao",
      provider: "local"
    };
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessaoLocal));
    return sessaoLocal;
  }

  function obterSessaoAtual() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null");
    } catch (e) {
      return null;
    }
  }

  // Cadastro e aprovação manual de voluntários
  function cadastrarVoluntarioPendente(dados) {
    const novo = {
      id: `VOL-${Date.now()}`,
      nome: dados.nome,
      regiao: dados.regiao,
      lat: dados.lat ?? -23.561000,
      lon: dados.lon ?? -46.654000,
      status_aprovacao: "pendente", // exige aprovação manual 
      disponivel: false,
      nota: 5.0
    };
    voluntariosBase.push(novo);
    return novo;
  }

  function aprovarVoluntarioManualmente(voluntarioId) {
    const vol = voluntariosBase.find((v) => v.id === voluntarioId);
    if (!vol) throw new Error("Voluntário não encontrado.");
    vol.status_aprovacao = "aprovado";
    vol.disponivel = true;
    return vol;
  }

  // Limite de envios por pessoa (anti-spam) e denúncia de relato
  function verificarLimiteEnvios(usuarioId = "anonimo") {
    const agora = Date.now();
    const umaHoraMs = 60 * 60 * 1000;
    let registro = {};
    try {
      registro = JSON.parse(localStorage.getItem(CHAVE_ENVIOS) || "{}");
    } catch (e) {}

    const historico = (registro[usuarioId] || []).filter((ts) => agora - ts < umaHoraMs);
    if (historico.length >= LIMITE_ENVIOS_POR_HORA) {
      return {
        permitido: false,
        restantes: 0,
        mensagem: `Limite de ${LIMITE_ENVIOS_POR_HORA} relatos por hora atingido. Tente novamente mais tarde.`
      };
    }

    return {
      permitido: true,
      restantes: LIMITE_ENVIOS_POR_HORA - historico.length
    };
  }

  function registrarEnvioUsuario(usuarioId = "anonimo") {
    const check = verificarLimiteEnvios(usuarioId);
    if (!check.permitido) throw new Error(check.mensagem);

    const agora = Date.now();
    const umaHoraMs = 60 * 60 * 1000;
    let registro = {};
    try {
      registro = JSON.parse(localStorage.getItem(CHAVE_ENVIOS) || "{}");
    } catch (e) {}

    const historico = (registro[usuarioId] || []).filter((ts) => agora - ts < umaHoraMs);
    historico.push(agora);
    registro[usuarioId] = historico;
    localStorage.setItem(CHAVE_ENVIOS, JSON.stringify(registro));

    return { enviadosNaHora: historico.length, restantes: LIMITE_ENVIOS_POR_HORA - historico.length };
  }

  function denunciarRelato(relatoId, motivo = "Informação incorreta", usuarioId = "anonimo") {
    let denuncias = {};
    try {
      denuncias = JSON.parse(localStorage.getItem(CHAVE_DENUNCIAS) || "{}");
    } catch (e) {}

    denuncias[relatoId] = denuncias[relatoId] || [];
    const jaDenunciou = denuncias[relatoId].some((d) => d.usuarioId === usuarioId);
    if (jaDenunciou) {
      throw new Error("Você já denunciou este relato anteriormente.");
    }

    denuncias[relatoId].push({ usuarioId, motivo, data: new Date().toISOString() });
    localStorage.setItem(CHAVE_DENUNCIAS, JSON.stringify(denuncias));

    const total = denuncias[relatoId].length;
    return {
      relatoId,
      totalDenuncias: total,
      deveOcultar: total >= LIMITE_DENUNCIAS_OCULTAR
    };
  }

  // Pareamento por distância e envio do pedido
  function parearVoluntarioMaisProximo(posicaoCidadao, pontoEncontro = "Ponto atual") {
    const elegiveis = voluntariosBase
      .filter((v) => v.status_aprovacao === "aprovado" && v.disponivel)
      .map((v) => {
        const distanciaMetros = calcularDistanciaMetros(
          posicaoCidadao.lat,
          posicaoCidadao.lon,
          v.lat,
          v.lon
        );
        const tempoEstimadoMin = Math.max(2, Math.round(distanciaMetros / 75));
        return { ...v, distanciaMetros, tempoEstimadoMin };
      })
      .sort((a, b) => a.distanciaMetros - b.distanciaMetros);

    if (!elegiveis.length) {
      throw new Error("Nenhum voluntário aprovado disponível na região no momento.");
    }

    const escolhido = elegiveis[0];
    const senhaVoz = `ROTA-${Math.floor(100 + Math.random() * 900)}`;

    return {
      pedidoId: `PED-${Date.now()}`,
      status: "pareado",
      pontoEncontro,
      voluntario: escolhido,
      distanciaMetros: escolhido.distanciaMetros,
      tempoChegadaMinutos: escolhido.tempoEstimadoMin,
      senhaVoz
    };
  }

  //SOS real e simples — link de SMS / WhatsApp com a localização
  function gerarLinksSOS(posicao, contato = { nome: "Contato de Confiança", tel: "" }) {
    const lat = Number(posicao.lat).toFixed(6);
    const lon = Number(posicao.lon).toFixed(6);
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;

    const mensagem =
      `🆘 ALERTA SOS - RotaLivre!\n` +
      `Preciso de apoio imediato.\n` +
      `Minha localização GPS: ${lat}, ${lon}\n` +
      `Abrir no mapa: ${mapsUrl}`;

    const textoCodificado = encodeURIComponent(mensagem);
    const telefoneLimpo = (contato.tel || "").replace(/\D/g, "");
    const telefoneComDDI =
      telefoneLimpo.length >= 10 && !telefoneLimpo.startsWith("55")
        ? `55${telefoneLimpo}`
        : telefoneLimpo;

    const whatsappUrl = telefoneComDDI
      ? `https://wa.me/${telefoneComDDI}?text=${textoCodificado}`
      : `https://wa.me/?text=${textoCodificado}`;

    const smsUrl = telefoneLimpo
      ? `sms:${telefoneLimpo}?body=${textoCodificado}`
      : `sms:?body=${textoCodificado}`;

    return {
      mensagem,
      mapsUrl,
      whatsappUrl,
      smsUrl
    };
  }

  return {
    LIMITE_ENVIOS_POR_HORA,
    LIMITE_DENUNCIAS_OCULTAR,
    configurar,
    autenticar,
    obterSessaoAtual,
    cadastrarVoluntarioPendente,
    aprovarVoluntarioManualmente,
    verificarLimiteEnvios,
    registrarEnvioUsuario,
    denunciarRelato,
    parearVoluntarioMaisProximo,
    gerarLinksSOS,
    listarVoluntarios: () => [...voluntariosBase]
  };
})();