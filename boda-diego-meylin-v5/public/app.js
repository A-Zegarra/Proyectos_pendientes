const gate=document.getElementById("userGate"),gateUser=document.getElementById("gateUser"),gateError=document.getElementById("gateError"),enterBtn=document.getElementById("enterBtn");
const currentUser=document.getElementById("currentUser"),changeUser=document.getElementById("changeUser"),gallery=document.getElementById("gallery"),camera=document.getElementById("camera");
const queue=document.getElementById("queue"),uploadBtn=document.getElementById("uploadBtn"),notice=document.getElementById("notice"),filesBox=document.getElementById("files"),count=document.getElementById("count"),search=document.getElementById("search");
const overall=document.getElementById("overall"),overallText=document.getElementById("overallText"),overallPercent=document.getElementById("overallPercent"),overallFill=document.getElementById("overallFill");
const viewer=document.getElementById("viewer"),viewerMedia=document.getElementById("viewerMedia"),viewerLoading=document.getElementById("viewerLoading"),viewerName=document.getElementById("viewerName"),viewerMeta=document.getElementById("viewerMeta");
const closeViewer=document.getElementById("closeViewer"),viewerPrev=document.getElementById("viewerPrev"),viewerNext=document.getElementById("viewerNext"),viewerPrevBottom=document.getElementById("viewerPrevBottom"),viewerNextBottom=document.getElementById("viewerNextBottom");
const viewerDownload=document.getElementById("viewerDownload"),viewerDownloadTop=document.getElementById("viewerDownloadTop");

const CHUNK=8*1024*1024;
let selected=[],allFiles=[],visibleFiles=[],user="",viewerIndex=0,isUploading=false;

function esc(v){return String(v||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fmt(bytes){if(bytes<1024)return bytes+" B";if(bytes<1048576)return(bytes/1024).toFixed(0)+" KB";if(bytes<1073741824)return(bytes/1048576).toFixed(1)+" MB";return(bytes/1073741824).toFixed(2)+" GB"}
function date(v){try{return new Date(v).toLocaleString("es-PE")}catch{return""}}
async function sha(text){
  if(crypto.subtle){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0")}).join("").slice(0,48)}
  return(Date.now()+"-"+Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g,"")
}
function showGate(prefill){gate.classList.add("show");gateUser.value=prefill||"";setTimeout(function(){gateUser.focus()},50)}
function hideGate(){gate.classList.remove("show")}
async function session(){
  try{const r=await fetch("/api/session");const j=await r.json();if(j.authenticated){user=j.user;currentUser.textContent=user;hideGate();await refresh();const next=new URLSearchParams(location.search).get("next");if(next&&next.startsWith("/download/"))location.href=next;return}}catch(e){}
  showGate("")
}
async function login(){
  gateError.textContent="";const name=gateUser.value.trim();if(name.length<2){gateError.textContent="Escribe al menos 2 caracteres.";return}
  enterBtn.disabled=true;
  try{const r=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user:name})});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se pudo ingresar");user=j.user;currentUser.textContent=user;hideGate();await refresh()}catch(e){gateError.textContent=e.message||"No se pudo ingresar"}finally{enterBtn.disabled=false}
}
enterBtn.onclick=login;gateUser.addEventListener("keydown",function(e){if(e.key==="Enter")login()});
changeUser.onclick=async function(){if(isUploading)return;await fetch("/api/session/logout",{method:"POST"});const old=user;user="";currentUser.textContent="—";showGate(old)};

function addFiles(list){
  if(isUploading)return;
  Array.from(list||[]).forEach(function(f){if(f.type.startsWith("image/")||f.type.startsWith("video/"))selected.push(f)});
  renderQueue()
}
gallery.onchange=function(){addFiles(gallery.files);gallery.value=""};camera.onchange=function(){addFiles(camera.files);camera.value=""};

function renderQueue(){
  queue.innerHTML="";
  selected.forEach(function(f,i){
    const el=document.createElement("div");el.className="upload-item";el.id="up-"+i;
    el.innerHTML='<div class="row"><div class="icon">'+(f.type.startsWith("video/")?"🎬":"🖼️")+'</div><div class="grow"><div class="filename">'+esc(f.name)+'</div><div class="meta">'+fmt(f.size)+'</div></div><button class="btn secondary remove" type="button" style="padding:8px 10px;min-height:auto">Quitar</button></div><div class="progress"><div class="fill"></div></div><div class="upload-foot"><span class="state">En espera</span><span class="sent">0 MB / '+fmt(f.size)+'</span></div>';
    el.querySelector(".remove").onclick=function(){if(isUploading)return;selected.splice(i,1);renderQueue()};
    queue.appendChild(el)
  });
  uploadBtn.disabled=!selected.length||isUploading
}
function setFileProgress(index,percent,state,sentBytes,fileSize,kind){
  const root=document.getElementById("up-"+index);if(!root)return;
  root.querySelector(".fill").style.width=Math.max(0,Math.min(100,percent))+"%";
  const s=root.querySelector(".state");s.textContent=state;s.className="state"+(kind?" "+kind:"");
  root.querySelector(".sent").textContent=fmt(sentBytes)+" / "+fmt(fileSize)+" · "+Math.round(percent)+"%"
}
function setOverall(doneBytes,totalBytes,label){
  const p=totalBytes?Math.min(100,(doneBytes/totalBytes)*100):0;
  overall.classList.add("show");overallFill.style.width=p+"%";overallPercent.textContent=Math.round(p)+"%";overallText.textContent=label
}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
async function sendPart(opts){
  let last;
  for(let attempt=1;attempt<=5;attempt++){
    try{const r=await fetch("/api/upload-chunk",opts);if(r.status===401){showGate(user);throw new Error("Vuelve a ingresar tu usuario")}if(!r.ok)throw new Error(await r.text());return await r.json()}
    catch(e){last=e;await sleep(700*attempt)}
  }
  throw last
}
async function uploadOne(file,index,baseDone,totalAll){
  const id=await sha(user+"|"+file.name+"|"+file.size+"|"+file.lastModified),total=Math.max(1,Math.ceil(file.size/CHUNK));let done=new Set();
  setFileProgress(index,0,"Preparando…",0,file.size,"");
  try{const s=await fetch("/api/upload-status/"+id);if(s.ok){const j=await s.json();done=new Set(j.chunks||[])}}catch(e){}
  let sent=Math.min(file.size,done.size*CHUNK);
  setFileProgress(index,file.size?sent/file.size*100:0,"Subiendo…",sent,file.size,"");
  for(let part=0;part<total;part++){
    if(done.has(part))continue;
    const start=part*CHUNK,end=Math.min(file.size,(part+1)*CHUNK),blob=file.slice(start,end);
    await sendPart({method:"POST",headers:{"Content-Type":"application/octet-stream","x-upload-id":id,"x-file-name":encodeURIComponent(file.name),"x-file-size":String(file.size),"x-file-type":encodeURIComponent(file.type||""),"x-chunk-index":String(part),"x-total-chunks":String(total)},body:blob});
    sent=Math.max(sent,end);
    const p=file.size?sent/file.size*100:100;
    setFileProgress(index,p,p>=100?"Procesando…":"Subiendo…",sent,file.size,"");
    setOverall(baseDone+sent,totalAll,"Subiendo "+(index+1)+" de "+selected.length)
  }
  setFileProgress(index,100,"Subido ✓",file.size,file.size,"ok")
}
uploadBtn.onclick=async function(){
  if(!user){showGate("");return}if(!selected.length||isUploading)return;
  isUploading=true;renderQueue();uploadBtn.textContent="Subiendo…";notice.style.display="none";
  gallery.disabled=true;camera.disabled=true;
  const totalAll=selected.reduce(function(a,f){return a+f.size},0);let baseDone=0,doneFiles=0;
  setOverall(0,totalAll,"Preparando subida…");
  try{
    for(let i=0;i<selected.length;i++){await uploadOne(selected[i],i,baseDone,totalAll);baseDone+=selected[i].size;doneFiles++;setOverall(baseDone,totalAll,"Subidos "+doneFiles+" de "+selected.length)}
    notice.style.display="block";notice.style.background="#edf6ef";notice.innerHTML="<b>¡Todo listo!</b><br>"+doneFiles+" archivo"+(doneFiles===1?"":"s")+" subido"+(doneFiles===1?"":"s")+" correctamente.";
    setOverall(totalAll,totalAll,"Carga completada ✓");await refresh()
  }catch(e){
    notice.style.display="block";notice.style.background="#fff1f1";notice.innerHTML="<b>La carga se interrumpió.</b><br>Puedes volver a intentarlo; las partes ya enviadas se conservan.";
    const pending=document.querySelectorAll(".state");pending.forEach(function(x){if(x.textContent.indexOf("Subido")<0&&x.textContent.indexOf("Procesando")<0){x.textContent="Pendiente de reintento";x.className="state error"}})
  }finally{
    isUploading=false;gallery.disabled=false;camera.disabled=false;uploadBtn.textContent="↑ Subir recuerdos";uploadBtn.disabled=!selected.length
  }
};

async function refresh(){
  if(!user)return;
  try{const r=await fetch("/api/files");if(r.status===401){showGate("");return}allFiles=await r.json();count.textContent=allFiles.length;renderFiles()}catch(e){filesBox.innerHTML='<div class="file-card"><span class="muted">No se pudo cargar la galería.</span></div>'}
}
function renderFiles(){
  const q=search.value.trim().toLowerCase();
  visibleFiles=allFiles.filter(function(x){return !q||(String(x.originalName)+" "+String(x.userName)).toLowerCase().includes(q)});
  filesBox.innerHTML="";
  if(!visibleFiles.length){filesBox.innerHTML='<div class="file-card"><span class="muted">'+(q?"No hay coincidencias.":"Aún no hay recuerdos subidos.")+'</span></div>';return}
  visibleFiles.forEach(function(x,i){
    const card=document.createElement("article");card.className="file-card";
    const visual=x.kind==="image"
      ?'<img loading="lazy" src="'+x.previewUrl+'" alt="">'
      :'<div class="video-tile"><span class="play">▶</span><span class="type-badge">VIDEO</span></div>';
    card.innerHTML='<div class="preview" data-open="'+i+'">'+visual+'</div><div class="card-info"><div class="filename">'+esc(x.originalName)+'</div><div class="meta">'+esc(x.userName)+' · '+fmt(x.size)+'</div></div><div class="actions"><button class="btn secondary open-btn" data-open="'+i+'">'+(x.kind==="video"?"▶ Ver":"⛶ Ver")+'</button><a class="btn green" href="'+x.downloadUrl+'">↓ Descargar</a></div>';
    card.querySelectorAll("[data-open]").forEach(function(el){el.onclick=function(){openViewer(Number(el.dataset.open))}});
    filesBox.appendChild(card)
  })
}
function openViewer(i){
  if(!visibleFiles.length)return;
  viewerIndex=(i+visibleFiles.length)%visibleFiles.length;
  const x=visibleFiles[viewerIndex];
  viewer.classList.add("show");document.body.style.overflow="hidden";
  viewerName.textContent=x.originalName;viewerMeta.textContent="Por "+x.userName+" · "+fmt(x.size);
  viewerDownload.href=x.downloadUrl;viewerDownloadTop.href=x.downloadUrl;
  viewerLoading.classList.remove("hide");
  viewerMedia.querySelectorAll("img,video").forEach(function(el){el.remove()});
  let media;
  if(x.kind==="video"){
    media=document.createElement("video");media.controls=true;media.playsInline=true;media.preload="metadata";media.src=x.previewUrl;
    media.onloadedmetadata=function(){viewerLoading.classList.add("hide")}
  }else{
    media=document.createElement("img");media.alt=x.originalName;media.src=x.previewUrl;
    media.onload=function(){viewerLoading.classList.add("hide")}
  }
  viewerMedia.insertBefore(media,viewerPrev)
}
function closeView(){
  viewer.classList.remove("show");document.body.style.overflow="";
  const v=viewerMedia.querySelector("video");if(v){v.pause();v.removeAttribute("src");v.load()}
}
function moveViewer(delta){openViewer(viewerIndex+delta)}
closeViewer.onclick=closeView;viewerPrev.onclick=function(){moveViewer(-1)};viewerNext.onclick=function(){moveViewer(1)};
viewerPrevBottom.onclick=function(){moveViewer(-1)};viewerNextBottom.onclick=function(){moveViewer(1)};
document.addEventListener("keydown",function(e){if(!viewer.classList.contains("show"))return;if(e.key==="Escape")closeView();if(e.key==="ArrowLeft")moveViewer(-1);if(e.key==="ArrowRight")moveViewer(1)});
let touchX=null;
viewerMedia.addEventListener("touchstart",function(e){touchX=e.changedTouches[0].clientX},{passive:true});
viewerMedia.addEventListener("touchend",function(e){if(touchX===null)return;const d=e.changedTouches[0].clientX-touchX;if(Math.abs(d)>70)moveViewer(d>0?-1:1);touchX=null},{passive:true});

search.oninput=renderFiles;
session();