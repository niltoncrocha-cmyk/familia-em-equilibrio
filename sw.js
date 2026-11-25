const CACHE='familia-equilibrio-v27';
const FILES=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

// Busca a versão nova primeiro (sempre revalidando com o servidor, sem usar o cache do navegador) e usa o cache só sem internet.
// Só trata arquivos do próprio app: respostas do Supabase (dados financeiros) não são guardadas.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(
    fetch(e.request,{cache:'no-cache'})
      .then(r=>{
        if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
        return r;
      })
      .catch(()=>caches.match(e.request).then(m=>m||caches.match('./index.html')))
  );
});
