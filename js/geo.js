// js/geo.js
const RL = (typeof window !== 'undefined' ? window.RL : global.RL) || {};
if (typeof window !== 'undefined') window.RL = RL;
if (typeof global !== 'undefined') global.RL = RL;

RL.geo = (function () {
  const LUGARES_CONHECIDOS = {
    "paulista": { nome: "Estação Trianon-Masp (Av. Paulista)", lat: -23.563210, lon: -46.654250 },
    "avenida paulista": { nome: "Estação Trianon-Masp (Av. Paulista)", lat: -23.563210, lon: -46.654250 },
    "trianon": { nome: "Estação Trianon-Masp", lat: -23.563210, lon: -46.654250 },
    "masp": { nome: "Estação Trianon-Masp", lat: -23.563210, lon: -46.654250 },
    "se": { nome: "Estação Metrô Sé", lat: -23.550309, lon: -46.634200 },
    "praca da se": { nome: "Estação Metrô Sé", lat: -23.550309, lon: -46.634200 },
    "estacao da se": { nome: "Estação Metrô Sé", lat: -23.550309, lon: -46.634200 },
    "consolacao": { nome: "Estação Consolação", lat: -23.557850, lon: -46.660620 },
    "parque trianon": { nome: "Parque Trianon", lat: -23.561710, lon: -46.655980 },
    "hospital": { nome: "Hospital / Posto Apoio Paulista", lat: -23.557920, lon: -46.651840 },
    "subprefeitura": { nome: "Subprefeitura / Poupatempo Sé", lat: -23.548120, lon: -46.631950 }
  };

  function normalizar(texto) {
    return (texto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function obterPosicaoAtual() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        resolve({ nome: "Estação Trianon-Masp (padrão)", lat: -23.563210, lon: -46.654250, fallback: true });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            nome: "Minha localização atual",
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            precisao: pos.coords.accuracy
          });
        },
        (err) => reject(new Error("Erro ao obter GPS: " + err.message)),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    });
  }

  async function buscarEndereco(textoLugar) {
    const chave = normalizar(textoLugar);
    if (!chave) throw new Error("Endereço vazio.");

    if (LUGARES_CONHECIDOS[chave]) return LUGARES_CONHECIDOS[chave];

    const parcial = Object.keys(LUGARES_CONHECIDOS).find((k) => chave.includes(k) || k.includes(chave));
    if (parcial) return LUGARES_CONHECIDOS[parcial];

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(textoLugar + ", São Paulo, Brasil")}`;
    const resp = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });

    if (!resp.ok) throw new Error("Falha ao consultar geocodificação.");
    const dados = await resp.json();
    if (!dados || dados.length === 0) throw new Error(`Lugar não encontrado: "${textoLugar}"`);

    return {
      nome: dados[0].display_name.split(",")[0],
      lat: parseFloat(dados[0].lat),
      lon: parseFloat(dados[0].lon)
    };
  }

  return { LUGARES_CONHECIDOS, obterPosicaoAtual, buscarEndereco };
})();