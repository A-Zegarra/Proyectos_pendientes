const $=id=>document.getElementById(id);
const gallery=$("gallery"),search=$("search"),totalCount=$("totalCount"),photoCount=$("photoCount"),videoCount=$("videoCount");
const viewer=$("viewer"),viewerMedia=$("viewerMedia"),viewerLoader=$("viewerLoader"),viewerName=$("viewerName"),viewerMeta=$("viewerMeta"),closeViewer=$("closeViewer"),prevViewer=$("prevViewer"),nextViewer=$("nextViewer"),viewerDownload=$("viewerDownload"),viewerDownloadTop=$("viewerDownloadTop"),deleteFromViewer=$("deleteFromViewer");
const confirmDelete=$("confirmDelete"),confirmPreview=$("confirmPreview"),confirmFile=$("confirmFile"),cancelDelete=$("cancelDelete"),confirmDeleteBtn=$("confirmDeleteBtn"),toast=$("toast");
let files=[],visible=[],filter="all",viewerIndex=0,pendingDelete=null;

function esc(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmt(b){if(b<1024)return b+" B";if(b<1048576)return(b/1024).toFixed(0)+" KB";if(b<1073741824)return(b/1048576).toFixed(1)+" MB";return(b/1073741824).toFixed(2)+" GB"}
function date(v){try{return new Date(v).toLocaleString("es-PE")}catch{return""}}
function showToast(msg){toast.textContent=msg;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2200)}

async function load(){
  const r=await fetch("/api/admin/files",{cache:"no-store"});
  if(r.status===401){location.replace("/novios");return}
  if(!r.ok){gallery.innerHTML='<div class="empty">No se pudo cargar la galería.</div>';return}
  files=await r.json();
  totalCount.textContent=files.length;
  photoCount.textContent=files.filter(x=>x.kind==="image").length;
  videoCount.textContent=files.filter(x=>x.kind==="video").length;
  render()
}

function render(){
  const q=search.value.trim().toLowerCase();
  visible=files.filter(x=>{
    if(filter!=="all"&&x.kind!==filter)return false;
    if(q&&!((String(x.originalName)+" "+String(x.userName)).toLowerCase().includes(q)))return false;
    return true
  });
  gallery.innerHTML="";
  if(!visible.length){gallery.innerHTML='<div class="empty">No hay archivos en este filtro.</div>';return}
  visible.forEach((x,i)=>{
    const card=document.createElement("article");card.className="card";
    const visual=x.kind==="image"
      ?'<img loading="lazy" src="/api/admin/files/'+x.id+'/preview" alt="">'
      :'<div class="video"><span class="play">▶</span></div>';
    card.innerHTML='<div class="thumb" data-open="'+i+'">'+visual+'<span class="badge">'+(x.kind==="video"?"VIDEO":"FOTO")+'</span></div><div class="info"><div class="name">'+esc(x.originalName)+'</div><div class="meta">'+esc(x.userName)+' · '+fmt(x.size)+'</div><div class="meta">'+date(x.uploadedAt)+'</div><div class="actions"><button class="btn view" data-open="'+i+'">Ver</button><a class="btn download" href="/api/admin/files/'+x.id+'/download">Descargar</a><button class="btn delete" data-delete="'+i+'">🗑</button></div></div>';
    card.querySelectorAll("[data-open]").forEach(el=>el.onclick=()=>openViewer(Number(el.dataset.open)));
    card.querySelector("[data-delete]").onclick=()=>askDelete(visible[Number(card.querySelector("[data-delete]").dataset.delete)]);
    gallery.appendChild(card)
  })
}

function openViewer(i){
  if(!visible.length)return;
  viewerIndex=(i+visible.length)%visible.length;
  const x=visible[viewerIndex];
  viewer.classList.add("show");document.body.style.overflow="hidden";
  viewerName.textContent=x.originalName;
  viewerMeta.textContent=x.userName+" · "+fmt(x.size)+" · "+date(x.uploadedAt);
  viewerDownload.href="/api/admin/files/"+x.id+"/download";
  viewerDownloadTop.href="/api/admin/files/"+x.id+"/download";
  deleteFromViewer.onclick=()=>askDelete(x);
  viewerLoader.classList.remove("hide");
  viewerMedia.querySelectorAll("img,video").forEach(el=>el.remove());
  let m;
  if(x.kind==="video"){
    m=document.createElement("video");m.controls=true;m.playsInline=true;m.preload="metadata";m.src="/api/admin/files/"+x.id+"/preview";m.onloadedmetadata=()=>viewerLoader.classList.add("hide")
  }else{
    m=document.createElement("img");m.src="/api/admin/files/"+x.id+"/preview";m.alt=x.originalName;m.onload=()=>viewerLoader.classList.add("hide")
  }
  viewerMedia.insertBefore(m,prevViewer)
}
function closeView(){viewer.classList.remove("show");document.body.style.overflow="";const v=viewerMedia.querySelector("video");if(v){v.pause();v.removeAttribute("src");v.load()}}
function move(d){openViewer(viewerIndex+d)}
closeViewer.onclick=closeView;prevViewer.onclick=()=>move(-1);nextViewer.onclick=()=>move(1);

function askDelete(x){
  pendingDelete=x;
  confirmDelete.classList.add("show");
  confirmPreview.innerHTML=x.kind==="image"
    ?'<img src="/api/admin/files/'+x.id+'/preview" alt="">'
    :'<div class="video">🎬 VIDEO</div>';
  confirmFile.innerHTML='<b>'+esc(x.originalName)+'</b><br>'+esc(x.userName)+' · '+fmt(x.size);
}
cancelDelete.onclick=()=>{pendingDelete=null;confirmDelete.classList.remove("show")};
confirmDeleteBtn.onclick=async()=>{
  if(!pendingDelete)return;
  confirmDeleteBtn.disabled=true;confirmDeleteBtn.textContent="Eliminando…";
  try{
    const r=await fetch("/api/admin/files/"+pendingDelete.id+"/delete",{method:"POST"});
    if(!r.ok)throw new Error("No se pudo eliminar");
    const id=pendingDelete.id;
    pendingDelete=null;confirmDelete.classList.remove("show");
    files=files.filter(x=>x.id!==id);
    if(viewer.classList.contains("show"))closeView();
    totalCount.textContent=files.length;photoCount.textContent=files.filter(x=>x.kind==="image").length;videoCount.textContent=files.filter(x=>x.kind==="video").length;
    render();showToast("Archivo eliminado")
  }catch(e){showToast(e.message||"Error al eliminar")}
  finally{confirmDeleteBtn.disabled=false;confirmDeleteBtn.textContent="Sí, eliminar"}
};

document.querySelectorAll(".chip").forEach(ch=>ch.onclick=()=>{document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));ch.classList.add("active");filter=ch.dataset.filter;render()});
search.oninput=render;
let tx=null;viewerMedia.addEventListener("touchstart",e=>tx=e.changedTouches[0].clientX,{passive:true});viewerMedia.addEventListener("touchend",e=>{if(tx===null)return;const d=e.changedTouches[0].clientX-tx;if(Math.abs(d)>70)move(d>0?-1:1);tx=null},{passive:true});
document.addEventListener("keydown",e=>{if(viewer.classList.contains("show")){if(e.key==="Escape")closeView();if(e.key==="ArrowLeft")move(-1);if(e.key==="ArrowRight")move(1)}});
load();