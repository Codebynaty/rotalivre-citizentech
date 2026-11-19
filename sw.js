//Service Worker do RotaLivre
const CACHE_APP = "rotalivre-app-v1";
const CACHE_MAPAS = "rotalivre-mapas-v1";

const ARQUIVOS_ESTATICOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./js/geo.js",
  "./js/voz.js",
  "./js/nav.js",
  "./js/simulador.js",
  "./js/offline.js"
];

// Instalação: pré-carrega os arquivos principais do app
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(ARQUIVOS_ESTATICOS))
  );
  self.skipWaiting();
});

// Ativação: limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_APP && chave !== CACHE_MAPAS)
          .map((chave) => caches.delete(chave))
      )
    )
  );
  self.clients.claim();
});

// Interceptação de rede: Cache-First para App e Tiles de Mapa da região
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1. Tiles de mapa (OpenStreetMap / Esri / Leaflet CDN)
  const ehTileMapa =
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("arcgisonline.com") ||
    url.hostname.includes("cdn.jsdelivr.net");

  if (ehTileMapa) {
    event.respondWith(
      caches.open(CACHE_MAPAS).then(async (cache) => {
        const emCache = await cache.match(request);
        if (emCache) return emCache;

        try {
          const respostaRede = await fetch(request);
          if (respostaRede && respostaRede.ok) {
            cache.put(request, respostaRede.clone());
          }
          return respostaRede;
        } catch (err) {
          return emCache || new Response("", { status: 503, statusText: "Mapa offline indisponível" });
        }
      })
    );
    return;
  }

  // 2. Arquivos do próprio aplicativo (Cache-First com atualização em segundo plano)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((emCache) => {
        const buscaRede = fetch(request)
          .then((respostaRede) => {
            if (respostaRede && respostaRede.ok) {
              caches.open(CACHE_APP).then((cache) => cache.put(request, respostaRede.clone()));
            }
            return respostaRede;
          })
          .catch(() => emCache);

        return emCache || buscaRede;
      })
    );
  }
});