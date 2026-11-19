const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../js/nav.js");
require("../js/simulador.js");

const { RL } = global.window;

const rotaExemplo = {
  destino: { lat: -23.557920, lon: -46.651840 },
  geometria_geojson: {
    type: "LineString",
    coordinates: [
      [-46.654250, -23.563210],
      [-46.653100, -23.560500],
      [-46.651840, -23.557920]
    ]
  },
  passos: [
    { ordem: 1, instrucao_voz: "Siga pela Av. Paulista", distancia_metros: 320, coordenada: { lat: -23.563210, lon: -46.654250 } },
    { ordem: 2, instrucao_voz: "Vire à direita na travessia", distancia_metros: 290, coordenada: { lat: -23.560500, lon: -46.653100 } }
  ]
};

test("RL.nav - Suavização GPS, eventos, desvio e simulador", async (t) => {
  await t.test("Descarta leitura GPS com precisão ruim (> 35m)", async () => {
    RL.nav.iniciar(rotaExemplo, [], false);
    const res = await RL.nav.processarPosicao({ lat: -23.563210, lon: -46.654250, accuracy: 85, timestamp: 1000 });
    assert.equal(res.ignorada, true);
    RL.nav.encerrar();
  });

  await t.test("Descarta salto impossível de GPS (teletransporte)", async () => {
    RL.nav.iniciar(rotaExemplo, [], false);
    await RL.nav.processarPosicao({ lat: -23.563210, lon: -46.654250, accuracy: 5, timestamp: 1000 });
    const salto = await RL.nav.processarPosicao({ lat: -23.500000, lon: -46.600000, accuracy: 5, timestamp: 2000 });
    assert.equal(salto.ignorada, true);
    RL.nav.encerrar();
  });

  await t.test("Emite evento 'barreira' ao se aproximar de obstáculo", async () => {
    let alertaRecebido = null;
    RL.nav.on("barreira", (dados) => { alertaRecebido = dados; });

    const barreiras = [{ id: "B1", lat: -23.560500, lon: -46.653100, descricao: "Buraco na calçada" }];
    RL.nav.iniciar(rotaExemplo, barreiras, false);

    await RL.nav.processarPosicao({ lat: -23.560550, lon: -46.653120, accuracy: 6, timestamp: 1000 });
    assert.ok(alertaRecebido);
    assert.equal(alertaRecebido.barreira.id, "B1");
    RL.nav.encerrar();
  });

  await t.test("Emite evento 'desvio' ao sair da rota por 2 leituras seguidas", async () => {
    let desvioRecebido = null;
    RL.nav.on("desvio", (dados) => { desvioRecebido = dados; });

    RL.nav.iniciar(rotaExemplo, [], false);
    // Dois pontos ~65m fora da rota
    await RL.nav.processarPosicao({ lat: -23.560500, lon: -46.652300, accuracy: 5, timestamp: 1000 });
    await RL.nav.processarPosicao({ lat: -23.560450, lon: -46.652280, accuracy: 5, timestamp: 3000 });

    assert.ok(desvioRecebido);
    assert.ok(desvioRecebido.distanciaForaMetros > 25);
    RL.nav.encerrar();
  });

  await t.test("Emite evento 'chegada' ao atingir o destino", async () => {
    let chegou = false;
    RL.nav.on("chegada", () => { chegou = true; });

    RL.nav.iniciar(rotaExemplo, [], false);
    await RL.nav.processarPosicao({ lat: -23.557920, lon: -46.651840, accuracy: 5, timestamp: 1000 });

    assert.equal(chegou, true);
    assert.equal(RL.nav.estaAtiva(), false);
  });

  await t.test("RL.simulador gera trilha interpolada corretamente", () => {
    const trilha = RL.simulador.gerarTrilha(rotaExemplo.geometria_geojson.coordinates, 3);
    assert.equal(trilha.length, 7);
  });
});