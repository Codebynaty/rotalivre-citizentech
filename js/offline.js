window.RL = window.RL || {};

RL.offline = (function () {
  const CHAVE_FILA = "rotalivre_fila_offline_v1";
  const TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024;

  // Configuração opcional do Supabase 
  const supabaseConfig = {
    url: window.SUPABASE_URL || "",
    anonKey: window.SUPABASE_ANON_KEY || "",
    bucket: "barreiras-fotos"
  };

  function configurarSupabase(url, anonKey, bucket = "barreiras-fotos") {
    supabaseConfig.url = url;
    supabaseConfig.anonKey = anonKey;
    supabaseConfig.bucket = bucket;
  }

  // Registra o Service Worker
  async function registrarServiceWorker() {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.register("./sw.js");
        return { registrado: true, scope: reg.scope };
      } catch (err) {
        return { registrado: false, erro: err.message };
      }
    }
    return { registrado: false, erro: "Service Worker não suportado" };
  }

  // Baixa tiles OSM da região (zoom 15 e 16) para uso offline
  function latLonParaTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y };
  }

  async function cachearRegiaoMapa(lat = -23.5605, lon = -46.6531, zooms = [15, 16]) {
    if (typeof caches === "undefined") return 0;
    const cache = await caches.open("rotalivre-mapas-v1");
    let baixados = 0;

    for (const z of zooms) {
      const centro = latLonParaTile(lat, lon, z);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const url = `https://a.tile.openstreetmap.org/${z}/${centro.x + dx}/${centro.y + dy}.png`;
          try {
            const jaExiste = await cache.match(url);
            if (!jaExiste) {
              const resp = await fetch(url);
              if (resp.ok) {
                await cache.put(url, resp);
                baixados++;
              }
            }
          } catch (e) {
            // Ignora falha individual se estiver offline
          }
        }
      }
    }
    return baixados;
  }

  // Converte DataURL Base64 para Blob
  function dataUrlParaBlob(dataUrl) {
    const [cabecalho, base64] = dataUrl.split(",");
    const mime = cabecalho.match(/:(.*?);/)?.[1] || "image/jpeg";
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) {
      bytes[i] = binario.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  // Upload da foto no Supabase Storage com validação de tamanho (<= 2 MB)
  async function uploadFotoBarreira(fotoDataUrl, nomeArquivo = `barreira_${Date.now()}.jpg`) {
    if (!fotoDataUrl) return { url: null, tamanhoBytes: 0 };

    // Calcula tamanho aproximado em bytes
    const base64Limpo = fotoDataUrl.includes(",") ? fotoDataUrl.split(",")[1] : fotoDataUrl;
    const tamanhoBytes = Math.ceil((base64Limpo.length * 3) / 4);

    if (tamanhoBytes > TAMANHO_MAXIMO_BYTES) {
      throw new Error(`A foto excede o limite de 2 MB (${(tamanhoBytes / (1024 * 1024)).toFixed(2)} MB).`);
    }

    // Se Supabase estiver configurado e online, envia para o Storage
    if (supabaseConfig.url && supabaseConfig.anonKey && (typeof navigator === "undefined" || navigator.onLine)) {
      const blob = dataUrlParaBlob(fotoDataUrl);
      const endpoint = `${supabaseConfig.url}/storage/v1/object/${supabaseConfig.bucket}/${nomeArquivo}`;

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          "Content-Type": blob.type,
          "x-upsert": "true"
        },
        body: blob
      });

      if (!resp.ok) {
        throw new Error(`Falha no upload para Supabase Storage (${resp.status})`);
      }

      const publicUrl = `${supabaseConfig.url}/storage/v1/object/public/${supabaseConfig.bucket}/${nomeArquivo}`;
      return { url: publicUrl, tamanhoBytes, storage: "supabase" };
    }

    // Fallback local (modo protótipo ou offline)
    return { url: fotoDataUrl, tamanhoBytes, storage: "local" };
  }

  // Fila de relatos criados offline, enviada ao reconectar
  function obterFila() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_FILA) || "[]");
    } catch (e) {
      return [];
    }
  }

  function salvarFila(fila) {
    localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
  }

  function enfileirarRelatoOffline(relato) {
    const fila = obterFila();
    const item = {
      ...relato,
      enfileiradoEm: new Date().toISOString(),
      sincronizado: false
    };
    fila.push(item);
    salvarFila(fila);
    return fila.length;
  }

  async function sincronizarFila(fnEnvioRemoto) {
    const fila = obterFila();
    if (!fila.length) return { enviados: 0, restantes: 0 };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { enviados: 0, restantes: fila.length, offline: true };
    }

    let enviados = 0;
    const pendentes = [];

    for (const relato of fila) {
      try {
        // Se houver foto base64 pendente, faz upload antes de enviar o relato
        if (relato.foto && relato.foto.startsWith("data:image")) {
          const up = await uploadFotoBarreira(relato.foto, `${relato.id || Date.now()}.jpg`);
          relato.fotoUrl = up.url;
        }

        if (typeof fnEnvioRemoto === "function") {
          await fnEnvioRemoto(relato);
        }
        enviados++;
      } catch (err) {
        pendentes.push(relato);
      }
    }

    salvarFila(pendentes);
    return { enviados, restantes: pendentes.length };
  }

  // Escuta automática de reconexão no navegador
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      sincronizarFila();
    });
  }

  return {
    TAMANHO_MAXIMO_BYTES,
    configurarSupabase,
    registrarServiceWorker,
    cachearRegiaoMapa,
    uploadFotoBarreira,
    obterFila,
    enfileirarRelatoOffline,
    sincronizarFila
  };
})();