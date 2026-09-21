const express=require("express");
const fs=require("fs");
const fsp=fs.promises;
const path=require("path");
const crypto=require("crypto");

const app=express();
const PORT=Number(process.env.PORT||3010);
const DATA=process.env.DATA_DIR||path.join(__dirname,"data");
const UP=path.join(DATA,"uploads");
const TMP=path.join(DATA,"chunks");
const ADMIN_USER=process.env.ADMIN_USER||"alvaro";
const ADMIN_PASS=process.env.ADMIN_PASSWORD||"cambiar";
const EXT=new Set([".jpg",".jpeg",".png",".webp",".heic",".heif",".gif",".avif",".mp4",".mov",".m4v",".3gp",".webm",".mkv"]);

fs.mkdirSync(UP,{recursive:true});
fs.mkdirSync(TMP,{recursive:true});

function dec(v){try{return decodeURIComponent(String(v||""))}catch{return String(v||"")}}
function clean(v){
  const x=path.basename(dec(v)).normalize("NFKD").replace(/[^\w.\-() ]+/g,"_").replace(/\s+/g,"_");
  return (x||"archivo").slice(-180);
}
function esc(v){return String(v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function auth(req,res,next){
  const h=req.headers.authorization||"";
  if(h.indexOf("Basic ")!==0){res.set("WWW-Authenticate",'Basic realm="Diego y Meylin"');return res.status(401).send("Autenticacion requerida")}
  try{
    const p=Buffer.from(h.slice(6),"base64").toString().split(":");
    if(p[0]===ADMIN_USER&&p.slice(1).join(":")===ADMIN_PASS)return next();
  }catch(e){}
  res.set("WWW-Authenticate",'Basic realm="Diego y Meylin"');return res.status(401).send("Acceso denegado");
}

app.use(express.raw({type:"application/octet-stream",limit:"7mb"}));

app.get("/",function(req,res){res.sendFile(path.join(__dirname,"index.html"))});
app.get("/health",function(req,res){res.json({ok:true})});
app.get("/robots.txt",function(req,res){res.type("text").send("User-agent: *\nDisallow: /\n")});
app.get("/api/stats",async function(req,res){
  const a=await fsp.readdir(UP,{withFileTypes:true});
  res.json({count:a.filter(function(x){return x.isFile()}).length});
});

app.post("/api/chunk",async function(req,res){
  try{
    const id=String(req.headers["x-upload-id"]||"");
    const name=clean(req.headers["x-file-name"]||"");
    const size=Number(req.headers["x-file-size"]||0);
    const type=dec(req.headers["x-file-type"]||"");
    const idx=Number(req.headers["x-chunk-index"]);
    const total=Number(req.headers["x-total-chunks"]);
    const guest=dec(req.headers["x-guest-name"]||"").slice(0,70);
    if(!/^[A-Za-z0-9-]{8,80}$/.test(id))return res.status(400).json({error:"id"});
    if(!Number.isInteger(idx)||!Number.isInteger(total)||idx<0||total<1||idx>=total||total>3000)return res.status(400).json({error:"partes"});
    if(!Number.isFinite(size)||size<0||size>15*1024*1024*1024)return res.status(413).json({error:"tamano"});
    const ext=path.extname(name).toLowerCase();
    if(!EXT.has(ext)&&!(type.indexOf("image/")===0||type.indexOf("video/")===0))return res.status(415).json({error:"tipo"});
    const dir=path.join(TMP,id);
    await fsp.mkdir(dir,{recursive:true});
    const part=path.join(dir,String(idx).padStart(5,"0")+".part");
    await fsp.writeFile(part,req.body);
    if(idx!==total-1)return res.json({ok:true,complete:false});

    for(let i=0;i<total;i++){
      await fsp.access(path.join(dir,String(i).padStart(5,"0")+".part"));
    }
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    const rnd=crypto.randomBytes(3).toString("hex");
    const finalName=stamp+"_"+rnd+"_"+name;
    const finalPath=path.join(UP,finalName);
    const out=fs.createWriteStream(finalPath,{flags:"wx"});
    for(let i=0;i<total;i++){
      const p=path.join(dir,String(i).padStart(5,"0")+".part");
      await new Promise(function(resolve,reject){
        const input=fs.createReadStream(p);
        input.on("error",reject);
        out.on("error",reject);
        input.on("end",resolve);
        input.pipe(out,{end:false});
      });
    }
    await new Promise(function(resolve,reject){out.end(function(e){if(e)reject(e);else resolve()})});
    await fsp.appendFile(path.join(DATA,"uploads.jsonl"),JSON.stringify({savedAt:new Date().toISOString(),file:finalName,original:name,guest:guest,type:type,size:size})+"\n");
    await fsp.rm(dir,{recursive:true,force:true});
    res.json({ok:true,complete:true});
  }catch(e){console.error(e);res.status(500).json({error:"upload"})}
});

app.get("/admin",auth,async function(req,res){
  const a=(await fsp.readdir(UP,{withFileTypes:true})).filter(function(x){return x.isFile()});
  const rows=[];
  for(const x of a){
    const st=await fsp.stat(path.join(UP,x.name));
    rows.push({name:x.name,size:st.size,time:st.mtimeMs});
  }
  rows.sort(function(a,b){return b.time-a.time});
  let body="";
  for(const x of rows){
    body+="<tr><td>"+esc(x.name)+"</td><td>"+(x.size/1048576).toFixed(1)+" MB</td><td><a href='/media/"+encodeURIComponent(x.name)+"'>Descargar</a></td></tr>";
  }
  res.type("html").send("<!doctype html><meta name='viewport' content='width=device-width'><title>Admin boda</title><style>body{font-family:system-ui;margin:28px;max-width:1100px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}a{color:#7b5054}</style><h1>Diego & Meylin</h1><p>"+rows.length+" archivos guardados en el HP.</p><table><tr><th>Archivo</th><th>Tamano</th><th></th></tr>"+body+"</table>");
});
app.get("/media/:name",auth,function(req,res){
  const name=clean(req.params.name);
  const full=path.join(UP,name);
  if(path.dirname(full)!==UP)return res.status(403).end();
  res.download(full,name);
});

app.listen(PORT,"127.0.0.1",function(){console.log("Boda Diego & Meylin en 127.0.0.1:"+PORT)});
