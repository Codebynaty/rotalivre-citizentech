const test = require("node:test");
const assert = require("node:assert/strict");

// Mock simples de localStorage e window para Node.js
const storageMock = {};
global.localStorage = {
  getItem: (k) => storageMock[k] || null,
  setItem: (k, v) => { storageMock[k] = String(v); },
  removeItem: (k) => { delete storageMock[k]; }
};
global.window = { addEventListener: () => {} };

require("../js/offline.js");
const { RL } = global.window;

test("RL.offline - Upload com limite de tamanho e fila de sincronização", async (t) => {
  await t.test("Aceita foto abaixo de 2 MB", async () => {
    const pequena = "data:image/jpeg;base64," + "A".repeat(1024);
    const res = await RL.offline.uploadFotoBarreira(pequena);
    assert.equal(res.storage, "local");
    assert.ok(res.tamanhoBytes < RL.offline.TAMANHO_MAXIMO_BYTES);
  });

  await t.test("Rejeita foto acima de 2 MB", async () => {
    const gigante = "data:image/jpeg;base64," + "A".repeat(3 * 1024 * 1024);
    await assert.rejects(() => RL.offline.uploadFotoBarreira(gigante), /excede o limite de 2 MB/);
  });

  await t.test("Enfileira relatos offline e sincroniza ao reconectar", async () => {
    global.navigator = { onLine: false };
    const qtd = RL.offline.enfileirarRelatoOffline({ id: "RL-OFF-1", tipo: "sem_rampa", descricao: "Teste offline" });
    assert.equal(qtd, 1);
    assert.equal(RL.offline.obterFila().length, 1);

    // Simula reconexão
    global.navigator = { onLine: true };
    const enviados = [];
    const resultado = await RL.offline.sincronizarFila(async (item) => {
      enviados.push(item.id);
    });

    assert.equal(resultado.enviados, 1);
    assert.equal(resultado.restantes, 0);
    assert.deepEqual(enviados, ["RL-OFF-1"]);
  });
});