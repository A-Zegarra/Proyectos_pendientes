const gate=document.getElementById("userGate");
const gateUser=document.getElementById("gateUser");
const gateError=document.getElementById("gateError");
const enterBtn=document.getElementById("enterBtn");
const currentUser=document.getElementById("currentUser");
const changeUser=document.getElementById("changeUser");
const gallery=document.getElementById("gallery");
const camera=document.getElementById("camera");
const queue=document.getElementById("queue");
const uploadBtn=document.getElementById("uploadBtn");
const notice=document.getElementById("notice");
const filesBox=document.getElementById("files");
const count=document.getElementById("count");
const search=document.getElementById("search");

const CHUNK=8*1024*1024;
let selected=[];
let allFiles=[];
let user="";

function esc(v){return String(v||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fmt(bytes){
  if(bytes<1024)return bytes+" B";
  if(bytes<1048576)return (bytes/1024).toFixed(0)+" KB";
  if(bytes<1073741824)return (bytes/1048576).toFixed(1)+" MB";
  return (bytes/1073741824).toFixed(2)+" GB";
}
function date(v){try{return new Date(v).toLocaleString("es-PE")}catch{return ""}}
async function sha(text){
  if(crypto.subtle){
    const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
    return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0")}).join("").slice(0,48);
  }
  return (Date.now()+"-"+Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g,"");
}
function showGate(prefill){
  gate.classList.add("show");
  gateUser.value=prefill||"";
  setTimeout(function(){gateUser.focus()},50);
}
function hideGate(){gate.classList.remove("show")}
async function session(){
  try{
    const r=await fetch("/api/session");
    const j=await r.json();
    if(j.authenticated){
      user=j.user;
      currentUser.textContent=user;
      hideGate();
      await refresh();
      const next=new URLSearchParams(location.search).get("next");
      if(next&&next.startsWith("/download/"))location.href=next;
      return;
    }
  }catch(e){}
  showGate("");
}
async function login(){
  gateError.textContent="";
  const name=gateUser.value.trim();
  if(name.length<2){gateError.textContent="Escribe al menos 2 caracteres.";return}
  enterBtn.disabled=true;
  try{
    const r=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user:name})});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||"No se pudo ingresar");
    user=j.user;
    currentUser.textContent=user;
    hideGate();
    await refresh();
    const next=new URLSearchParams(location.search).get("next");
    if(next&&next.startsWith("/download/"))location.href=next;
  }catch(e){gateError.textContent=e.message||"No se pudo ingresar"}
  finally{enterBtn.disabled=false}
}
enterBtn.onclick=login;
gateUser.addEventListener("keydown",function(e){if(e.key==="Enter")login()});
changeUser.onclick=async function(){
  await fetch("/api/session/logout",{method:"POST"});
  const old=user;user="";currentUser.textContent="—";showGate(old);
};

function addFiles(list){
  Array.from(list||[]).forEach(function(f){
    if(f.type.startsWith("image/")||f.type.startsWith("video/"))selected.push(f);
  });
  renderQueue();
}
gallery.onchange=function(){addFiles(gallery.files);gallery.value=""};
camera.onchange=function(){addFiles(camera.files);camera.value=""};

function renderQueue(){
  queue.innerHTML="";
  selected.forEach(function(f,i){
    const el=document.createElement("div");
    el.className="upload-item";el.id="up-"+i;
    el.innerHTML=
      '<div class="row"><div class="icon">'+(f.type.startsWith("video/")?"🎬":"🖼️")+
      '</div><div class="grow"><div class="filename">'+esc(f.name)+
      '</div><div class="meta">'+fmt(f.size)+
      '</div></div><button class="btn secondary" type="button" style="padding:8px 10px;min-height:auto">Quitar</button></div>'+
      '<div class="progress"><div class="fill"></div></div><div class="state">Listo para subir</div>';
    el.querySelector("button").onclick=function(){selected.splice(i,1);renderQueue()};
    queue.appendChild(el);
  });
  uploadBtn.disabled=!selected.length;
}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
async function sendPart(opts){
  let last;
  for(let attempt=1;attempt<=5;attempt++){
    try{
      const r=await fetch("/api/upload-chunk",opts);
      if(r.status===401){showGate(user);throw new Error("Vuelve a ingresar tu usuario")}
      if(!r.ok)throw new Error(await r.text());
      return await r.json();
    }catch(e){last=e;await sleep(700*attempt)}
  }
  throw last;
}
async function uploadOne(file,index){
  const id=await sha(user+"|"+file.name+"|"+file.size+"|"+file.lastModified);
  const total=Math.max(1,Math.ceil(file.size/CHUNK));
  const root=document.getElementById("up-"+index);
  const fill=root.querySelector(".fill");
  const state=root.querySelector(".state");
  let done=new Set();
  try{
    const s=await fetch("/api/upload-status/"+id);
    if(s.ok){const j=await s.json();done=new Set(j.chunks||[])}
  }catch(e){}
  for(let part=0;part<total;part++){
    if(done.has(part)){fill.style.width=Math.round(((part+1)/total)*100)+"%";continue}
    const blob=file.slice(part*CHUNK,Math.min(file.size,(part+1)*CHUNK));
    state.textContent="Subiendo "+Math.round((part/total)*100)+"%";
    await sendPart({
      method:"POST",
      headers:{
        "Content-Type":"application/octet-stream",
        "x-upload-id":id,
        "x-file-name":encodeURIComponent(file.name),
        "x-file-size":String(file.size),
        "x-file-type":encodeURIComponent(file.type||""),
        "x-chunk-index":String(part),
        "x-total-chunks":String(total)
      },
      body:blob
    });
    const p=Math.round(((part+1)/total)*100);
    fill.style.width=p+"%";
    state.textContent=p===100?"Guardado ✓":"Subiendo "+p+"%";
  }
}
uploadBtn.onclick=async function(){
  if(!user){showGate("");return}
  if(!selected.length)return;
  uploadBtn.disabled=true;notice.style.display="none";
  let done=0;
  try{
    for(let i=0;i<selected.length;i++){await uploadOne(selected[i],i);done++}
    notice.style.display="block";
    notice.innerHTML="<b>¡Recuerdos guardados!</b><br>"+done+" archivo"+(done===1?"":"s")+" se "+(done===1?"guardó":"guardaron")+" correctamente.";
    selected=[];setTimeout(renderQueue,700);await refresh();
  }catch(e){
    notice.style.display="block";notice.style.background="#fff1f1";
    notice.innerHTML="<b>No se completó la subida.</b><br>Los bloques enviados quedan guardados para reintentar.";
  }finally{uploadBtn.disabled=!selected.length}
};

async function refresh(){
  if(!user)return;
  try{
    const r=await fetch("/api/files");
    if(r.status===401){showGate("");return}
    allFiles=await r.json();count.textContent=allFiles.length;renderFiles();
  }catch(e){filesBox.innerHTML='<div class="file-card"><span class="muted">No se pudo cargar la galería.</span></div>'}
}
function renderFiles(){
  const q=search.value.trim().toLowerCase();
  const list=allFiles.filter(function(x){return !q||(String(x.originalName)+" "+String(x.userName)).toLowerCase().includes(q)});
  filesBox.innerHTML="";
  if(!list.length){
    filesBox.innerHTML='<div class="file-card"><span class="muted">'+(q?"No hay coincidencias.":"Aún no hay recuerdos subidos.")+'</span></div>';
    return;
  }
  list.forEach(function(x){
    const card=document.createElement("article");card.className="file-card";
    const preview=x.kind==="image"
      ?'<img loading="lazy" src="'+x.previewUrl+'" alt="">'
      :'<video preload="metadata" controls playsinline src="'+x.previewUrl+'"></video>';
    card.innerHTML=
      '<div class="preview">'+preview+'</div>'+
      '<div class="filename">'+esc(x.originalName)+'</div>'+
      '<div class="meta">Por <b>'+esc(x.userName)+'</b> · '+date(x.uploadedAt)+'</div>'+
      '<div class="meta">'+fmt(x.size)+' · '+(x.kind==="video"?"Video":"Foto")+'</div>'+
      '<div class="actions"><a class="btn green" href="'+x.downloadUrl+'">⬇ Descargar</a></div>';
    filesBox.appendChild(card);
  });
}
search.oninput=renderFiles;
session();