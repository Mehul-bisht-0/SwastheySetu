const CACHE="swasthyasetu-provider-shell-v3";
const PUBLIC="swasthyasetu-provider-public-reference-v1";
const SHELL=["/","/manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener("activate",event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key!==PUBLIC).map(key=>caches.delete(key))))])));
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET"||request.headers.has("authorization"))return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const isPublicReference=url.pathname==="/diagnostics/reference";
  if(isPublicReference){event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(PUBLIC).then(cache=>cache.put(request,response.clone()));return response;}).catch(()=>caches.match(request).then(cached=>cached||Response.error())));return;}
  const isAsset=url.pathname==="/"||url.pathname==="/manifest.webmanifest"||url.pathname.startsWith("/assets/");
  if(!isAsset)return;
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok&&response.type==="basic")caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
    return response;
  })));
});
