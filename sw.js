/* HEON ARCHIVE PWA v1.2.2. Only this site's public static files are cached.
 * Supabase, Tally and user credentials are NEVER intercepted or cached.
 */
const CACHE='heon-public-v1.2.2';
const SHELL=['./','./index.html','./styles.css','./app.js','./pdf-export.js','./ink.js',
  './study-account.js','./leaderboard-config.js','./data/catalog.js',
  './data/correction-ledger.js','./manifest.webmanifest','./assets/ui/heon-icon-192.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('heon-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  const url=new URL(request.url);
  if(/\/auth\/|\/rest\/|\/functions\/|\/storage\//.test(url.pathname))return;
  if(request.mode==='navigate'||/\.(js|css|json|webmanifest)$/.test(url.pathname)){
    event.respondWith(fetch(request).then(async response=>{
      if(response.ok){const cache=await caches.open(CACHE);cache.put(request,response.clone());}
      return response;
    }).catch(async()=>await caches.match(request,{ignoreSearch:true})||await caches.match('./index.html')));
  } else if(/\.(png|jpe?g|webp|svg)$/.test(url.pathname)){
    event.respondWith(caches.match(request).then(existing=>existing||fetch(request).then(response=>{
      if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
      return response;
    })));
  }
});
