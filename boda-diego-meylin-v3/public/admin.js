const list=document.getElementById("adminList");
const search=document.getElementById("adminSearch");
let files=[];
function esc(v){return String(v||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fmt(b){return b<1048576?(b/1024).toFixed(0)+" KB":b<1073741824?(b/1048576).toFixed(1)+" MB":(b/1073741824).toFixed(2)+" GB"}
async function load(){
  const r=await fetch("/api/admin/files");
  if(r.status===401){location.href="/novios";return}
  files=await r.json();render();
}
function render(){
  const q=search.value.trim().toLowerCase();
  const shown=files.filter(function(x){return !q||(String(x.originalName)+" "+String(x.userName)).toLowerCase().includes(q)});
  list.innerHTML="";
  if(!shown.length){list.innerHTML='<div class="admin-card muted">No hay archivos.</div>';return}
  shown.forEach(function(x){
    const el=document.createElement("div");el.className="admin-card";
    el.innerHTML='<div class="filename">'+esc(x.originalName)+'</div><div class="meta">Subido por <b>'+esc(x.userName)+'</b> · '+fmt(x.size)+'</div><div class="admin-actions"><a class="btn green" href="/api/admin/files/'+x.id+'/download">Descargar</a><button class="btn danger">Eliminar</button></div>';
    el.querySelector("button").onclick=async function(){if(!confirm("¿Eliminar este archivo del HP?"))return;await fetch("/api/admin/files/"+x.id+"/delete",{method:"POST"});load()};
    list.appendChild(el);
  });
}
search.oninput=render;load();