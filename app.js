/* Pedidos Dbosco – app do representante (funciona sem sinal; envia quando a internet volta) */
(function(){
'use strict';
var API='https://script.google.com/macros/s/AKfycbwXihSxdsQyjWX4aZ0ahFw9KHseiktYK9yHfJVUags-bjCFaTw1FrmeTPW4kmerBayt-A/exec';
var VERSAO='2026-11-12d';
var K={cred:'db.cred',dados:'db.dados',fila:'db.fila',novos:'db.clientesNovos',rasc:'db.rascunho'};
var $=function(s){return document.querySelector(s)};
function ler(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function grava(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
var brl=function(v){return (Math.round(v*100)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var norm=function(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()};
var tc=function(s){return String(s||'').toLowerCase().split(' ').map(function(w){if(/\d/.test(w)||w==='pdcb')return w.toUpperCase();if(['de','do','da','c/','com','e','em','s/','p/'].indexOf(w)>=0)return w;return w.charAt(0).toUpperCase()+w.slice(1)}).join(' ').replace(/^./,function(c){return c.toUpperCase()})};

var S={tela:'carregando',cred:ler(K.cred,null),dados:ler(K.dados,null),fila:ler(K.fila,[]),novos:ler(K.novos,[]),
  cli:null,ind:null,nivel:'VAREJO',qty:{},q:'',obs:'',busca:'',ultimo:null,sincronizando:false,msg:''};

/* ---------- rede ---------- */
function online(){return navigator.onLine!==false}
function apiGet(params){var u=API+'?'+Object.keys(params).map(function(k){return k+'='+encodeURIComponent(params[k])}).join('&');
  return fetch(u,{method:'GET',redirect:'follow'}).then(function(r){return r.json()})}
function apiPost(body){return fetch(API,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}).then(function(r){return r.json()})}

function carregaDados(silencioso){
  if(!S.cred||!online())return Promise.resolve(false);
  return apiGet({acao:'dados',rep:S.cred.rep,k:S.cred.k}).then(function(r){
    if(!r.ok){if(/Chave/.test(r.erro||'')){S.cred=null;grava(K.cred,null);S.dados=null;ir('entrar',r.erro)}else if(!silencioso)S.msg=r.erro;return false}
    S.dados=r.dados;grava(K.dados,S.dados);
    // clientes novos que já subiram deixam a lista local
    var cn=S.dados.clientes.map(function(c){return c.cnpj});S.novos=S.novos.filter(function(n){return cn.indexOf(n.cnpj)<0});grava(K.novos,S.novos);
    return true}).catch(function(){return false})}

function sincroniza(){
  if(S.sincronizando||!online()||!S.cred)return Promise.resolve();
  var pend=S.fila.filter(function(f){return f.status==='pendente'});
  if(!pend.length)return Promise.resolve();
  S.sincronizando=true;strip();
  var seq=Promise.resolve();
  pend.forEach(function(f){seq=seq.then(function(){
    return apiPost({acao:'pedido',rep:S.cred.rep,k:S.cred.k,pedido:f.pedido}).then(function(r){
      f.tentativas=(f.tentativas||0)+1;
      if(r.ok){f.status='enviado';f.enviadoEm=agora();f.aviso=r.aviso||'';if(r.total)f.pedido.totalServidor=r.total}
      else{f.status='erro';f.erro=r.erro||'Erro desconhecido'}
    }).catch(function(e){f.tentativas=(f.tentativas||0)+1;f.ultimoErro='sem resposta'})
      .then(function(){grava(K.fila,S.fila)})})});
  return seq.then(function(){S.sincronizando=false;strip();if(S.tela==='pedidos'||S.tela==='enviado')tela()})}
function agora(){var d=new Date();var p=function(n){return (n<10?'0':'')+n};return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())}
function novoNum(){var d=new Date();var p=function(n){return (n<10?'0':'')+n};return 'P'+String(d.getFullYear()).slice(2)+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds())+'-'+Math.random().toString(36).slice(2,5).toUpperCase()}

/* ---------- dados derivados ---------- */
function industria(n){return (S.dados.industrias||[]).filter(function(i){return i.nome===n})[0]||{nome:n,minimo:0,comissaoRep:0,niveis:'ÚNICO'}}
function temNiveis(n){return /VAREJO/.test(industria(n).niveis)}
function produtosDaInd(){var nv=temNiveis(S.ind)?S.nivel:null;
  return S.dados.produtos.filter(function(p){return p.ind===S.ind&&(p.nivel==='ÚNICO'||!nv||p.nivel===nv)})}
function clientes(){return S.novos.concat(S.dados.clientes||[])}
function totais(){var cx=0,t=0;var prods=produtosDaInd();prods.forEach(function(p){var q=S.qty[p.chave]||0;if(q){cx+=q;t+=q*p.preco}});
  t=Math.round(t*100)/100;var ind=industria(S.ind);return {cx:cx,t:t,com:Math.round(t*ind.comissaoRep*100)/100,minimo:ind.minimo,abaixo:ind.minimo>0&&cx>0&&t<ind.minimo}}
function pendentes(){return S.fila.filter(function(f){return f.status==='pendente'}).length}

/* ---------- telas ---------- */
var PAI={novo:'clientes',industria:'clientes',catalogo:'industria',conferir:'catalogo',pedidos:'clientes',enviado:'clientes'};
function guarda(){try{if(!(history.state&&history.state.g))history.pushState({g:1},'')}catch(e){}}
function ir(t,msg){S.tela=t;S.msg=msg||'';if(PAI[t])guarda();tela();window.scrollTo(0,0)}
var PASSOS={clientes:1,novo:1,industria:2,catalogo:3,conferir:4};
function erros(){return S.fila.filter(function(f){return f.status==='erro'}).length}
function nomeCli(c){var f=String(c.fantasia||'');return tc(/[A-Za-zÀ-ú]{3}/.test(f)?f:c.nome)}
function caixas(n){return n+(n===1?' caixa':' caixas')}
function salvaR(){grava(K.rasc,S.cli&&S.ind&&Object.keys(S.qty).length?{cli:S.cli.cnpj,ind:S.ind,nivel:S.nivel,qty:S.qty,obs:S.obs}:null)}
function limpa(){S.cli=null;S.ind=null;S.qty={};S.obs='';S.q='';S.busca='';grava(K.rasc,null)}
function pendBox(){var el=$('#pend');if(!el)return;var p=pendentes(),e=erros(),h='';
  if(p)h+='<button class="pend" data-go="pedidos"><b>⏳ '+p+(p>1?' pedidos aguardando envio':' pedido aguardando envio')+'</b>'+
    '<span>'+(S.sincronizando?'Enviando agora… deixe o app aberto.':online()?'Com sinal: deixe o app aberto uns segundos que ele envia.':'Está guardado no celular. Quando tiver sinal, abra o app e deixe aberto uns segundos.')+'</span></button>';
  if(e)h+='<button class="pend err" data-go="pedidos"><b>! '+e+(e>1?' pedidos não foram enviados':' pedido não foi enviado')+'</b><span>Toque aqui para ver e tentar de novo.</span></button>';
  el.innerHTML=h}
function strip(){pendBox();var el=$('#sig');
  if(el)el.innerHTML=S.sincronizando?'<span class="spin"></span>':online()?'':'<span class="pill off">Sem sinal</span>';
  var b=$('#navb');if(b){var n=pendentes()+erros();b.textContent=n||'';b.hidden=!n}}
function topo(titulo,voltar,ctx){var n=PASSOS[S.tela];
  return '<div class="head"><div class="row">'+(voltar?'<button class="back" data-go="'+voltar+'">‹ Voltar</button>':'')+'<div class="ctx">'+(ctx||'')+'</div><span id="sig"></span></div></div>'+
   (n?'<div class="step">Passo '+n+' de 4</div>':'')+'<h1 class="h1">'+titulo+'</h1>'}
var ICO={novo:'<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  lista:'<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/></svg>'};
function nav(){return '<nav class="nav"><div class="in"><button data-go="clientes" class="'+(S.tela==='clientes'?'on':'')+'">'+ICO.novo+'<span>Fazer pedido</span></button>'+
  '<button data-go="pedidos" class="'+(S.tela==='pedidos'?'on':'')+'">'+ICO.lista+'<span>Meus pedidos</span><i id="navb" hidden></i></button></div></nav>'}
function folha(h){var d=document.createElement('div');d.className='sheet';d.innerHTML='<div class="box">'+h+'</div>';document.body.appendChild(d);
  d.addEventListener('click',function(e){if(e.target===d)d.remove()});return d}
function tela(){var a=$('#app');
  var f={carregando:carregando,entrar:entrar,clientes:telaClientes,novo:telaNovo,industria:telaIndustria,catalogo:telaCatalogo,conferir:telaConferir,enviado:telaEnviado,pedidos:telaPedidos}[S.tela];
  a.className='wrap'+(S.tela==='clientes'||S.tela==='catalogo'?' wide':'');
  f(a);strip()}

function carregando(a){a.innerHTML='<div class="login"><div class="logo">D</div><h1>Pedidos Dbosco</h1><p><span class="spin"></span> Carregando…</p></div>'}
function entrar(a){
  a.innerHTML='<div class="login"><div class="logo">D</div><h1>Pedidos Dbosco</h1><p>Digite a chave de acesso que você recebeu.</p>'+
   (S.msg?'<div class="erro">'+esc(S.msg)+'</div>':'')+
   '<label class="field" for="chave">Chave de acesso<input id="chave" autocomplete="off" autocapitalize="characters" placeholder="REP01-XXXXXXXX"></label>'+
   '<div style="margin-top:20px"><button class="btn" id="entrarBtn">Entrar</button></div><p class="note">Precisa de internet só nesta primeira vez.</p></div>';
  $('#entrarBtn').onclick=function(){var v=$('#chave').value.trim().toUpperCase().replace(/\s/g,'');var m=v.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
    if(!m){S.msg='Chave no formato REP01-XXXXXXXX.';tela();return}
    if(!online()){S.msg='Sem internet. Para entrar pela primeira vez precisa de sinal.';tela();return}
    S.cred={rep:m[1],k:m[2]};$('#entrarBtn').disabled=true;$('#entrarBtn').innerHTML='<span class="spin"></span> Entrando…';
    carregaDados(false).then(function(ok){if(ok){grava(K.cred,S.cred);ir('clientes')}else{S.cred=null;if(!S.msg)S.msg='Não consegui entrar. Confira a chave e o sinal.';tela()}})}}

function rascunho(){var r=ler(K.rasc,null);if(!r||!r.qty)return null;var c=clientes().filter(function(x){return x.cnpj===r.cli})[0];if(!c)return null;
  var ok={};var n=0;S.dados.produtos.forEach(function(p){if(p.ind===r.ind&&r.qty[p.chave]){ok[p.chave]=r.qty[p.chave];n+=r.qty[p.chave]}});
  return n?{c:c,ind:r.ind,nivel:r.nivel,qty:ok,obs:r.obs||'',n:n}:null}
function telaClientes(a){var r=rascunho();
  a.innerHTML=topo('Para qual cliente é o pedido?',null)+'<div id="pend"></div>'+(S.msg?'<div class="aviso">'+esc(S.msg)+'</div>':'')+
   (r?'<div class="card rasc"><span class="t">Pedido começado</span><span class="s">'+esc(nomeCli(r.c))+' · '+esc(r.ind)+' · '+caixas(r.n)+'</span>'+
     '<div class="duo"><button class="btn" id="contR">Continuar</button><button class="btn alt" id="apagaR">Apagar</button></div></div>':'')+
   '<input class="search" id="busca" placeholder="Buscar por nome ou cidade" value="'+esc(S.busca)+'" autocomplete="off" aria-label="Buscar cliente">'+
   '<button class="card add" data-go="novo" style="margin-top:14px">+ Cadastrar cliente novo</button><div id="lista" class="grid2"></div>'+nav();
  var lista=function(){var q=norm(S.busca),qd=S.busca.replace(/\D/g,'');
    var cs=clientes().filter(function(c){return norm(c.nome+' '+c.fantasia+' '+c.cidade).indexOf(q)>=0||(qd.length>3&&String(c.cnpj).replace(/\D/g,'').indexOf(qd)>=0)});
    $('#lista').innerHTML=cs.length?cs.map(function(c){var ja=[c.limeira&&'Limeira',c.bel&&'Bel Lar',c.sanilar&&'Sanilar'].filter(Boolean);
      return '<button class="card" data-cli="'+esc(c.cnpj)+'"><span class="t">'+esc(nomeCli(c))+'</span><span class="s">'+esc(tc(c.cidade))+(c.uf?' / '+esc(c.uf):'')+(c.local?' · novo, ainda não enviado':'')+'</span>'+
      (ja.length?'<span class="s ja">✓ Já compra '+esc(ja.length>1?ja.slice(0,-1).join(', ')+' e '+ja[ja.length-1]:ja[0])+'</span>':'')+'</button>'}).join('')
     :'<p class="note">'+(clientes().length?'Nenhum cliente encontrado.':'Ainda não há clientes na lista.')+' Toque em “Cadastrar cliente novo”.</p>'};
  lista();$('#busca').addEventListener('input',function(e){S.busca=e.target.value;lista()});
  if(r){$('#contR').onclick=function(){S.cli=r.c;S.ind=r.ind;S.nivel=r.nivel;S.qty=r.qty;S.obs=r.obs;S.q='';ir('catalogo')};
    $('#apagaR').onclick=function(){var d=folha('<h3>Apagar o pedido começado?</h3><p>'+esc(nomeCli(r.c))+' · '+esc(r.ind)+' · '+caixas(r.n)+'</p><button class="btn" id="simA">Sim, apagar</button><button class="btn alt" id="naoA">Não, deixar</button>');
      $('#naoA').onclick=function(){d.remove()};$('#simA').onclick=function(){d.remove();S.qty={};grava(K.rasc,null);tela()}}}}

function telaNovo(a){
  var campo=function(id,rot,extra){return '<label class="field" for="'+id+'">'+rot+'<input id="'+id+'" autocomplete="off"'+(extra||'')+'></label>'};
  a.innerHTML=topo('Cliente novo','clientes')+
   '<p class="lead">Digite o CNPJ. O app busca os outros dados na Receita.</p>'+
   campo('n3','CNPJ',' inputmode="numeric" placeholder="Só os números"')+
   '<div style="margin-top:12px"><button class="btn" id="buscaN">Buscar dados pelo CNPJ</button></div><div id="msgN"></div>'+
   '<div id="maoN" style="margin-top:10px;text-align:center"><button class="linkbtn" id="aMao">Preencher à mão, sem buscar</button></div>'+
   '<div id="restoN" hidden>'+
   campo('n1','Razão social')+campo('n6','Nome fantasia (se tiver)')+
   campo('n7','Endereço (rua, número, complemento)')+campo('n8','Bairro')+
   campo('n9','CEP',' inputmode="numeric"')+campo('n2','Cidade')+
   campo('n5','Estado (UF)',' maxlength="2" autocapitalize="characters" value="ES" style="width:120px"')+
   campo('n4','Telefone',' inputmode="tel"')+campo('n10','Inscrição estadual (ou ISENTO)')+
   '<div class="field">Que tipo de cliente é?</div><div class="seg" id="segN" style="margin-top:6px"><button data-nv="VAREJO" class="on">Supermercado (varejo)</button><button data-nv="ATACADO">Atacadista</button></div>'+
   '<p class="note" id="faltaN" style="margin-top:20px"></p><div style="margin-top:8px"><button class="btn" id="salvaN" disabled>Salvar e continuar</button></div></div>';
  var nv='VAREJO';var v=function(i){return $('#'+i).value.trim()};
  var abre=function(){$('#restoN').hidden=false;$('#maoN').hidden=true;$('#buscaN').className='btn alt'};
  var obrig=[['n3','CNPJ'],['n1','razão social'],['n7','endereço'],['n8','bairro'],['n9','CEP'],['n2','cidade'],['n5','UF']];
  var ok=function(){var f=obrig.filter(function(x){return x[0]==='n3'?v('n3').replace(/\D/g,'').length!==14:!v(x[0])}).map(function(x){return x[1]});
    $('#salvaN').disabled=f.length>0;
    $('#faltaN').textContent=f.length?'Falta preencher: '+f.join(', ')+'.':(v('n10')?'Tudo certo.':'Tudo certo. Se souber, preencha a inscrição estadual.')};
  ['n1','n2','n3','n5','n7','n8','n9','n10'].forEach(function(i){$('#'+i).addEventListener('input',ok)});ok();
  $('#aMao').onclick=abre;
  $('#buscaN').onclick=function(){var d=v('n3').replace(/\D/g,''),m=$('#msgN');
    if(d.length!==14){m.innerHTML='<div class="erro">Digite os 14 números do CNPJ.</div>';return}
    if(!navigator.onLine){m.innerHTML='<div class="aviso">Sem sinal: preencha os campos à mão.</div>';abre();return}
    m.innerHTML='<p class="note"><span class="spin"></span> Buscando na Receita…</p>';
    apiGet({acao:'cnpj',rep:S.cred.rep,k:S.cred.k,cnpj:d}).then(function(j){if(!j.ok)throw new Error(j.erro||'Não deu para buscar agora.');
      var set=function(id,x){if(x&&String(x).trim())$('#'+id).value=String(x).trim()};
      set('n1',j.razao);set('n6',j.fantasia);set('n7',j.endereco);set('n8',j.bairro);set('n9',j.cep);set('n2',j.cidade);set('n5',j.uf);set('n4',j.telefone);
      m.innerHTML='<div class="aviso" style="background:var(--ok-bg);color:var(--ok)">Dados da Receita preenchidos. Confira e complete a inscrição estadual.</div>';abre();ok()
    }).catch(function(e){m.innerHTML='<div class="erro">'+esc(e instanceof TypeError?'Não deu para buscar agora.':e.message)+' Preencha à mão.</div>';abre()})};
  $('#segN').addEventListener('click',function(e){var b=e.target.closest('[data-nv]');if(!b)return;nv=b.dataset.nv;document.querySelectorAll('#segN button').forEach(function(x){x.classList.toggle('on',x.dataset.nv===nv)})});
  $('#salvaN').onclick=function(){var cnpj=v('n3').replace(/\D/g,'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
    var ja=clientes().filter(function(x){return x.cnpj===cnpj})[0];
    if(ja){S.cli=ja;S.qty={};S.obs='';ir('industria');return}
    var c={cnpj:cnpj,nome:v('n1'),fantasia:v('n6'),cidade:v('n2'),uf:v('n5').toUpperCase(),telefone:v('n4'),endereco:v('n7'),bairro:v('n8'),cep:v('n9'),ie:v('n10'),nivel:nv,limeira:false,bel:false,sanilar:false,local:true};
    S.novos.unshift(c);grava(K.novos,S.novos);S.cli=c;S.qty={};S.obs='';ir('industria')}}

function telaIndustria(a){var c=S.cli;
  a.innerHTML=topo('De qual indústria?','clientes','<b>'+esc(nomeCli(c))+'</b>')+
   (S.dados.industrias||[]).map(function(i){var compra={Limeira:c.limeira,'Bel Lar':c.bel,Sanilar:c.sanilar}[i.nome];
     return '<button class="card ind" data-ind="'+esc(i.nome)+'"><span><span class="t">'+esc(i.nome)+'</span><span class="s'+(compra?' ja':'')+'">'+(compra?'✓ Este cliente já compra':'Ainda não compra')+'</span>'+
      (i.minimo?'<span class="s">Pedido mínimo '+brl(i.minimo)+'</span>':'')+'</span><span class="seta">›</span></button>'}).join('')+
   '<p class="note">Os preços entram sozinhos, da tabela de cada indústria.</p>'}

function pic(p){var f=p.foto&&window.FOTOS&&window.FOTOS[p.foto];return f?'<button class="pic" data-zoom aria-label="Ver a foto maior"><img src="'+f+'" alt=""></button>':'<div class="pic">'+esc(p.desc.split(' ').slice(0,2).map(function(w){return w[0]}).join('').toUpperCase())+'</div>'}
function nomeP(p){return tc(p.desc.replace(/\s*\(PREÇO A CONFIRMAR\)/i,''))}
function subT(q,p){return q?caixas(q)+' = <b>'+brl(q*p.preco)+'</b>':''}
function linha(p){var q=S.qty[p.chave]||0;var conf=/CONFIRMAR/i.test(p.desc);
  return '<div class="prod '+(q?'has':'')+'" data-ch="'+esc(p.chave)+'">'+pic(p)+
   '<div><div class="pn">'+esc(nomeP(p))+'</div><div class="pp">'+brl(p.preco)+' <span>a caixa</span></div><div class="pm">'+(p.un?'Caixa com '+esc(p.un)+' un · ':'')+'cód. '+esc(p.cod)+'</div>'+(conf?'<span class="conf">Preço a confirmar</span>':'')+'</div>'+
   '<div class="qty"><button data-m="-1" aria-label="Menos uma caixa"'+(q?'':' disabled')+'>−</button><input inputmode="numeric" value="'+q+'" aria-label="Quantas caixas" data-q><button data-m="1" aria-label="Mais uma caixa">+</button><span class="ql">caixas</span></div>'+
   '<div class="sub">'+subT(q,p)+'</div></div>'}
function telaCatalogo(a){var c=S.cli,bel=temNiveis(S.ind);
  a.innerHTML=topo('Escolha os produtos','industria','<b>'+esc(nomeCli(c))+'</b> · '+esc(S.ind))+
   (bel?'<div class="seg" id="seg"><button data-nv="VAREJO" class="'+(S.nivel==='VAREJO'?'on':'')+'">Preço varejo</button><button data-nv="ATACADO" class="'+(S.nivel==='ATACADO'?'on':'')+'">Preço atacado</button></div>':'')+
   '<input class="search" id="busca" placeholder="Buscar produto" value="'+esc(S.q)+'" autocomplete="off" aria-label="Buscar produto"><div id="prods" class="grid2"></div>'+
   '<div class="bar"><div class="in"><div id="minmsg"></div><div class="sum"><div><b id="tt"></b> <span id="cx"></span></div><div class="com" id="cm"></div></div><button class="btn" id="rev" disabled>Conferir pedido</button></div></div>';
  desenha();$('#busca').addEventListener('input',function(e){S.q=e.target.value;desenha()});
  if(bel)$('#seg').addEventListener('click',function(e){var b=e.target.closest('[data-nv]');if(!b)return;S.nivel=b.dataset.nv;document.querySelectorAll('#seg button').forEach(function(x){x.classList.toggle('on',x.dataset.nv===S.nivel)});salvaR();desenha()});
  $('#rev').onclick=function(){ir('conferir')}}
function desenha(){var q=norm(S.q),fam='',h='';produtosDaInd().filter(function(p){return norm(p.desc+' '+p.cod+' '+p.fam).indexOf(q)>=0}).forEach(function(p){if(p.fam!==fam){fam=p.fam;h+='<div class="fam">'+esc(fam)+'</div>'}h+=linha(p)});
  $('#prods').innerHTML=h||'<p class="note">Nenhum produto encontrado.</p>';barra()}
function barra(){var t=totais();$('#tt').textContent=t.cx?brl(t.t):'';$('#cx').textContent=t.cx?caixas(t.cx):'Toque no + para colocar as caixas.';$('#cm').textContent=t.cx?'Sua comissão '+brl(t.com):'';
  $('#rev').disabled=!t.cx||t.abaixo;$('#minmsg').innerHTML=t.abaixo?'<div class="min">Pedido mínimo da '+esc(S.ind)+': '+brl(t.minimo)+'. Faltam '+brl(t.minimo-t.t)+' para poder enviar.</div>':''}
function setQ(ch,v){v=Math.max(0,Math.min(999,v|0));if(v)S.qty[ch]=v;else delete S.qty[ch];salvaR();
  var el=document.querySelector('.prod[data-ch="'+CSS.escape(ch)+'"]');
  if(el){var p=produtosDaInd().filter(function(x){return x.chave===ch})[0];var inp=el.querySelector('input[data-q]'),sub=el.querySelector('.sub');
    el.classList.toggle('has',!!v);if(inp&&inp.value!==String(v))inp.value=v;sub.innerHTML=subT(v,p);el.querySelector('[data-m="-1"]').disabled=!v}
  barra()}
function zoom(p){var f=window.FOTOS[p.foto];var d=folha('<img class="zoom" src="'+f+'" alt=""><h3>'+esc(nomeP(p))+'</h3><p>'+brl(p.preco)+' a caixa'+(p.un?' · caixa com '+esc(p.un)+' un':'')+'</p><button class="btn alt" id="fz">Fechar</button>');$('#fz').onclick=function(){d.remove()}}

function telaConferir(a){var t=totais(),c=S.cli,ind=industria(S.ind),nv=temNiveis(S.ind);
  var itens=produtosDaInd().filter(function(p){return S.qty[p.chave]});
  a.innerHTML=topo('Confira o pedido','catalogo','<b>'+esc(nomeCli(c))+'</b> · '+esc(S.ind))+
   '<div class="quem"><b>'+esc(c.nome)+'</b><br>'+esc(tc(c.cidade))+' · '+esc(S.ind)+(nv?' · tabela '+S.nivel.toLowerCase():'')+'</div>'+
   itens.map(function(p){return '<div class="line"><div class="n">'+esc(nomeP(p))+'<small>'+caixas(S.qty[p.chave])+' × '+brl(p.preco)+'</small></div><div class="v">'+brl(S.qty[p.chave]*p.preco)+'</div></div>'}).join('')+
   '<div class="tot"><span>Total</span><span>'+brl(t.t)+'</span></div>'+
   '<div class="okbox"><span>Sua comissão neste pedido ('+String(Math.round(ind.comissaoRep*1000)/10).replace('.',',')+'%)</span><b>'+brl(t.com)+'</b></div>'+
   '<label class="field" for="obs">Observação para o pedido (se quiser)<textarea id="obs" rows="2">'+esc(S.obs)+'</textarea></label>'+
   '<div style="margin-top:20px"><button class="btn" id="env">Enviar pedido</button></div><div style="margin-top:10px"><button class="btn alt" data-go="catalogo">Mudar quantidades</button></div>'+
   '<p class="note">'+(online()?'O pedido vai para conferência no administrativo e segue para a indústria.':'Sem sinal agora: o pedido fica guardado no celular. Ele sai quando o app estiver aberto com sinal.')+'</p>';
  $('#obs').addEventListener('input',function(e){S.obs=e.target.value;salvaR()});
  $('#env').onclick=function(){var d=folha('<h3>Enviar este pedido?</h3><p>'+esc(nomeCli(c))+' · '+esc(S.ind)+' · '+brl(t.t)+'</p><button class="btn" id="sim">Sim, enviar</button><button class="btn alt" id="nao">Voltar e conferir</button>');
    $('#nao').onclick=function(){d.remove()};
    $('#sim').onclick=function(){d.remove();enviar(itens,t)}}}

function enviar(itens,t){var c=S.cli;var num=novoNum();
  var ped={id:num,data:agora(),industria:S.ind,nivel:temNiveis(S.ind)?S.nivel:'ÚNICO',obs:S.obs,
    cliente:{cnpj:c.cnpj,nome:c.nome,fantasia:c.fantasia||'',cidade:c.cidade,uf:c.uf||'',telefone:c.telefone||'',endereco:c.endereco||'',bairro:c.bairro||'',cep:c.cep||'',ie:c.ie||''},
    itens:itens.map(function(p){return {chave:p.chave,cod:p.cod,desc:p.desc,qtd:S.qty[p.chave],preco:p.preco}}),
    total:t.t,comissao:t.com,caixas:t.cx};
  S.fila.unshift({pedido:ped,status:'pendente',criadoEm:agora(),tentativas:0});grava(K.fila,S.fila);
  S.ultimo=num;S.qty={};S.obs='';S.q='';grava(K.rasc,null);ir('enviado');
  sincroniza().then(function(){if(S.tela==='enviado')tela()})}

function telaEnviado(a){var f=S.fila.filter(function(x){return x.pedido.id===S.ultimo})[0];if(!f){ir('clientes');return}
  var p=f.pedido,st=f.status;
  var h='';
  if(st==='enviado')h='<div class="chk">✓</div><h1 class="h1">Pedido enviado</h1>'+(f.aviso?'<div class="aviso">'+esc(f.aviso)+'</div>':'');
  else if(st==='erro')h='<div class="chk wait" style="background:var(--err-bg);color:var(--err)">!</div><h1 class="h1">Não deu para enviar</h1><div class="erro">'+esc(f.erro)+'</div><p class="note">Abra “Meus pedidos” para corrigir ou tentar de novo.</p>';
  else h='<div class="chk wait">'+(S.sincronizando?'<span class="spin"></span>':'⏳')+'</div><h1 class="h1">'+(online()?'Enviando…':'Guardado no celular')+'</h1>'+(online()?'':'<p class="note">Pode fechar. Quando tiver sinal, abra o app e deixe aberto uns segundos que ele envia.</p>');
  a.innerHTML='<div class="done">'+h+
   '<p style="color:var(--muted);font-size:20px">'+esc(nomeCli(p.cliente))+' · '+esc(p.industria)+'<br>'+caixas(p.caixas)+' · '+brl(p.total)+'<br>Sua comissão: <b style="color:var(--ok)">'+brl(p.comissao)+'</b></p>'+
   '<div style="margin-top:24px"><button class="btn" id="novoP">Fazer outro pedido</button></div><div style="margin-top:10px"><button class="btn alt" data-go="pedidos">Ver meus pedidos</button></div>'+
   '<p class="note">Número do pedido: '+esc(p.id)+'</p></div>';
  $('#novoP').onclick=function(){limpa();ir('clientes')}}

function telaPedidos(a){
  a.innerHTML=topo('Meus pedidos',null)+(S.msg?'<div class="aviso">'+esc(S.msg)+'</div>':'')+
   (pendentes()?'<div style="margin-top:14px"><button class="btn" id="syncBtn" '+(online()?'':'disabled')+'>Enviar agora os pendentes</button></div>'+(online()?'':'<p class="note">Sem sinal agora. Os pedidos estão guardados no celular.</p>'):'')+
   (S.fila.length?'':'<p class="note">Nenhum pedido feito neste aparelho ainda.</p>')+
   S.fila.map(function(f){var p=f.pedido;var tag=f.status==='enviado'?'<span class="tag ok">✓ Enviado '+esc((f.enviadoEm||'').slice(0,16))+'</span>':f.status==='erro'?'<span class="tag err">Não foi: '+esc(f.erro)+'</span>':'<span class="tag op">⏳ '+(online()?'Enviando…':'Aguardando sinal')+'</span>';
     return '<div class="card"><div class="tags" style="margin:0 0 8px">'+tag+'</div><span class="t">'+esc(nomeCli(p.cliente))+'</span><span class="s">'+esc(p.industria)+' · '+caixas(p.caixas)+' · <b>'+brl(p.total)+'</b></span><span class="s">Feito em '+esc(p.data.slice(0,16))+'</span>'+
       (f.status==='erro'?'<div style="margin-top:10px"><button class="btn alt" data-retry="'+esc(p.id)+'">Tentar enviar de novo</button></div>':'')+'</div>'}).join('')+
   '<div style="margin-top:26px"><button class="btn alt" id="atualizar">Atualizar preços e clientes</button></div>'+
   '<p class="note">'+esc(S.dados&&S.dados.rep?S.dados.rep.nome:'')+' · versão '+VERSAO+(S.dados&&S.dados.versao?' · tabela de '+esc(S.dados.versao):'')+'</p><div><button class="linkbtn" id="sair">Sair da conta</button></div>'+nav();
  var sb=$('#syncBtn');if(sb)sb.onclick=function(){sb.disabled=true;sb.innerHTML='<span class="spin"></span> Enviando…';sincroniza().then(tela)};
  $('#atualizar').onclick=function(){if(!online()){S.msg='Sem sinal para atualizar.';tela();return}var b=$('#atualizar');b.disabled=true;b.innerHTML='<span class="spin"></span> Atualizando…';carregaDados(false).then(function(ok){S.msg=ok?'Preços e clientes atualizados.':'Não consegui atualizar agora.';tela();window.scrollTo(0,0)})};
  $('#sair').onclick=function(){if(pendentes()){S.msg='Há pedidos aguardando envio. Envie antes de sair.';tela();window.scrollTo(0,0);return}
    var d=folha('<h3>Sair da conta?</h3><p>Para entrar de novo vai precisar da chave e de internet.</p><button class="btn" id="simS">Sim, sair</button><button class="btn alt" id="naoS">Ficar</button>');
    $('#naoS').onclick=function(){d.remove()};$('#simS').onclick=function(){d.remove();S.cred=null;S.dados=null;grava(K.cred,null);grava(K.dados,null);grava(K.rasc,null);ir('entrar')}}}

/* ---------- eventos ---------- */
document.addEventListener('click',function(e){
  var g=e.target.closest('[data-go]');if(g){ir(g.dataset.go);return}
  var c=e.target.closest('[data-cli]');if(c){S.cli=clientes().filter(function(x){return x.cnpj===c.dataset.cli})[0];S.qty={};S.obs='';ir('industria');return}
  var n=e.target.closest('[data-ind]');if(n){if(S.ind!==n.dataset.ind){S.qty={};S.q=''}S.ind=n.dataset.ind;S.nivel=(S.cli.nivel==='ATACADO')?'ATACADO':'VAREJO';ir('catalogo');return}
  var z=e.target.closest('[data-zoom]');if(z){var cz=z.closest('.prod').dataset.ch;var pz=S.dados.produtos.filter(function(x){return x.chave===cz})[0];if(pz)zoom(pz);return}
  var m=e.target.closest('.qty [data-m]');if(m){var ch=m.closest('.prod').dataset.ch;setQ(ch,(S.qty[ch]||0)+(+m.dataset.m));return}
  var r=e.target.closest('[data-retry]');if(r){var f=S.fila.filter(function(x){return x.pedido.id===r.dataset.retry})[0];if(f){f.status='pendente';f.erro='';grava(K.fila,S.fila);sincroniza().then(tela)}}
});
document.addEventListener('change',function(e){var inp=e.target.closest('input[data-q]');if(inp){var ch=inp.closest('.prod').dataset.ch;setQ(ch,parseInt(String(inp.value).replace(/\D/g,''),10)||0)}});
document.addEventListener('focusin',function(e){if(e.target.matches&&e.target.matches('input[data-q]'))e.target.select()});
window.addEventListener('online',function(){strip();sincroniza();carregaDados(true)});
window.addEventListener('offline',function(){strip();if(S.tela==='pedidos')tela()});
window.addEventListener('popstate',function(){var sh=document.querySelector('.sheet');if(sh){sh.remove();guarda();return}
  var pai=PAI[S.tela];if(!pai)return;if(S.tela==='enviado')limpa();ir(pai)});
setInterval(function(){if(pendentes())sincroniza()},60000);


/* ---------- início ---------- */
if('serviceWorker' in navigator){try{navigator.serviceWorker.register('sw.js')}catch(e){}}
(function inicio(){
  var u=new URL(location.href);var rep=u.searchParams.get('rep'),k=u.searchParams.get('k');
  if(rep&&k){S.cred={rep:rep,k:k};grava(K.cred,S.cred);history.replaceState(null,'',location.pathname)}
  if(!S.cred){ir('entrar');return}
  if(S.dados){ir('clientes');sincroniza();carregaDados(true).then(function(ok){if(ok&&S.tela==='clientes')tela()});return}
  carregaDados(false).then(function(ok){if(ok)ir('clientes');else ir('entrar',S.msg||'Não consegui carregar a tabela. Confira o sinal e a chave.')})
})();
})();
