const $=id=>document.getElementById(id);
const gate=$("gate"),gateUser=$("gateUser"),gateError=$("gateError"),enterBtn=$("enterBtn"),currentUser=$("currentUser"),changeUser=$("changeUser");
const galleryInput=$("galleryInput"),cameraInput=$("cameraInput"),queue=$("queue"),queueSummary=$("queueSummary"),queueCount=$("queueCount"),queueSize=$("queueSize"),clearQueue=$("clearQueue");
const uploadBtn=$("uploadBtn"),bottomTitle=$("bottomTitle"),bottomSub=$("bottomSub"),overall=$("overall"),overallText=$("overallText"),overallPercent=$("overallPercent"),overallFill=$("overallFill"),notice=$("notice");
const search=$("search"),galleryBox=$("gallery");
const viewer=$("viewer"),viewerMedia=$("viewerMedia"),viewerLoading=$("viewerLoading"),viewerName=$("viewerName"),viewerMeta=$("viewerMeta"),closeViewer=$("closeViewer"),viewerPrev=$("viewerPrev"),viewerNext=$("viewerNext"),viewerPrevBottom=$("viewerPrevBottom"),viewerNextBottom=$("viewerNextBottom"),viewerDownload=$("viewerDownload"),viewerDownloadTop=$("viewerDownloadTop");

const CHUNK=8*1024*1024;
let user="",selected=[],allFiles=[],visibleFiles=[],filter="all",viewerIndex=0,isUploading=false;

function esc(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmt(b){if(b<1024)return b+" B";if(b<1048576)return(b/1024).toFixed(0)+" KB";if(b<1073741824)return(b/1048576).toFixed(1)+" MB";return(b/1073741824).toFixed(2)+" GB"}
function fkey(f){return [f.name,f.size,f.lastModified,f.type].join("|")}
function setNotice(type,html){notice.className="notice show "+type;notice.innerHTML=html}
function clearNotice(){notice.className="notice";notice.innerHTML=""}
function showGate(v=""){gate.classList.add("show");gateUser.value=v;setTimeout(()=>gateUser.focus(),60)}
function hideGate(){gate.classList.remove("show")}
async function session(){
  try{const r=await fetch("/api/session");const j=await r.json();if(j.authenticated){user=j.user;currentUser.textContent=user;hideGate();await refresh();return}}catch{}
  showGate()
}
async function login(){
  const name=gateUser.value.trim();gateError.textContent="";
  if(name.length<2){gateError.textContent="Escribe al menos 2 caracteres.";return}
  enterBtn.disabled=true;
  try{const r=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user:name})});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se pudo ingresar");user=j.user;currentUser.textContent=user;hideGate();await refresh()}catch(e){gateError.textContent=e.message||"No se pudo ingresar"}finally{enterBtn.disabled=false}
}
enterBtn.onclick=login;gateUser.onkeydown=e=>{if(e.key==="Enter")login()};
changeUser.onclick=async()=>{if(isUploading)return;await fetch("/api/session/logout",{method:"POST"});const old=user;user="";currentUser.textContent="—";showGate(old)};

function addFiles(list){
  if(isUploading)return;
  let dup=0;
  Array.from(list||[]).forEach(f=>{
    if(!(f.type.startsWith("image/")||f.type.startsWith("video/")))return;
    if(selected.some(x=>fkey(x)===fkey(f))){dup++;return}
    selected.push(f)
  });
  if(dup)setNotice("warn","<b>"+dup+" duplicado"+(dup===1?"":"s")+" omitido"+(dup===1?"":"s")+".</b> Ya estaba en la cola.");
  renderQueue()
}
galleryInput.onchange=()=>{addFiles(galleryInput.files);galleryInput.value=""};
cameraInput.onchange=()=>{addFiles(cameraInput.files);cameraInput.value=""};
clearQueue.onclick=()=>{if(isUploading)return;selected=[];renderQueue();clearNotice()};

function renderQueue(){
  queue.innerHTML="";
  selected.forEach((f,i)=>{
    const el=document.createElement("div");el.className="qitem";el.id="q-"+i;
    el.innerHTML='<div class="qtop"><div class="qicon">'+(f.type.startsWith("video/")?"🎬":"🖼️")+'</div><div class="qmain"><div class="qname">'+esc(f.name)+'</div><div class="qmeta">'+fmt(f.size)+'</div></div><button class="iconbtn remove">✕</button></div><div class="progress"><div class="bar"></div></div><div class="qfoot"><span class="status">En espera</span><span class="sent">0 / '+fmt(f.size)+'</span></div>';
    el.querySelector(".remove").onclick=()=>{if(isUploading)return;selected.splice(i,1);renderQueue()};
    queue.appendChild(el)
  });
  const total=selected.reduce((a,f)=>a+f.size,0);
  queueSummary.classList.toggle("show",selected.length>0);
  queueCount.textContent=selected.length+" archivo"+(selected.length===1?"":"s");
  queueSize.textContent=selected.length?fmt(total)+" en total":"";
  bottomTitle.textContent=selected.length?"Listo para revisar y subir":"Selecciona fotos o videos";
  bottomSub.textContent=selected.length?selected.length+" archivo"+(selected.length===1?"":"s")+" · "+fmt(total):"No hay archivos en la cola";
  uploadBtn.textContent=selected.length?"Subir "+selected.length:"Subir";
  uploadBtn.disabled=!selected.length||isUploading
}
function fileProgress(i,p,state,sent,total,kind=""){
  const root=$("q-"+i);if(!root)return;
  root.querySelector(".bar").style.width=Math.max(0,Math.min(100,p))+"%";
  const st=root.querySelector(".status");st.textContent=state;st.className="status "+kind;
  root.querySelector(".sent").textContent=fmt(sent)+" / "+fmt(total)+" · "+Math.round(p)+"%"
}
function totalProgress(done,total,label){
  const p=total?Math.min(100,done/total*100):0;
  overall.classList.add("show");overallText.textContent=label;overallPercent.textContent=Math.round(p)+"%";overallFill.style.width=p+"%";
  bottomTitle.textContent=label;bottomSub.textContent=Math.round(p)+"% completado";
  uploadBtn.textContent=Math.round(p)+"%"
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function sendPart(opts){
  let last;
  for(let a=1;a<=5;a++){
    try{const r=await fetch("/api/upload-chunk",opts);if(r.status===401){showGate(user);throw new Error("Usuario requerido")}if(!r.ok)throw new Error(await r.text());return await r.json()}
    catch(e){last=e;await sleep(600*a)}
  }
  throw last
}
async function uploadOne(file,i,base,totalAll){
  fileProgress(i,0,"Verificando…",0,file.size);
  try{
    const pre=await fetch("/api/precheck",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,size:file.size,lastModified:file.lastModified})});
    if(pre.ok){const pj=await pre.json();if(pj.duplicate){fileProgress(i,100,"Duplicado · omitido",file.size,file.size,"ok");return{duplicate:true}}}
  }catch{}
  const id=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(user+"|"+file.name+"|"+file.size+"|"+file.lastModified)).then(b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,48));
  const total=Math.max(1,Math.ceil(file.size/CHUNK));let done=new Set();
  try{const r=await fetch("/api/upload-status/"+id);if(r.ok){const j=await r.json();done=new Set(j.chunks||[])}}catch{}
  let sent=Math.min(file.size,done.size*CHUNK);
  for(let part=0;part<total;part++){
    if(done.has(part))continue;
    const start=part*CHUNK,end=Math.min(file.size,(part+1)*CHUNK),blob=file.slice(start,end);
    fileProgress(i,file.size?sent/file.size*100:0,"Subiendo…",sent,file.size);
    const resp=await sendPart({method:"POST",headers:{"Content-Type":"application/octet-stream","x-upload-id":id,"x-file-name":encodeURIComponent(file.name),"x-file-size":String(file.size),"x-file-type":encodeURIComponent(file.type||""),"x-file-last-modified":String(file.lastModified||0),"x-chunk-index":String(part),"x-total-chunks":String(total)},body:blob});
    sent=end;const p=file.size?sent/file.size*100:100;
    fileProgress(i,p,p>=100?"Comprobando…":"Subiendo…",sent,file.size);
    totalProgress(base+sent,totalAll,"Subiendo "+(i+1)+" de "+selected.length);
    if(resp&&resp.duplicate){fileProgress(i,100,"Duplicado · omitido",file.size,file.size,"ok");return{duplicate:true}}
  }
  fileProgress(i,100,"Subido ✓",file.size,file.size,"ok");return{duplicate:false}
}
uploadBtn.onclick=async()=>{
  if(!user){showGate();return}if(!selected.length||isUploading)return;
  isUploading=true;clearNotice();galleryInput.disabled=true;cameraInput.disabled=true;clearQueue.disabled=true;uploadBtn.disabled=true;
  const batch=selected.slice(),totalAll=batch.reduce((a,f)=>a+f.size,0);let base=0,up=0,dup=0,err=0;const failed=[];
  totalProgress(0,totalAll,"Preparando "+batch.length+" archivo"+(batch.length===1?"":"s"));
  for(let i=0;i<batch.length;i++){
    try{const r=await uploadOne(batch[i],i,base,totalAll);r&&r.duplicate?dup++:up++}
    catch(e){err++;failed.push(batch[i]);fileProgress(i,0,"Error · pendiente",0,batch[i].size,"err")}
    base+=batch[i].size;totalProgress(base,totalAll,"Procesados "+(i+1)+" de "+batch.length)
  }
  await refresh();
  let msg="<b>Proceso terminado.</b><br>✓ "+up+" subido"+(up===1?"":"s");if(dup)msg+=" · ↺ "+dup+" duplicado"+(dup===1?"":"s");if(err)msg+=" · ⚠ "+err+" pendiente"+(err===1?"":"s");
  setNotice(err?"warn":"ok",msg);
  isUploading=false;galleryInput.disabled=false;cameraInput.disabled=false;clearQueue.disabled=false;
  setTimeout(()=>{selected=failed;renderQueue();overall.classList.remove("show");if(failed.length){bottomTitle.textContent="Hay archivos pendientes";bottomSub.textContent="Puedes reintentar la carga";uploadBtn.textContent="Reintentar"}},1800)
};

async function refresh(){
  if(!user)return;
  try{const r=await fetch("/api/files");if(r.status===401){showGate();return}allFiles=await r.json();renderGallery()}catch{galleryBox.innerHTML='<div class="media-card" style="padding:12px;font-size:11px;color:var(--muted)">No se pudo cargar la galería.</div>'}
}
function renderGallery(){
  const q=search.value.trim().toLowerCase();
  visibleFiles=allFiles.filter(x=>{
    if(q&&!((x.originalName+" "+x.userName).toLowerCase().includes(q)))return false;
    if(filter==="image"&&x.kind!=="image")return false;
    if(filter==="video"&&x.kind!=="video")return false;
    if(filter==="mine"&&x.userName!==user)return false;
    return true
  });
  galleryBox.innerHTML="";
  if(!visibleFiles.length){galleryBox.innerHTML='<div class="media-card" style="padding:12px;font-size:11px;color:var(--muted)">No hay recuerdos en este filtro.</div>';return}
  visibleFiles.forEach((x,i)=>{
    const card=document.createElement("article");card.className="media-card";
    const visual=x.kind==="image"?'<img loading="lazy" src="'+x.previewUrl+'" alt="">':'<div class="video-poster"><span class="play">▶</span></div>';
    card.innerHTML='<div class="thumb" data-i="'+i+'">'+visual+'<span class="badge">'+(x.kind==="video"?"VIDEO":"FOTO")+'</span></div><div class="media-info"><div class="media-name">'+esc(x.originalName)+'</div><div class="media-sub">'+esc(x.userName)+' · '+fmt(x.size)+'</div><div class="media-actions"><button class="btn ghost open" data-i="'+i+'">Ver</button><a class="btn primary" href="'+x.downloadUrl+'">Descargar</a></div></div>';
    card.querySelectorAll("[data-i]").forEach(el=>el.onclick=()=>openViewer(Number(el.dataset.i)));
    galleryBox.appendChild(card)
  })
}
document.querySelectorAll(".chip").forEach(ch=>ch.onclick=()=>{
  document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));ch.classList.add("active");filter=ch.dataset.filter;renderGallery()
});
search.oninput=renderGallery;

function openViewer(i){
  if(!visibleFiles.length)return;viewerIndex=(i+visibleFiles.length)%visibleFiles.length;const x=visibleFiles[viewerIndex];
  viewer.classList.add("show");document.body.style.overflow="hidden";viewerName.textContent=x.originalName;viewerMeta.textContent=x.userName+" · "+fmt(x.size);viewerDownload.href=x.downloadUrl;viewerDownloadTop.href=x.downloadUrl;viewerLoading.classList.remove("hide");
  viewerMedia.querySelectorAll("img,video").forEach(el=>el.remove());let m;
  if(x.kind==="video"){m=document.createElement("video");m.controls=true;m.playsInline=true;m.preload="metadata";m.src=x.previewUrl;m.onloadedmetadata=()=>viewerLoading.classList.add("hide")}
  else{m=document.createElement("img");m.src=x.previewUrl;m.onload=()=>viewerLoading.classList.add("hide")}
  viewerMedia.insertBefore(m,viewerPrev)
}
function closeView(){viewer.classList.remove("show");document.body.style.overflow="";const v=viewerMedia.querySelector("video");if(v){v.pause();v.removeAttribute("src");v.load()}}
function move(d){openViewer(viewerIndex+d)}
closeViewer.onclick=closeView;viewerPrev.onclick=()=>move(-1);viewerNext.onclick=()=>move(1);viewerPrevBottom.onclick=()=>move(-1);viewerNextBottom.onclick=()=>move(1);
let tx=null;viewerMedia.addEventListener("touchstart",e=>tx=e.changedTouches[0].clientX,{passive:true});viewerMedia.addEventListener("touchend",e=>{if(tx===null)return;const d=e.changedTouches[0].clientX-tx;if(Math.abs(d)>70)move(d>0?-1:1);tx=null},{passive:true});
document.addEventListener("keydown",e=>{if(!viewer.classList.contains("show"))return;if(e.key==="Escape")closeView();if(e.key==="ArrowLeft")move(-1);if(e.key==="ArrowRight")move(1)});

session();