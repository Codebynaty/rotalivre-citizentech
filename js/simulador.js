window.RL = window.RL || {};

RL.simulador = (function () {
  let timer = null;
  let pontosSimulacao = [];
  let indice = 0;

  // Interpola N pontos intermediários entre cada vértice da rota GeoJSON
  function gerarTrilha(coordsGeoJson, subdivisoes = 4) {
    const trilha = [];
    for (let i = 0; i < coordsGeoJson.length - 1; i++) {
      const [lon1, lat1] = coordsGeoJson[i];
      const [lon2, lat2] = coordsGeoJson[i + 1];

      for (let s = 0; s < subdivisoes; s++) {
        const t = s / subdivisoes;
        trilha.push({
          lat: lat1 + (lat2 - lat1) * t,
          lon: lon1 + (lon2 - lon1) * t,
          accuracy: 6
        });
      }
    }
    const ultimo = coordsGeoJson[coordsGeoJson.length - 1];
    if (ultimo) {
      trilha.push({ lat: ultimo[1], lon: ultimo[0], accuracy: 5 });
    }
    return trilha;
  }

  function iniciarPercurso(rota, intervaloMs = 1200) {
    parar();
    if (!window.RL || !RL.nav) throw new Error("Módulo RL.nav não carregado.");

    const coords = rota?.geometria_geojson?.coordinates || [
      [-46.654250, -23.563210],
      [-46.653100, -23.560500],
      [-46.651840, -23.557920]
    ];

    pontosSimulacao = gerarTrilha(coords, 4);
    indice = 0;

    RL.nav.iniciar(rota, [], false);

    timer = setInterval(() => {
      if (indice >= pontosSimulacao.length) {
        parar();
        return;
      }
      const p = pontosSimulacao[indice++];
      RL.nav.processarPosicao({ ...p, timestamp: Date.now() });
    }, intervaloMs);

    return pontosSimulacao.length;
  }

  // Simula o usuário saindo ~45m da rota por 2 leituras seguidas
  async function simularDesvio(latBase = -23.560500, lonBase = -46.653100) {
    if (!window.RL || !RL.nav) return;
    await RL.nav.processarPosicao({ lat: latBase + 0.00045, lon: lonBase + 0.00045, accuracy: 8, timestamp: Date.now() });
    return await RL.nav.processarPosicao({ lat: latBase + 0.00048, lon: lonBase + 0.00048, accuracy: 8, timestamp: Date.now() + 1500 });
  }

  // Simula uma leitura de GPS ruim (precisão de 90m) para testar o descarte
  async function simularLeituraRuim(latBase = -23.560500, lonBase = -46.653100) {
    if (!window.RL || !RL.nav) return;
    return await RL.nav.processarPosicao({ lat: latBase, lon: lonBase, accuracy: 90, timestamp: Date.now() });
  }

  function parar() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    gerarTrilha,
    iniciarPercurso,
    simularDesvio,
    simularLeituraRuim,
    parar
  };
})();