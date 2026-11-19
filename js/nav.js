window.RL = window.RL || {};

RL.nav = (function () {
  let watchId = null;
  let ativa = false;
  let pausada = false;
  let rotaAtual = null;
  let barreirasAtivas = [];
  let passoAtualIndex = 0;
  let barreirasAlertadas = new Set();

  // Estado para suavização de GPS
  let historicoGps = [];
  let leiturasForaRotaConsecutivas = 0;

  const CONFIG = {
    PRECISAO_MAXIMA_METROS: 35,     // descarta leituras com erro > 35m
    VELOCIDADE_MAXIMA_MS: 12,       // descarta teletransportes (> 43 km/h)
    JANELA_SUAVIZACAO: 3,           // média móvel das últimas 3 posições
    RAIO_PROXIMO_PASSO_METROS: 18,  // avança passo ao chegar a < 18m do waypoint
    RAIO_ALERTA_BARREIRA_METROS: 45,// avisa barreira a < 45m
    LIMITE_DESVIO_METROS: 25,       // dispara desvio se afastar > 25m da rota
    RAIO_CHEGADA_METROS: 15         // conclui rota ao chegar a < 15m do destino
  };

  //Sistema de eventos (passo, barreira, desvio, chegada, gps, erro)
  const ouvintes = {
    passo: [],
    barreira: [],
    desvio: [],
    chegada: [],
    gps: [],
    erro: []
  };

  function on(evento, fn) {
    if (ouvintes[evento] && typeof fn === "function") {
      ouvintes[evento].push(fn);
    }
  }

  function emitir(evento, payload) {
    (ouvintes[evento] || []).forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`Erro no listener ${evento}:`, e); }
    });
  }

  // Cálculo de distância Haversine em metros
  function haversineMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Distância mínima de um ponto P até um segmento AB (em metros)
  function distanciaPontoSegmentoMetros(p, a, b) {
    const x = p.lon, y = p.lat;
    const x1 = a[0], y1 = a[1];
    const x2 = b[0], y2 = b[1];

    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return haversineMetros(y, x, y1, x1);

    let t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));

    const projLon = x1 + t * dx;
    const projLat = y1 + t * dy;
    return haversineMetros(y, x, projLat, projLon);
  }

  function distanciaParaRotaMetros(pos, coordsGeoJson) {
    if (!coordsGeoJson || coordsGeoJson.length < 2) return 0;
    let menorDist = Infinity;
    for (let i = 0; i < coordsGeoJson.length - 1; i++) {
      const d = distanciaPontoSegmentoMetros(pos, coordsGeoJson[i], coordsGeoJson[i + 1]);
      if (d < menorDist) menorDist = d;
    }
    return menorDist;
  }

  // Suavização do GPS e descarte de leituras ruins
  function suavizarLeituraGPS(leituraBruta) {
    const { lat, lon, accuracy = 10, timestamp = Date.now() } = leituraBruta;

    if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
      return { valida: false, motivo: "Coordenadas inválidas" };
    }

    // 1. Descarta leitura com precisão muito baixa
    if (accuracy > CONFIG.PRECISAO_MAXIMA_METROS) {
      return { valida: false, motivo: `Precisão baixa (±${Math.round(accuracy)}m)` };
    }

    // 2. Descarta salto brusco (outlier de velocidade)
    if (historicoGps.length > 0) {
      const anterior = historicoGps[historicoGps.length - 1];
      const dtSegundos = Math.max(0.5, (timestamp - anterior.timestamp) / 1000);
      const distSalto = haversineMetros(anterior.lat, anterior.lon, lat, lon);
      const velocidade = distSalto / dtSegundos;

      if (velocidade > CONFIG.VELOCIDADE_MAXIMA_MS) {
        return { valida: false, motivo: `Salto de GPS descartado (${velocidade.toFixed(1)} m/s)` };
      }
    }

    historicoGps.push({ lat, lon, accuracy, timestamp });
    if (historicoGps.length > CONFIG.JANELA_SUAVIZACAO) {
      historicoGps.shift();
    }

    // 3. Média ponderada pelo inverso da imprecisão
    let somaPeso = 0;
    let somaLat = 0;
    let somaLon = 0;

    for (const item of historicoGps) {
      const peso = 1 / Math.max(1, item.accuracy);
      somaPeso += peso;
      somaLat += item.lat * peso;
      somaLon += item.lon * peso;
    }

    return {
      valida: true,
      lat: somaLat / somaPeso,
      lon: somaLon / somaPeso,
      accuracy,
      timestamp
    };
  }

  //Recálculo automático da rota em caso de desvio
  async function recalcularRota(posicaoAtual) {
    if (!rotaAtual || !rotaAtual.destino) return null;
    const dest = rotaAtual.destino;

    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${posicaoAtual.lon},${posicaoAtual.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson&steps=true`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Falha OSRM");
      const json = await resp.json();

      if (json.routes && json.routes.length > 0) {
        const route = json.routes[0];
        const novosPassos = (route.legs[0].steps || []).map((s, idx) => ({
          ordem: idx + 1,
          instrucao_voz: `Siga por ${Math.round(s.distance || 30)} metros na ${s.name || "via acessível"}.`,
          distancia_metros: Math.round(s.distance || 30),
          coordenada: s.maneuver ? { lon: s.maneuver.location[0], lat: s.maneuver.location[1] } : null
        }));

        rotaAtual = {
          ...rotaAtual,
          distancia_total_metros: Math.round(route.distance),
          tempo_estimado_minutos: Math.max(1, Math.round(route.duration / 60)),
          geometria_geojson: route.geometry,
          passos: novosPassos.length ? novosPassos : rotaAtual.passos
        };
        passoAtualIndex = 0;
        return rotaAtual;
      }
    } catch (e) {
      // Fallback offline: linha reta recalculada da posição atual ao destino
      rotaAtual = {
        ...rotaAtual,
        geometria_geojson: {
          type: "LineString",
          coordinates: [
            [posicaoAtual.lon, posicaoAtual.lat],
            [dest.lon, dest.lat]
          ]
        }
      };
      passoAtualIndex = 0;
      return rotaAtual;
    }
    return null;
  }

  // Processa uma posição (vinda do watchPosition real ou do RL.simulador)
  async function processarPosicao(leituraBruta) {
    if (!ativa || pausada || !rotaAtual) return null;

    const suavizada = suavizarLeituraGPS(leituraBruta);
    if (!suavizada.valida) {
      return { ignorada: true, motivo: suavizada.motivo };
    }

    emitir("gps", suavizada);

    const coords = rotaAtual.geometria_geojson?.coordinates || [];
    const destinoCoord = rotaAtual.destino || (coords.length ? { lon: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] } : null);

    // 1. Verifica chegada ao destino
    if (destinoCoord) {
      const distDestino = haversineMetros(suavizada.lat, suavizada.lon, destinoCoord.lat, destinoCoord.lon);
      if (distDestino <= CONFIG.RAIO_CHEGADA_METROS) {
        emitir("chegada", {
          posicao: suavizada,
          distanciaMetros: Math.round(distDestino),
          mensagem: "Você chegou ao destino acessível!"
        });
        encerrar();
        return { evento: "chegada", posicao: suavizada };
      }
    }

    // 2. Verifica proximidade de barreiras reportadas 
    for (const b of barreirasAtivas) {
      const distBarreira = haversineMetros(suavizada.lat, suavizada.lon, b.lat, b.lon);
      if (distBarreira <= CONFIG.RAIO_ALERTA_BARREIRA_METROS && !barreirasAlertadas.has(b.id)) {
        barreirasAlertadas.add(b.id);
        emitir("barreira", {
          barreira: b,
          distanciaMetros: Math.round(distBarreira),
          posicao: suavizada
        });
      }
    }

    // 3. Verifica desvio da rota e recalcula 
    const distRota = distanciaParaRotaMetros(suavizada, coords);
    if (distRota > CONFIG.LIMITE_DESVIO_METROS) {
      leiturasForaRotaConsecutivas++;
      if (leiturasForaRotaConsecutivas >= 2) {
        leiturasForaRotaConsecutivas = 0;
        const novaRota = await recalcularRota(suavizada);
        emitir("desvio", {
          distanciaForaMetros: Math.round(distRota),
          posicao: suavizada,
          novaRota
        });
        return { evento: "desvio", distanciaForaMetros: Math.round(distRota), novaRota };
      }
    } else {
      leiturasForaRotaConsecutivas = 0;
    }

    // 4. Verifica avanço de passo da navegação 
    const passos = rotaAtual.passos || [];
    if (passoAtualIndex < passos.length - 1) {
      const proximoPasso = passos[passoAtualIndex + 1];
      const alvoPasso = proximoPasso.coordenada || (coords[passoAtualIndex + 1] ? { lon: coords[passoAtualIndex + 1][0], lat: coords[passoAtualIndex + 1][1] } : null);

      if (alvoPasso) {
        const distPasso = haversineMetros(suavizada.lat, suavizada.lon, alvoPasso.lat, alvoPasso.lon);
        if (distPasso <= CONFIG.RAIO_PROXIMO_PASSO_METROS) {
          passoAtualIndex++;
          emitir("passo", {
            indice: passoAtualIndex,
            total: passos.length,
            passo: passos[passoAtualIndex],
            posicao: suavizada
          });
        }
      }
    }

    return { evento: "gps", posicao: suavizada, distanciaRotaMetros: Math.round(distRota) };
  }

  //Motor RL.nav com watchPosition
  function iniciar(rota, barreiras = [], usarGpsNativo = true) {
    rotaAtual = rota;
    barreirasAtivas = barreiras || [];
    passoAtualIndex = 0;
    historicoGps = [];
    leiturasForaRotaConsecutivas = 0;
    barreirasAlertadas.clear();
    ativa = true;
    pausada = false;

    if (rotaAtual?.passos?.length) {
      emitir("passo", {
        indice: 0,
        total: rotaAtual.passos.length,
        passo: rotaAtual.passos[0]
      });
    }

    if (usarGpsNativo && typeof navigator !== "undefined" && "geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          processarPosicao({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp
          });
        },
        (err) => {
          emitir("erro", { codigo: err.code, mensagem: err.message });
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
    }

    return true;
  }

  function pausar() {
    pausada = true;
  }

  function retomar() {
    pausada = false;
  }

  function encerrar() {
    ativa = false;
    pausada = false;
    if (watchId !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  return {
    CONFIG,
    on,
    iniciar,
    pausar,
    retomar,
    encerrar,
    processarPosicao,
    suavizarLeituraGPS,
    distanciaParaRotaMetros,
    haversineMetros,
    estaAtiva: () => ativa,
    estaPausada: () => pausada,
    obterEstado: () => ({ ativa, pausada, passoAtualIndex, historicoGps })
  };
})();