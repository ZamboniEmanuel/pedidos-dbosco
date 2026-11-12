/* Pedidos Dbosco – cache do app para funcionar sem sinal */
var CACHE='pedidos-dbosco-v2026-11-12c';
var ARQUIVOS=['./','./index.html','./app.js','./fotos.js','./manifest.json','./icone.svg','./icone-192.png','./icone-512.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ARQUIVOS)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  var u=new URL(e.request.url);
  if(u.origin!==location.origin||e.request.method!=='GET')return; // chamadas ao Google passam direto
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(function(r){
    var rede=fetch(e.request).then(function(resp){if(resp&&resp.ok){var cp=resp.clone();caches.open(CACHE).then(function(c){c.put(e.request,cp)})}return resp}).catch(function(){return r});
    return r||rede}))});
