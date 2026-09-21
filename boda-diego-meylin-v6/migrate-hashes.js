const fs=require("fs");
const fsp=fs.promises;
const path=require("path");
const crypto=require("crypto");

const DATA_DIR=process.env.DATA_DIR||path.join(process.env.HOME||".","boda-media","diego-meylin");
const UPLOADS_DIR=path.join(DATA_DIR,"uploads");
const DB_PATH=path.join(DATA_DIR,"db.json");

function hashFile(filePath){
  return new Promise((resolve,reject)=>{
    const h=crypto.createHash("sha256");
    const stream=fs.createReadStream(filePath);
    stream.on("error",reject);
    stream.on("data",chunk=>h.update(chunk));
    stream.on("end",()=>resolve(h.digest("hex")));
  });
}
function writeDB(db){
  const tmp=DB_PATH+".hashing.tmp";
  fs.writeFileSync(tmp,JSON.stringify(db,null,2));
  fs.renameSync(tmp,DB_PATH);
}
(async()=>{
  if(!fs.existsSync(DB_PATH)){
    console.log("No existe db.json; no hay archivos antiguos que indexar.");
    return;
  }
  const db=JSON.parse(fs.readFileSync(DB_PATH,"utf8"));
  if(!Array.isArray(db.files))db.files=[];
  const pending=db.files.filter(x=>!x.sha256);
  if(!pending.length){
    console.log("Hashes existentes: OK");
    return;
  }
  console.log("Indexando "+pending.length+" archivo(s) existente(s) para detectar duplicados...");
  let done=0,missing=0;
  for(const item of pending){
    const full=path.join(UPLOADS_DIR,String(item.storedName||""));
    if(!item.storedName||!fs.existsSync(full)){
      missing++;
      console.log("["+String(done+1)+"/"+pending.length+"] No encontrado: "+String(item.originalName||item.storedName||"archivo"));
      done++;
      continue;
    }
    try{
      item.sha256=await hashFile(full);
      const st=await fsp.stat(full);
      if(!item.size)item.size=st.size;
      done++;
      console.log("["+done+"/"+pending.length+"] OK: "+String(item.originalName||item.storedName));
      writeDB(db);
    }catch(err){
      done++;
      console.log("["+done+"/"+pending.length+"] Error: "+String(item.originalName||item.storedName)+" - "+err.message);
    }
  }
  writeDB(db);
  console.log("Indexación terminada. Faltantes: "+missing);
})().catch(err=>{console.error(err);process.exit(1)});
