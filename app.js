/* Pedidos Dbosco – app do representante (funciona sem sinal; envia quando a internet volta) */
(function(){
'use strict';
var API='https://script.google.com/macros/s/AKfycbwXihSxdsQyjWX4aZ0ahFw9KHseiktYK9yHfJVUags-bjCFaTw1FrmeTPW4kmerBayt-A/exec';
var VERSAO='2026-11-12b';
var K={cred:'db.cred',dados:'db.dados',fila:'db.fila',novos:'db.clientesNovos'};
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
function ir(t,msg){S.tela=t;S.msg=msg||'';tela();window.scrollTo(0,0)}
var PASSOS={clientes:1,novo:1,industria:2,catalogo:3,conferir:4,enviado:4};
function strip(){var el=$('#strip');if(!el)return;var p=pendentes();
  el.innerHTML='<span>'+esc(S.dados&&S.dados.rep?S.dados.rep.nome:'')+'</span><span style="display:flex;gap:8px;align-items:center">'+
   (p?'<button class="linkbtn" data-go="pedidos">'+p+' aguardando envio</button>':'<button class="linkbtn" data-go="pedidos">Meus pedidos</button>')+
   (S.sincronizando?'<span class="spin"></span>':'<span class="pill '+(online()?'':'off')+'">'+(online()?'Com sinal':'Sem sinal')+'</span>')+'</span>'}
function topo(titulo,voltar,ctx){var n=PASSOS[S.tela];
  return '<div class="strip" id="strip"></div><div class="head"><div class="row">'+(voltar?'<button class="back" data-go="'+voltar+'" aria-label="Voltar">‹</button>':'')+'<h1>'+titulo+'</h1></div>'+
   (n?'<div class="step">Passo '+n+' de 4 · '+['Cliente','Indústria','Produtos','Conferir e enviar'][n-1]+'</div>':'')+(ctx?'<div class="ctx">'+ctx+'</div>':'')+'</div>'}
function tela(){var a=$('#app');
  var f={carregando:carregando,entrar:entrar,clientes:telaClientes,novo:telaNovo,industria:telaIndustria,catalogo:telaCatalogo,conferir:telaConferir,enviado:telaEnviado,pedidos:telaPedidos}[S.tela];
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

function telaClientes(a){
  a.innerHTML=topo('Qual cliente?',null)+(S.msg?'<div class="aviso">'+esc(S.msg)+'</div>':'')+
   '<input class="search" id="busca" placeholder="Buscar por nome ou cidade" value="'+esc(S.busca)+'" autocomplete="off">'+
   '<button class="card add" data-go="novo" style="margin-top:14px">+ Cadastrar cliente novo</button><div id="lista"></div>';
  var lista=function(){var q=norm(S.busca);var cs=clientes().filter(function(c){return norm(c.nome+' '+c.fantasia+' '+c.cidade).indexOf(q)>=0});
    $('#lista').innerHTML=cs.length?cs.map(function(c){return '<button class="card" data-cli="'+esc(c.cnpj)+'"><span class="t">'+esc(c.nome)+'</span><span class="s">'+esc(c.cidade)+(c.uf?' / '+esc(c.uf):'')+(c.local?' · novo, ainda não enviado':'')+'</span>'+
      '<span class="tags">'+(c.limeira?'<span class="tag ok">✓ Compra Limeira</span>':'')+(c.bel?'<span class="tag ok">✓ Compra Bel Lar</span>':'')+(c.sanilar?'<span class="tag ok">✓ Compra Sanilar</span>':'')+(c.nivel?'<span class="tag neutro">Bel Lar '+esc(c.nivel.toLowerCase())+'</span>':'')+'</span></button>'}).join('')
     :'<p class="note">'+(clientes().length?'Nenhum cliente encontrado.':'Ainda não há clientes na lista.')+' Toque em “Cadastrar cliente novo”.</p>'};
  lista();$('#busca').addEventListener('input',function(e){S.busca=e.target.value;lista()})}

function telaNovo(a){
  var campo=function(id,rot,extra){return '<label class="field" for="'+id+'">'+rot+'<input id="'+id+'" autocomplete="off"'+(extra||'')+'></label>'};
  a.innerHTML=topo('Cliente novo','clientes')+
   campo('n3','CNPJ',' inputmode="numeric"')+
   '<div style="margin-top:10px"><button class="btn alt" id="buscaN">Buscar dados pelo CNPJ</button></div><div id="msgN"></div>'+
   campo('n1','Razão social')+campo('n6','Nome fantasia (se tiver)')+
   campo('n7','Endereço (rua, número, complemento)')+campo('n8','Bairro')+
   campo('n9','CEP',' inputmode="numeric"')+campo('n2','Cidade')+
   campo('n5','UF',' maxlength="2" autocapitalize="characters" value="ES" style="width:120px"')+
   campo('n4','Telefone',' inputmode="tel"')+campo('n10','Inscrição estadual (ou ISENTO)')+
   '<div class="seg" id="segN"><button data-nv="VAREJO" class="on">Supermercado (varejo)</button><button data-nv="ATACADO">Atacadista</button></div>'+
   '<div style="margin-top:20px"><button class="btn" id="salvaN" disabled>Salvar e continuar</button></div><p class="note" id="faltaN"></p>';
  var nv='VAREJO';var v=function(i){return $('#'+i).value.trim()};
  var obrig=[['n3','CNPJ'],['n1','razão social'],['n7','endereço'],['n8','bairro'],['n9','CEP'],['n2','cidade'],['n5','UF']];
  var ok=function(){var f=obrig.filter(function(x){return x[0]==='n3'?v('n3').replace(/\D/g,'').length!==14:!v(x[0])}).map(function(x){return x[1]});
    $('#salvaN').disabled=f.length>0;
    $('#faltaN').textContent=f.length?'Falta: '+f.join(', ')+'.':(v('n10')?'Tudo certo.':'Tudo certo. Se souber, preencha a inscrição estadual.')};
  ['n1','n2','n3','n5','n7','n8','n9','n10'].forEach(function(i){$('#'+i).addEventListener('input',ok)});ok();
  $('#buscaN').onclick=function(){var d=v('n3').replace(/\D/g,''),m=$('#msgN');
    if(d.length!==14){m.innerHTML='<div class="erro">Digite os 14 números do CNPJ.</div>';return}
    if(!navigator.onLine){m.innerHTML='<div class="aviso">Sem sinal: preencha os campos à mão.</div>';return}
    m.innerHTML='<p class="note"><span class="spin"></span> Buscando na Receita…</p>';
    apiGet({acao:'cnpj',rep:S.cred.rep,k:S.cred.k,cnpj:d}).then(function(j){if(!j.ok)throw new Error(j.erro||'Não deu para buscar agora.');
      var set=function(id,x){if(x&&String(x).trim())$('#'+id).value=String(x).trim()};
      set('n1',j.razao);set('n6',j.fantasia);set('n7',j.endereco);set('n8',j.bairro);set('n9',j.cep);set('n2',j.cidade);set('n5',j.uf);set('n4',j.telefone);
      m.innerHTML='<div class="aviso" style="background:var(--ok-bg);color:var(--ok)">Dados da Receita preenchidos. Confira e complete a inscrição estadual.</div>';ok()
    }).catch(function(e){m.innerHTML='<div class="erro">'+esc(e instanceof TypeError?'Não deu para buscar agora.':e.message)+' Preencha à mão.</div>'})};
  $('#segN').addEventListener('click',function(e){var b=e.target.closest('[data-nv]');if(!b)return;nv=b.dataset.nv;document.querySelectorAll('#segN button').forEach(function(x){x.classList.toggle('on',x.dataset.nv===nv)})});
  $('#salvaN').onclick=function(){var cnpj=v('n3').replace(/\D/g,'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
    var ja=clientes().filter(function(x){return x.cnpj===cnpj})[0];
    if(ja){S.cli=ja;S.qty={};S.obs='';ir('industria');return}
    var c={cnpj:cnpj,nome:v('n1'),fantasia:v('n6'),cidade:v('n2'),uf:v('n5').toUpperCase(),telefone:v('n4'),endereco:v('n7'),bairro:v('n8'),cep:v('n9'),ie:v('n10'),nivel:nv,limeira:false,bel:false,sanilar:false,local:true};
    S.novos.unshift(c);grava(K.novos,S.novos);S.cli=c;S.qty={};S.obs='';ir('industria')}}

function telaIndustria(a){var c=S.cli;
  a.innerHTML=topo('Qual indústria?','clientes','<b>'+esc(c.nome)+'</b> · '+esc(c.cidade))+
   (S.dados.industrias||[]).map(function(i){var compra={Limeira:c.limeira,'Bel Lar':c.bel,Sanilar:c.sanilar}[i.nome];
     return '<button class="card" data-ind="'+esc(i.nome)+'"><span class="t">'+esc(i.nome)+'</span><span class="s">'+(compra?'✓ Este cliente já compra':'Ainda não compra')+(i.minimo?' · pedido mínimo '+brl(i.minimo):'')+'</span></button>'}).join('')+
   '<p class="note">Os preços entram sozinhos, da tabela de cada indústria.</p>'}

function pic(p){var f=p.foto&&window.FOTOS&&window.FOTOS[p.foto];return f?'<img src="'+f+'" alt="">':esc(p.desc.split(' ').slice(0,2).map(function(w){return w[0]}).join('').toUpperCase())}
function linha(p){var q=S.qty[p.chave]||0;var conf=/CONFIRMAR/i.test(p.desc);var d=tc(p.desc.replace(/\s*\(PREÇO A CONFIRMAR\)/i,''));
  return '<div class="prod '+(q?'has':'')+'" data-ch="'+esc(p.chave)+'"><div class="pic">'+pic(p)+'</div>'+
   '<div><div class="pn">'+esc(d)+'</div><div class="pm">Cód. '+esc(p.cod)+(p.un?' · caixa com '+p.un+' un':'')+'</div><div class="pp">'+brl(p.preco)+' <span>a caixa</span></div>'+(conf?'<span class="conf">Preço a confirmar</span>':'')+'</div>'+
   '<div class="qty"><button data-m="-1" aria-label="Menos uma caixa">−</button><input inputmode="numeric" value="'+q+'" aria-label="Caixas" data-q><button data-m="1" aria-label="Mais uma caixa">+</button>'+
   '<div class="sub">'+(q?brl(q*p.preco)+'<small>'+q+' cx × '+brl(p.preco)+'</small>':'')+'</div></div></div>'}
function telaCatalogo(a){var c=S.cli,bel=temNiveis(S.ind);
  a.innerHTML=topo('Escolha os produtos','industria','<b>'+esc(c.nome)+'</b> · '+esc(S.ind))+
   (bel?'<div class="seg" id="seg"><button data-nv="VAREJO" class="'+(S.nivel==='VAREJO'?'on':'')+'">Preço varejo</button><button data-nv="ATACADO" class="'+(S.nivel==='ATACADO'?'on':'')+'">Preço atacado</button></div>':'')+
   '<input class="search" id="busca" placeholder="Buscar produto" value="'+esc(S.q)+'" autocomplete="off"><div id="prods"></div>'+
   '<div class="bar"><div class="in"><div id="minmsg"></div><div class="sum"><div><b id="tt">R$ 0,00</b><br><span id="cx">0 caixas</span></div><div class="com" id="cm"></div></div><button class="btn" id="rev" disabled>Revisar pedido</button></div></div>';
  desenha();$('#busca').addEventListener('input',function(e){S.q=e.target.value;desenha()});
  if(bel)$('#seg').addEventListener('click',function(e){var b=e.target.closest('[data-nv]');if(!b)return;S.nivel=b.dataset.nv;document.querySelectorAll('#seg button').forEach(function(x){x.classList.toggle('on',x.dataset.nv===S.nivel)});desenha()});
  $('#rev').onclick=function(){ir('conferir')}}
function desenha(){var q=norm(S.q),fam='',h='';produtosDaInd().filter(function(p){return norm(p.desc+' '+p.cod+' '+p.fam).indexOf(q)>=0}).forEach(function(p){if(p.fam!==fam){fam=p.fam;h+='<div class="fam">'+esc(fam)+'</div>'}h+=linha(p)});
  $('#prods').innerHTML=h||'<p class="note">Nenhum produto encontrado.</p>';barra()}
function barra(){var t=totais();$('#tt').textContent=brl(t.t);$('#cx').textContent=t.cx+(t.cx===1?' caixa':' caixas');$('#cm').textContent=t.cx?'Sua comissão '+brl(t.com):'';
  $('#rev').disabled=!t.cx||t.abaixo;$('#minmsg').innerHTML=t.abaixo?'<div class="min">Pedido mínimo da '+esc(S.ind)+': '+brl(t.minimo)+'. Faltam '+brl(t.minimo-t.t)+' para poder enviar.</div>':''}
function setQ(ch,v){v=Math.max(0,Math.min(999,v|0));if(v)S.qty[ch]=v;else delete S.qty[ch];
  var el=document.querySelector('.prod[data-ch="'+CSS.escape(ch)+'"]');
  if(el){var p=produtosDaInd().filter(function(x){return x.chave===ch})[0];var inp=el.querySelector('input[data-q]'),sub=el.querySelector('.sub');
    el.classList.toggle('has',!!v);if(inp&&inp.value!==String(v))inp.value=v;sub.innerHTML=v?brl(v*p.preco)+'<small>'+v+' cx × '+brl(p.preco)+'</small>':''}
  barra()}

function telaConferir(a){var t=totais(),c=S.cli,ind=industria(S.ind),nv=temNiveis(S.ind);
  var itens=produtosDaInd().filter(function(p){return S.qty[p.chave]});
  a.innerHTML=topo('Confira o pedido','catalogo','<b>'+esc(c.nome)+'</b> · '+esc(S.ind)+(nv?' · tabela '+S.nivel.toLowerCase():''))+
   itens.map(function(p){return '<div class="line"><div class="n">'+esc(tc(p.desc.replace(/\s*\(PREÇO A CONFIRMAR\)/i,'')))+'<small>'+S.qty[p.chave]+' cx × '+brl(p.preco)+'</small></div><div class="v">'+brl(S.qty[p.chave]*p.preco)+'</div></div>'}).join('')+
   '<div class="tot"><span>Total</span><span>'+brl(t.t)+'</span></div>'+
   '<div class="okbox"><span>Sua comissão neste pedido ('+String(Math.round(ind.comissaoRep*1000)/10).replace('.',',')+'%)</span><b>'+brl(t.com)+'</b></div>'+
   '<label class="field" for="obs">Observação para o pedido (se quiser)<textarea id="obs" rows="2">'+esc(S.obs)+'</textarea></label>'+
   '<div style="margin-top:20px"><button class="btn" id="env">Enviar pedido</button></div><div style="margin-top:10px"><button class="btn alt" data-go="catalogo">Mudar quantidades</button></div>'+
   '<p class="note">'+(online()?'O pedido vai para conferência no administrativo e segue para a indústria.':'Sem sinal agora: o pedido fica guardado e sai sozinho quando a internet voltar.')+'</p>';
  $('#obs').addEventListener('input',function(e){S.obs=e.target.value});
  $('#env').onclick=function(){var d=document.createElement('div');d.className='sheet';
    d.innerHTML='<div class="box"><h3>Enviar este pedido?</h3><p>'+esc(c.nome)+' · '+esc(S.ind)+' · '+brl(t.t)+'</p><button class="btn" id="sim">Sim, enviar</button><button class="btn alt" id="nao">Voltar e conferir</button></div>';
    document.body.appendChild(d);$('#nao').onclick=function(){d.remove()};
    $('#sim').onclick=function(){d.remove();enviar(itens,t)}}}

function enviar(itens,t){var c=S.cli;var num=novoNum();
  var ped={id:num,data:agora(),industria:S.ind,nivel:temNiveis(S.ind)?S.nivel:'ÚNICO',obs:S.obs,
    cliente:{cnpj:c.cnpj,nome:c.nome,fantasia:c.fantasia||'',cidade:c.cidade,uf:c.uf||'',telefone:c.telefone||'',endereco:c.endereco||'',bairro:c.bairro||'',cep:c.cep||'',ie:c.ie||''},
    itens:itens.map(function(p){return {chave:p.chave,cod:p.cod,desc:p.desc,qtd:S.qty[p.chave],preco:p.preco}}),
    total:t.t,comissao:t.com,caixas:t.cx};
  S.fila.unshift({pedido:ped,status:'pendente',criadoEm:agora(),tentativas:0});grava(K.fila,S.fila);
  S.ultimo=num;S.qty={};S.obs='';S.q='';ir('enviado');
  sincroniza().then(function(){if(S.tela==='enviado')tela()})}

function telaEnviado(a){var f=S.fila.filter(function(x){return x.pedido.id===S.ultimo})[0];if(!f){ir('clientes');return}
  var p=f.pedido,st=f.status;
  var h='';
  if(st==='enviado')h='<div class="chk">✓</div><h2 style="margin:0">Pedido enviado</h2>'+(f.aviso?'<div class="aviso">'+esc(f.aviso)+'</div>':'');
  else if(st==='erro')h='<div class="chk wait" style="background:var(--err-bg);color:var(--err)">!</div><h2 style="margin:0">Não deu para enviar</h2><div class="erro">'+esc(f.erro)+'</div><p class="note">Abra “Meus pedidos” para corrigir ou tentar de novo.</p>';
  else h='<div class="chk wait">'+(S.sincronizando?'<span class="spin"></span>':'⏳')+'</div><h2 style="margin:0">'+(online()?'Enviando…':'Guardado, sai quando a internet voltar')+'</h2>';
  a.innerHTML=topo('Pedido '+esc(p.id),null)+'<div class="done">'+h+
   '<p style="color:var(--muted);font-size:20px">'+esc(p.cliente.nome)+' · '+esc(p.industria)+'<br>'+p.caixas+' caixas · '+brl(p.total)+'<br>Sua comissão: <b style="color:var(--ok)">'+brl(p.comissao)+'</b></p>'+
   '<div style="margin-top:24px"><button class="btn" id="novoP">Fazer outro pedido</button></div><div style="margin-top:10px"><button class="btn alt" data-go="pedidos">Meus pedidos</button></div></div>';
  $('#novoP').onclick=function(){S.cli=null;S.ind=null;S.qty={};S.obs='';S.q='';S.busca='';ir('clientes')}}

function telaPedidos(a){
  a.innerHTML=topo('Meus pedidos','clientes')+(S.fila.length?'':'<p class="note">Nenhum pedido feito neste celular ainda.</p>')+
   S.fila.map(function(f){var p=f.pedido;var tag=f.status==='enviado'?'<span class="tag ok">✓ Enviado '+esc((f.enviadoEm||'').slice(0,16))+'</span>':f.status==='erro'?'<span class="tag err">Erro: '+esc(f.erro)+'</span>':'<span class="tag op">'+(online()?'Enviando…':'Aguardando sinal')+'</span>';
     return '<div class="card"><div class="ped"><div class="l"><span class="t">'+esc(p.cliente.nome)+'</span><span class="s">'+esc(p.industria)+' · '+p.caixas+' cx · '+esc(p.data.slice(0,16))+'<br>'+esc(p.id)+'</span></div><div class="r"><b>'+brl(p.total)+'</b></div></div><div class="tags">'+tag+'</div>'+
       (f.status==='erro'?'<div style="margin-top:10px"><button class="btn alt" data-retry="'+esc(p.id)+'">Tentar enviar de novo</button></div>':'')+'</div>'}).join('')+
   (pendentes()?'<div style="margin-top:20px"><button class="btn" id="syncBtn" '+(online()?'':'disabled')+'>Enviar agora os pendentes</button></div>':'')+
   '<p class="note">Versão '+VERSAO+(S.dados&&S.dados.versao?' · tabela de '+esc(S.dados.versao):'')+'</p><div style="margin-top:10px"><button class="linkbtn" id="atualizar">Atualizar tabela e clientes</button> &nbsp; <button class="linkbtn" id="sair">Sair da conta</button></div>';
  var sb=$('#syncBtn');if(sb)sb.onclick=function(){sb.disabled=true;sb.innerHTML='<span class="spin"></span> Enviando…';sincroniza().then(tela)};
  $('#atualizar').onclick=function(){if(!online()){S.msg='Sem sinal para atualizar.';tela();return}carregaDados(false).then(function(ok){S.msg=ok?'Tabela e clientes atualizados.':'Não consegui atualizar agora.';tela()})};
  $('#sair').onclick=function(){if(pendentes()){S.msg='Há pedidos aguardando envio. Envie antes de sair.';tela();return}
    var d=document.createElement('div');d.className='sheet';d.innerHTML='<div class="box"><h3>Sair da conta?</h3><p>Para entrar de novo vai precisar da chave e de internet.</p><button class="btn" id="simS">Sim, sair</button><button class="btn alt" id="naoS">Ficar</button></div>';
    document.body.appendChild(d);$('#naoS').onclick=function(){d.remove()};$('#simS').onclick=function(){d.remove();S.cred=null;S.dados=null;grava(K.cred,null);grava(K.dados,null);ir('entrar')}}}

/* ---------- eventos ---------- */
document.addEventListener('click',function(e){
  var g=e.target.closest('[data-go]');if(g){ir(g.dataset.go);return}
  var c=e.target.closest('[data-cli]');if(c){S.cli=clientes().filter(function(x){return x.cnpj===c.dataset.cli})[0];S.qty={};S.obs='';ir('industria');return}
  var n=e.target.closest('[data-ind]');if(n){if(S.ind!==n.dataset.ind){S.qty={};S.q=''}S.ind=n.dataset.ind;S.nivel=(S.cli.nivel==='ATACADO')?'ATACADO':'VAREJO';ir('catalogo');return}
  var m=e.target.closest('.qty [data-m]');if(m){var ch=m.closest('.prod').dataset.ch;setQ(ch,(S.qty[ch]||0)+(+m.dataset.m));return}
  var r=e.target.closest('[data-retry]');if(r){var f=S.fila.filter(function(x){return x.pedido.id===r.dataset.retry})[0];if(f){f.status='pendente';f.erro='';grava(K.fila,S.fila);sincroniza().then(tela)}}
});
document.addEventListener('change',function(e){var inp=e.target.closest('input[data-q]');if(inp){var ch=inp.closest('.prod').dataset.ch;setQ(ch,parseInt(String(inp.value).replace(/\D/g,''),10)||0)}});
document.addEventListener('focusin',function(e){if(e.target.matches&&e.target.matches('input[data-q]'))e.target.select()});
window.addEventListener('online',function(){strip();sincroniza();carregaDados(true)});
window.addEventListener('offline',function(){strip();if(S.tela==='pedidos')tela()});
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
