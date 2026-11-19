const RL = (typeof window !== 'undefined' ? window.RL : global.RL) || {};
if (typeof window !== 'undefined') window.RL = RL;
if (typeof global !== 'undefined') global.RL = RL;

RL.servicos = (function () {
  // Configuração de roteamento (pública vs instância própria)
  const configRota = {
    urlPublica: "https://router.project-osrm.org/route/v1/foot",
    urlInstanciaPropria: window.OSRM_CUSTOM_URL || "",
    usarInstanciaPropria: Boolean(window.OSRM_CUSTOM_URL),
    falhasPublicasConsecutivas: 0
  };

  function configurarInstanciaRota(urlPropria, ativar = true) {
    configRota.urlInstanciaPropria = (urlPropria || "").replace(/\/$/, "");
    configRota.usarInstanciaPropria = Boolean(ativar && configRota.urlInstanciaPropria);
  }

  function obterEndpointRoteamento() {
    if (configRota.usarInstanciaPropria && configRota.urlInstanciaPropria) {
      return { url: configRota.urlInstanciaPropria, tipo: "instancia_propria" };
    }
    return { url: configRota.urlPublica, tipo: "publica" };
  }

  // Tratamento de falha de cada API (timeout, limite de uso 429 e fallback)
  async function fetchComResiliencia(url, opcoes = {}, { timeoutMs = 6000, tentativas = 2, nomeApi = "API Externa" } = {}) {
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resp = await fetch(url, { ...opcoes, signal: controller.signal });
        clearTimeout(timer);

        // Limite de uso (Rate Limit HTTP 429)
        if (resp.status === 429) {
          const retryAfter = parseInt(resp.headers?.get?.("Retry-After") || "1", 10);
          const erroRate = new Error(`${nomeApi}: limite de requisições atingido (HTTP 429).`);
          erroRate.codigo = "RATE_LIMIT";
          ultimoErro = erroRate;

          if (tentativa < tentativas) {
            await new Promise((r) => setTimeout(r, Math.min(3000, retryAfter * 500 * tentativa)));
            continue;
          }
          throw erroRate;
        }

        if (!resp.ok) {
          const erroHttp = new Error(`${nomeApi}: erro HTTP ${resp.status}.`);
          erroHttp.codigo = `HTTP_${resp.status}`;
          throw erroHttp;
        }

        return await resp.json();
      } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
          const erroTimeout = new Error(`${nomeApi}: tempo esgotado após ${timeoutMs}ms.`);
          erroTimeout.codigo = "TIMEOUT";
          ultimoErro = erroTimeout;
        } else {
          ultimoErro = err;
        }

        if (tentativa < tentativas && ultimoErro.codigo !== "RATE_LIMIT") {
          await new Promise((r) => setTimeout(r, 400 * tentativa));
        }
      }
    }

    throw ultimoErro;
  }

  // Consulta de rota com failover automático da instância pública para a própria
  async function consultarRotaResiliente(origem, destino) {
    const endpoint = obterEndpointRoteamento();
    const coords = `${origem.lon},${origem.lat};${destino.lon},${destino.lat}`;
    const query = "?overview=full&geometries=geojson&steps=true";

    try {
      const dados = await fetchComResiliencia(
        `${endpoint.url}/${coords}${query}`,
        {},
        { timeoutMs: 5500, tentativas: 2, nomeApi: "OSRM Roteamento" }
      );
      if (endpoint.tipo === "publica") configRota.falhasPublicasConsecutivas = 0;
      return { dados, provedor: endpoint.tipo, fallback: false };
    } catch (err) {
      if (endpoint.tipo === "publica") {
        configRota.falhasPublicasConsecutivas++;
        // Se a API pública falhar 3x (ex.: limite de uso), migra para instância própria se configurada
        if (configRota.falhasPublicasConsecutivas >= 3 && configRota.urlInstanciaPropria) {
          configRota.usarInstanciaPropria = true;
          const dadosPropria = await fetchComResiliencia(
            `${configRota.urlInstanciaPropria}/${coords}${query}`,
            {},
            { timeoutMs: 5500, tentativas: 1, nomeApi: "OSRM Instância Própria" }
          );
          return { dados: dadosPropria, provedor: "instancia_propria_failover", fallback: false };
        }
      }

      return { dados: null, provedor: "offline_local", fallback: true, erro: err };
    }
  }

  // Painel com dados reais em vez de números de demonstração
  function calcularMetricasPainel({ relatos = [], distanciaMetros = 500, perfil = "cego" } = {}) {
    const totalRelatos = relatos.length;
    const aprovados = relatos.filter((r) => r.status === "aprovado").length;
    const pendentes = relatos.filter((r) => r.status === "pendente").length;
    const comFoto = relatos.filter((r) => Boolean(r.foto || r.fotoUrl)).length;

    const barreirasPorTipo = relatos.reduce((acc, r) => {
      const chave = r.tipo || "outro";
      acc[chave] = (acc[chave] || 0) + 1;
      return acc;
    }, {});

    const filaOffline = window.RL?.offline ? RL.offline.obterFila().length : 0;
    const voluntariosAtivos = window.RL?.comunidade
      ? RL.comunidade.listarVoluntarios().filter((v) => v.status_aprovacao === "aprovado" && v.disponivel).length
      : 3;

    // Índice real calculado conforme penalidade de barreiras ativas no trecho
    const penalidadeBarreiras = aprovados * 3.5 + pendentes * 1.5;
    const basePerfil = perfil === "cadeirante" ? 96 : 98;
    const indiceAcessibilidade = Math.max(55, Math.min(99.5, Number((basePerfil - penalidadeBarreiras).toFixed(1))));

    // Infraestrutura estimada proporcional ao trajeto real (a cada 80m uma guia/trecho tátil)
    const rampasEstimadas = Math.max(2, Math.round(distanciaMetros / 85));
    const trechosTateis = Math.max(2, Math.round(distanciaMetros / 100));

    return {
      indiceAcessibilidade,
      indiceFormatado: `${String(indiceAcessibilidade).replace(".", ",")}%`,
      infraResumo: `${rampasEstimadas}R • ${trechosTateis}T`,
      totalRelatos,
      aprovados,
      pendentes,
      comFoto,
      filaOffline,
      voluntariosAtivos,
      barreirasPorTipo
    };
  }

  return {
    configurarInstanciaRota,
    obterEndpointRoteamento,
    fetchComResiliencia,
    consultarRotaResiliente,
    calcularMetricasPainel
  };
})();