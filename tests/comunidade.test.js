const test = require("node:test");
const assert = require("node:assert/strict");

const storageMock = {};
global.localStorage = {
  getItem: (k) => storageMock[k] || null,
  setItem: (k, v) => { storageMock[k] = String(v); },
  removeItem: (k) => { delete storageMock[k]; }
};
global.window = {};

require("../js/comunidade.js");
const { RL } = global.window;

test("RL.comunidade - Auth, voluntários, denúncias, pareamento e SOS", async (t) => {
  await t.test("Autenticação local cria sessão válida", async () => {
    const sessao = await RL.comunidade.autenticar("raissa@fiap.com.br", "123456", "login", { nome: "Raissa" });
    assert.equal(sessao.nome, "Raissa");
    assert.equal(RL.comunidade.obterSessaoAtual().email, "raissa@fiap.com.br");
  });

  await t.test("Voluntário novo nasce 'pendente' e só pareia após aprovação manual", () => {
    const novo = RL.comunidade.cadastrarVoluntarioPendente({
      nome: "Lucas Silva",
      regiao: "Trianon-Masp",
      lat: -23.563200,
      lon: -46.654240 // colado no cidadão
    });
    assert.equal(novo.status_aprovacao, "pendente");

    // Como ainda está pendente, não deve ser escolhido no pareamento
    const antes = RL.comunidade.parearVoluntarioMaisProximo({ lat: -23.563210, lon: -46.654250 });
    assert.notEqual(antes.voluntario.id, novo.id);

    // Após aprovação manual, ele passa a ser o mais próximo (~1m)
    RL.comunidade.aprovarVoluntarioManualmente(novo.id);
    const depois = RL.comunidade.parearVoluntarioMaisProximo({ lat: -23.563210, lon: -46.654250 });
    assert.equal(depois.voluntario.id, novo.id);
    assert.ok(depois.distanciaMetros < 10);
  });

  await t.test("Bloqueia usuário após atingir limite de 5 envios por hora", () => {
    const userId = "user-spam-test";
    for (let i = 0; i < 5; i++) {
      RL.comunidade.registrarEnvioUsuario(userId);
    }
    assert.throws(() => RL.comunidade.registrarEnvioUsuario(userId), /Limite de 5 relatos/);
  });

  await t.test("Denúncia de relato impede duplicidade e oculta após 3 denúncias", () => {
    const r1 = RL.comunidade.denunciarRelato("RL-FAKE-1", "Spam", "u1");
    assert.equal(r1.deveOcultar, false);

    assert.throws(() => RL.comunidade.denunciarRelato("RL-FAKE-1", "Spam", "u1"), /já denunciou/);

    RL.comunidade.denunciarRelato("RL-FAKE-1", "Falso", "u2");
    const r3 = RL.comunidade.denunciarRelato("RL-FAKE-1", "Inexistente", "u3");
    assert.equal(r3.totalDenuncias, 3);
    assert.equal(r3.deveOcultar, true);
  });

  await t.test("Gera links reais de WhatsApp e SMS com GPS no SOS", () => {
    const links = RL.comunidade.gerarLinksSOS(
      { lat: -23.563210, lon: -46.654250 },
      { nome: "Mariana", tel: "(11) 98765-4321" }
    );
    assert.ok(links.whatsappUrl.startsWith("https://wa.me/5511987654321?text="));
    assert.ok(links.smsUrl.startsWith("sms:11987654321?body="));
    assert.ok(links.mapsUrl.includes("-23.563210,-46.654250"));
  });
});