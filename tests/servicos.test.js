const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../js/servicos.js");
const { RL } = global.window;

test("RL.servicos - Resiliência de API, instância própria e painel real", async (t) => {
  await t.test("Trata timeout de API externa corretamente", async () => {
    global.fetch = (_url, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    await assert.rejects(
      () => RL.servicos.fetchComResiliencia("https://api.teste/lenta", {}, { timeoutMs: 40, tentativas: 1, nomeApi: "TesteTimeout" }),
      /tempo esgotado/
    );
  });

  await t.test("Trata limite de uso (HTTP 429 Rate Limit)", async () => {
    global.fetch = async () => ({
      ok: false,
      status: 429,
      headers: { get: () => "1" }
    });

    await assert.rejects(
      () => RL.servicos.fetchComResiliencia("https://api.teste/limite", {}, { timeoutMs: 500, tentativas: 1, nomeApi: "Nominatim" }),
      /limite de requisições atingido \(HTTP 429\)/
    );
  });

  await t.test("Alterna entre rota pública e instância própria configurável", () => {
    assert.equal(RL.servicos.obterEndpointRoteamento().tipo, "publica");

    RL.servicos.configurarInstanciaRota("https://osrm.rotalivre.org.br/route/v1/foot", true);
    const atual = RL.servicos.obterEndpointRoteamento();
    assert.equal(atual.tipo, "instancia_propria");
    assert.equal(atual.url, "https://osrm.rotalivre.org.br/route/v1/foot");

    // Restaura padrão público
    RL.servicos.configurarInstanciaRota("", false);
  });

  await t.test("Calcula métricas reais do painel a partir dos relatos", () => {
    const relatosReais = [
      { id: "1", tipo: "sem_rampa", status: "aprovado", foto: "data:image/jpeg;base64,abc" },
      { id: "2", tipo: "calcada_quebrada", status: "pendente", foto: null }
    ];
    const metricas = RL.servicos.calcularMetricasPainel({
      relatos: relatosReais,
      distanciaMetros: 680,
      perfil: "cadeirante"
    });

    assert.equal(metricas.totalRelatos, 2);
    assert.equal(metricas.aprovados, 1);
    assert.equal(metricas.pendentes, 1);
    assert.equal(metricas.comFoto, 1);
    assert.equal(metricas.indiceAcessibilidade, 91);
    assert.equal(metricas.infraResumo, "8R • 7T");
  });
});