const express = require("express");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3010);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const CHUNKS_DIR = path.join(DATA_DIR, "chunks");
const DB_PATH = path.join(DATA_DIR, "db.json");

const ADMIN_USER = process.env.ADMIN_USER || "novios";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cambiar";
const SESSION_SECRET = process.env.SESSION_SECRET || "secret";
const MAX_FILE_SIZE = 20 * 1024 * 1024 * 1024;

const ALLOWED_EXT = new Set([
  ".jpg",".jpeg",".png",".webp",".heic",".heif",".gif",".avif",
  ".mp4",".mov",".m4v",".3gp",".webm",".mkv"
]);

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ files: [] }, null, 2));

const adminSessions = new Map();

function nowIso(){ return new Date().toISOString(); }
function readDB(){
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!Array.isArray(db.files)) db.files = [];
    return db;
  } catch {
    return { files: [] };
  }
}
function writeDB(db){
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}
function makeToken(bytes = 16){ return crypto.randomBytes(bytes).toString("hex"); }
function sanitizeUser(value){
  return String(value || "")
    .normalize("NFKC")
    .replace(/[<>"'&/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}
function decodeHeader(v){
  try { return decodeURIComponent(String(v || "")); } catch { return String(v || ""); }
}
function cleanFileName(value){
  const raw = decodeHeader(value);
  const base = path.basename(raw)
    .normalize("NFKD")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(-180);
  return base || "archivo";
}
function safeUploadId(value){
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96);
}
function kindOf(mime, ext){
  if (String(mime || "").startsWith("image/")) return "image";
  if (String(mime || "").startsWith("video/")) return "video";
  return [".jpg",".jpeg",".png",".webp",".heic",".heif",".gif",".avif"].includes(ext) ? "image" : "video";
}
function guestUser(req){
  return sanitizeUser(req.cookies && req.cookies.boda_user || "");
}
function requireGuestApi(req, res, next){
  const user = guestUser(req);
  if (!user) return res.status(401).json({ error: "usuario_requerido" });
  req.guestUser = user;
  next();
}
function createAdminSession(){
  const sid = crypto.createHmac("sha256", SESSION_SECRET)
    .update(String(Date.now()) + "-" + Math.random())
    .digest("hex");
  adminSessions.set(sid, Date.now() + 7 * 24 * 60 * 60 * 1000);
  return sid;
}
function isAdmin(req){
  const sid = req.cookies && req.cookies.boda_admin;
  if (!sid) return false;
  const expires = adminSessions.get(sid);
  if (!expires) return false;
  if (expires < Date.now()) {
    adminSessions.delete(sid);
    return false;
  }
  return true;
}
function requireAdminApi(req, res, next){
  if (!isAdmin(req)) return res.status(401).json({ error: "No autorizado" });
  next();
}
async function mergeChunks(dir, finalPath, total){
  const out = fs.createWriteStream(finalPath, { flags: "wx" });
  try {
    for (let i = 0; i < total; i++) {
      const part = path.join(dir, String(i).padStart(5, "0") + ".part");
      await new Promise((resolve, reject) => {
        const input = fs.createReadStream(part);
        input.on("error", reject);
        input.on("end", resolve);
        input.pipe(out, { end: false });
      });
    }
    await new Promise((resolve, reject) => out.end(err => err ? reject(err) : resolve()));
  } catch (err) {
    out.destroy();
    try { await fsp.unlink(finalPath); } catch {}
    throw err;
  }
}

async function sha256File(filePath){
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(filePath);
    input.on("error", reject);
    input.on("data", chunk => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/static", express.static(path.join(__dirname, "public"), { maxAge: "10m" }));

app.get("/robots.txt", (req, res) => res.type("text").send("User-agent: *\nDisallow: /\n"));
app.get("/health", (req, res) => res.json({ ok: true, app: "boda-diego-meylin-v6" }));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/api/session", (req, res) => {
  const user = guestUser(req);
  res.json({ authenticated: !!user, user: user || null });
});
app.post("/api/session", (req, res) => {
  const user = sanitizeUser(req.body && req.body.user);
  if (user.length < 2) return res.status(400).json({ error: "Escribe un nombre o usuario válido" });
  res.cookie("boda_user", user, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
  res.json({ ok: true, user: user });
});
app.post("/api/session/logout", (req, res) => {
  res.clearCookie("boda_user");
  res.json({ ok: true });
});

app.get("/api/stats", requireGuestApi, (req, res) => {
  const db = readDB();
  res.json({ total: db.files.length });
});

app.get("/api/files", requireGuestApi, (req, res) => {
  const db = readDB();
  const files = db.files.slice()
    .sort((a,b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")))
    .map(x => ({
      id: x.id,
      originalName: x.originalName,
      userName: x.userName,
      size: x.size,
      kind: x.kind,
      uploadedAt: x.uploadedAt,
      token: x.publicToken,
      downloadUrl: "/download/" + x.publicToken,
      previewUrl: "/media/" + x.publicToken
    }));
  res.json(files);
});

app.get("/media/:token", (req, res) => {
  if (!guestUser(req)) return res.status(401).end();
  const db = readDB();
  const item = db.files.find(x => x.publicToken === req.params.token);
  if (!item) return res.status(404).end();
  const full = path.join(UPLOADS_DIR, item.storedName);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(full);
});

app.get("/download/:token", (req, res) => {
  if (!guestUser(req)) {
    return res.redirect("/?next=" + encodeURIComponent("/download/" + String(req.params.token || "")));
  }
  const db = readDB();
  const item = db.files.find(x => x.publicToken === req.params.token);
  if (!item) return res.status(404).send("Archivo no disponible");
  const full = path.join(UPLOADS_DIR, item.storedName);
  if (!fs.existsSync(full)) return res.status(404).send("Archivo no encontrado");
  res.download(full, item.originalName);
});

app.post("/api/precheck", requireGuestApi, (req, res) => {
  const originalName = cleanFileName(req.body && req.body.name);
  const size = Number(req.body && req.body.size || 0);
  const lastModified = Number(req.body && req.body.lastModified || 0);
  const db = readDB();

  const match = db.files.find(x =>
    Number(x.size || 0) === size &&
    String(x.originalName || "") === originalName &&
    lastModified > 0 &&
    Number(x.clientLastModified || 0) === lastModified
  );

  if (!match) return res.json({ duplicate: false });
  res.json({
    duplicate: true,
    existing: {
      id: match.id,
      originalName: match.originalName,
      userName: match.userName,
      uploadedAt: match.uploadedAt
    }
  });
});

app.get("/api/upload-status/:id", requireGuestApi, async (req, res) => {
  const id = safeUploadId(req.params.id);
  if (!id) return res.status(400).json({ error: "id" });
  const dir = path.join(CHUNKS_DIR, id);
  try {
    const names = await fsp.readdir(dir);
    const chunks = names.filter(x => /^\d{5}\.part$/.test(x)).map(x => Number(x.slice(0,5))).sort((a,b) => a-b);
    res.json({ chunks: chunks });
  } catch {
    res.json({ chunks: [] });
  }
});

app.post("/api/upload-chunk", requireGuestApi, express.raw({ type: "application/octet-stream", limit: "9mb" }), async (req, res) => {
  try {
    const uploadId = safeUploadId(req.headers["x-upload-id"]);
    const fileName = cleanFileName(req.headers["x-file-name"]);
    const fileSize = Number(req.headers["x-file-size"] || 0);
    const mimeType = decodeHeader(req.headers["x-file-type"]);
    const chunkIndex = Number(req.headers["x-chunk-index"]);
    const totalChunks = Number(req.headers["x-total-chunks"]);
    const clientLastModified = Number(req.headers["x-file-last-modified"] || 0);
    const userName = req.guestUser;

    if (!uploadId || !fileName) return res.status(400).json({ error: "Datos incompletos" });
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return res.status(413).json({ error: "El archivo excede el límite permitido" });
    }
    if (!Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks) || chunkIndex < 0 || totalChunks < 1 || chunkIndex >= totalChunks || totalChunks > 3000) {
      return res.status(400).json({ error: "Partes inválidas" });
    }

    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_EXT.has(ext) && !String(mimeType).startsWith("image/") && !String(mimeType).startsWith("video/")) {
      return res.status(415).json({ error: "Tipo de archivo no permitido" });
    }

    const dir = path.join(CHUNKS_DIR, uploadId);
    await fsp.mkdir(dir, { recursive: true });
    const partPath = path.join(dir, String(chunkIndex).padStart(5, "0") + ".part");
    await fsp.writeFile(partPath, req.body);

    let complete = true;
    for (let i = 0; i < totalChunks; i++) {
      try { await fsp.access(path.join(dir, String(i).padStart(5, "0") + ".part")); }
      catch { complete = false; break; }
    }
    if (!complete) return res.json({ ok: true, complete: false });

    const db = readDB();
    const existing = db.files.find(x => x.uploadId === uploadId);
    if (existing) {
      await fsp.rm(dir, { recursive: true, force: true });
      return res.json({ ok: true, complete: true, duplicate: true });
    }

    const storedName = nowIso().replace(/[:.]/g, "-") + "_" + makeToken(4) + "_" + fileName;
    const finalPath = path.join(UPLOADS_DIR, storedName);
    await mergeChunks(dir, finalPath, totalChunks);

    const stat = await fsp.stat(finalPath);
    const fileHash = await sha256File(finalPath);

    // Re-read immediately before committing. This makes duplicate checks
    // work even when another guest finishes an upload while this file hashes.
    const latestDB = readDB();
    const duplicate = latestDB.files.find(x => x.sha256 && x.sha256 === fileHash);

    if (duplicate) {
      await fsp.unlink(finalPath).catch(() => {});
      await fsp.rm(dir, { recursive: true, force: true });
      return res.json({
        ok: true,
        complete: true,
        duplicate: true,
        existing: {
          id: duplicate.id,
          originalName: duplicate.originalName,
          userName: duplicate.userName,
          uploadedAt: duplicate.uploadedAt
        }
      });
    }

    const item = {
      id: makeToken(8),
      uploadId: uploadId,
      publicToken: makeToken(12),
      userName: userName,
      originalName: fileName,
      storedName: storedName,
      mimeType: mimeType,
      size: stat.size,
      kind: kindOf(mimeType, ext),
      sha256: fileHash,
      clientLastModified: Number.isFinite(clientLastModified) ? clientLastModified : 0,
      uploadedAt: nowIso()
    };
    latestDB.files.push(item);
    writeDB(latestDB);
    await fsp.rm(dir, { recursive: true, force: true });
    res.json({ ok: true, complete: true, duplicate: false, file: { id: item.id, token: item.publicToken } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo completar la subida" });
  }
});

app.get("/novios", (req, res) => {
  if (isAdmin(req)) return res.sendFile(path.join(__dirname, "public", "admin.html"));
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.post("/novios/login", (req, res) => {
  const username = String(req.body && req.body.username || "");
  const password = String(req.body && req.body.password || "");
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const sid = createAdminSession();
    res.cookie("boda_admin", sid, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.redirect("/novios");
  }
  res.redirect("/novios?error=1");
});
app.get("/novios/logout", (req, res) => {
  const sid = req.cookies && req.cookies.boda_admin;
  if (sid) adminSessions.delete(sid);
  res.clearCookie("boda_admin");
  res.redirect("/novios");
});

app.get("/api/admin/files", requireAdminApi, (req, res) => {
  const db = readDB();
  res.json(db.files.slice().sort((a,b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || ""))));
});
app.get("/api/admin/files/:id/download", requireAdminApi, (req, res) => {
  const db = readDB();
  const item = db.files.find(x => x.id === req.params.id);
  if (!item) return res.status(404).send("No encontrado");
  const full = path.join(UPLOADS_DIR, item.storedName);
  if (!fs.existsSync(full)) return res.status(404).send("Archivo no encontrado");
  res.download(full, item.originalName);
});
app.post("/api/admin/files/:id/delete", requireAdminApi, async (req, res) => {
  try {
    const db = readDB();
    const idx = db.files.findIndex(x => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "No encontrado" });
    const item = db.files[idx];
    try { await fsp.unlink(path.join(UPLOADS_DIR, item.storedName)); } catch {}
    db.files.splice(idx, 1);
    writeDB(db);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo eliminar" });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log("Diego & Meylin V6 en http://127.0.0.1:" + PORT);
});
