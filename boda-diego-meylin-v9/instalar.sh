#!/usr/bin/env bash
set -euo pipefail

APP="$HOME/apps/boda-diego-meylin-v2"
BASE="https://raw.githubusercontent.com/A-Zegarra/Proyectos_pendientes/boda-diego-meylin/boda-diego-meylin-v9"

echo "== Diego & Meylin · V9 Galería privada =="

for cmd in curl node pm2 python3; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta $cmd"; exit 1; }
done

[ -d "$APP/public" ] || { echo "No encontré $APP/public"; exit 1; }
[ -f "$APP/server.js" ] || { echo "No encontré $APP/server.js"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$APP/backups/$STAMP"
mkdir -p "$BACKUP"

cp -f "$APP/server.js" "$BACKUP/server.js"
[ -f "$APP/public/admin.html" ] && cp -f "$APP/public/admin.html" "$BACKUP/admin.html"
[ -f "$APP/public/admin-v9.css" ] && cp -f "$APP/public/admin-v9.css" "$BACKUP/admin-v9.css"
[ -f "$APP/public/admin-v9.js" ] && cp -f "$APP/public/admin-v9.js" "$BACKUP/admin-v9.js"

echo "Descargando galería privada..."
curl -fsSL "$BASE/public/admin.html" -o "$APP/public/admin.html"
curl -fsSL "$BASE/public/admin-v9.css" -o "$APP/public/admin-v9.css"
curl -fsSL "$BASE/public/admin-v9.js" -o "$APP/public/admin-v9.js"

node --check "$APP/public/admin-v9.js"

echo "Habilitando vista previa privada..."
python3 - "$APP/server.js" <<'PY'
from pathlib import Path
import sys

p=Path(sys.argv[1])
s=p.read_text(encoding="utf-8")

route='app.get("/api/admin/files/:id/preview"'
if route not in s:
    marker='app.get("/api/admin/files/:id/download", requireAdminApi, (req, res) => {'
    if marker not in s:
        raise SystemExit("No encontré la ruta de descarga administrativa en server.js")

    preview=r'''app.get("/api/admin/files/:id/preview", requireAdminApi, (req, res) => {
  const db = readDB();
  const item = db.files.find(x => x.id === req.params.id);

  if (!item) {
    return res.status(404).send("No encontrado");
  }

  const full = path.join(UPLOADS_DIR, item.storedName);

  if (!fs.existsSync(full)) {
    return res.status(404).send("Archivo no encontrado");
  }

  res.setHeader("Cache-Control", "private, max-age=300");
  return res.sendFile(full);
});

'''
    s=s.replace(marker,preview+marker,1)
    p.write_text(s,encoding="utf-8")
PY

node --check "$APP/server.js"

pm2 restart boda-diego-meylin-v2 --update-env >/dev/null
pm2 save >/dev/null

sleep 2
curl -fsS http://127.0.0.1:3010/health >/dev/null

echo
echo "================================================="
echo " V9 GALERÍA PRIVADA LISTA"
echo "================================================="
echo " https://boda.aliproinv.com/novios"
echo
echo " ✓ Galería visual para fotos y videos"
echo " ✓ 2 columnas en celular"
echo " ✓ Filtros: Todos / Fotos / Videos"
echo " ✓ Buscador por archivo o invitado"
echo " ✓ Vista previa fullscreen"
echo " ✓ Navegación anterior / siguiente"
echo " ✓ Descarga del original"
echo " ✓ Confirmación visual antes de eliminar"
echo " ✓ Contadores de fotos y videos"
echo
echo " Backup:"
echo " $BACKUP"
echo "================================================="
