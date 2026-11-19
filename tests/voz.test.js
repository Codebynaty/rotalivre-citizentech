const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../js/geo.js");
require("../js/voz.js");

const { interpretarFrase, resolverLugarFalado } = global.window.RL.voz;

test("RL.voz - Bateria de 25 testes do interpretador e RL.geo", async (t) => {
  const casos = [
    { frase: "Perfil cego", esperado: { intencao: "PERFIL", perfil: "cego" } },
    { frase: "Ativar perfil cadeirante", esperado: { intencao: "PERFIL", perfil: "cadeirante" } },
    { frase: "Ir para Paulista", esperado: { intencao: "NAVEGAR_DESTINO", destinoTexto: "paulista" } },
    { frase: "Rota para Estação da Sé", esperado: { intencao: "NAVEGAR_DESTINO", destinoTexto: "estacao da se" } },
    { frase: "Levar para Consolação", esperado: { intencao: "NAVEGAR_DESTINO", destinoTexto: "consolacao" } },
    { frase: "Iniciar navegação", esperado: { intencao: "INICIAR_NAVEGACAO" } },
    { frase: "Pausar navegação", esperado: { intencao: "PAUSAR_NAVEGACAO" } },
    { frase: "Encerrar navegação", esperado: { intencao: "ENCERRAR_NAVEGACAO" } },
    { frase: "Próximo passo", esperado: { intencao: "PROXIMO_PASSO" } },
    { frase: "Reportar falta de rampa aqui", esperado: { intencao: "REPORTAR_BARREIRA", tipoBarreira: "sem_rampa", usarAqui: true } },
    { frase: "Calçada quebrada na esquina", esperado: { intencao: "REPORTAR_BARREIRA", tipoBarreira: "calcada_quebrada", usarAqui: false } },
    { frase: "Piso tátil interrompido aqui", esperado: { intencao: "REPORTAR_BARREIRA", tipoBarreira: "piso_tatil_interrompido", usarAqui: true } },
    { frase: "Veículo bloqueando a rampa", esperado: { intencao: "REPORTAR_BARREIRA", tipoBarreira: "veiculo_bloqueando", usarAqui: false } },
    { frase: "Obra sem sinalização aqui", esperado: { intencao: "REPORTAR_BARREIRA", tipoBarreira: "obra_sem_sinalizacao", usarAqui: true } },
    { frase: "Chamar voluntário", esperado: { intencao: "CHAMAR_VOLUNTARIO" } },
    { frase: "Alto contraste", esperado: { intencao: "ALTERNAR_CONTRASTE" } },
    { frase: "Aumentar fonte", esperado: { intencao: "ALTERNAR_FONTE" } },
    { frase: "Onde estou?", esperado: { intencao: "ONDE_ESTOU" } },
    { frase: "O que posso dizer?", esperado: { intencao: "AJUDA_COMANDOS" } },
    { frase: "Socorro!", esperado: { intencao: "SOS_PENDENTE" } },
    { frase: "Confirmar SOS", esperado: { intencao: "SOS_CONFIRMADO" } },
    { frase: "Emergência!", esperado: { intencao: "SOS_PENDENTE" } },
    { frase: "Cancelar", esperado: { intencao: "SOS_CANCELADO" } },
    { frase: "", esperado: { intencao: "DESCONHECIDO" } },
    { frase: "Qual a previsão do tempo?", esperado: { intencao: "DESCONHECIDO" } }
  ];

  for (let i = 0; i < casos.length; i++) {
    const { frase, esperado } = casos[i];
    await t.test(`Caso ${i + 1}: "${frase}"`, () => {
      const res = interpretarFrase(frase);
      for (const [k, v] of Object.entries(esperado)) {
        assert.equal(res[k], v);
      }
    });
  }

  await t.test("Caso 26: Resolve 'Paulista' via RL.geo", async () => {
    const lugar = await resolverLugarFalado("Paulista");
    assert.equal(lugar.nome, "Estação Trianon-Masp (Av. Paulista)");
    assert.equal(lugar.lat, -23.563210);
  });
});