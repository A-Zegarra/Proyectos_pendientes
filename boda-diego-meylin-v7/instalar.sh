#!/usr/bin/env bash
set -euo pipefail

HOST="boda.aliproinv.com"
APP="$HOME/apps/boda-diego-meylin-v2"
DATA="$HOME/boda-media/diego-meylin"
BASE7="https://raw.githubusercontent.com/A-Zegarra/Proyectos_pendientes/boda-diego-meylin/boda-diego-meylin-v7"
BASE6="https://raw.githubusercontent.com/A-Zegarra/Proyectos_pendientes/boda-diego-meylin/boda-diego-meylin-v6"

echo "== Diego & Meylin · V7 Mobile Pro =="

for cmd in curl node npm pm2; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta $cmd"; exit 1; }
done

mkdir -p "$APP/public" "$APP/backups" "$DATA/uploads" "$DATA/chunks"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$APP/backups/$STAMP"
mkdir -p "$BACKUP"

for f in server.js public/index.html public/styles.css public/app.js; do
  [ -f "$APP/$f" ] && cp -f "$APP/$f" "$BACKUP/$(basename "$f")"
done
[ -f "$DATA/db.json" ] && cp -f "$DATA/db.json" "$BACKUP/db.json"

echo "Descargando interfaz V7 y backend V6..."
curl -fsSL "$BASE6/server.js" -o "$APP/server.js"
curl -fsSL "$BASE6/migrate-hashes.js" -o "$APP/migrate-hashes.js"
curl -fsSL "$BASE7/public/index.html" -o "$APP/public/index.html"
curl -fsSL "$BASE7/public/styles.css" -o "$APP/public/styles.css"
curl -fsSL "$BASE7/public/app.js" -o "$APP/public/app.js"

node --check "$APP/server.js"
node --check "$APP/migrate-hashes.js"
node --check "$APP/public/app.js"

cd "$APP"
[ -f package.json ] || npm init -y >/dev/null 2>&1
npm install express@5.1.0 cookie-parser@1.4.7 --save-exact >/dev/null

echo "Código: OK"
echo "Indexando huellas de archivos existentes..."
pm2 stop boda-diego-meylin-v2 >/dev/null 2>&1 || true
DATA_DIR="$DATA" node "$APP/migrate-hashes.js"

if [ ! -f "$APP/ecosystem.config.cjs" ]; then
  echo "No encontré ecosystem.config.cjs. Ejecuta primero la instalación base de boda."
  exit 1
fi

pm2 restart boda-diego-meylin-v2 --update-env >/dev/null 2>&1 || pm2 start "$APP/ecosystem.config.cjs" >/dev/null
pm2 save >/dev/null

sleep 2
curl -fsS "http://127.0.0.1:3010/health" >/dev/null

echo
echo "================================================="
echo " V7 MOBILE PRO INSTALADA"
echo "================================================="
echo " https://$HOST/"
echo
echo " ✓ Interfaz mobile-first"
echo " ✓ Barra inferior fija para subir"
echo " ✓ Selección → revisión → subida"
echo " ✓ Peso total y cantidad de archivos"
echo " ✓ Progreso por archivo y general"
echo " ✓ Filtros Todos / Fotos / Videos / Míos"
echo " ✓ Visor fullscreen con gestos"
echo " ✓ Duplicados bloqueados en cola y servidor"
echo " ✓ Carga secuencial estable para videos pesados"
echo
echo " Copia de seguridad:"
echo " $BACKUP"
echo "================================================="

if curl -fsS --max-time 20 "https://$HOST/health" >/dev/null 2>&1; then
  echo "Enlace público: OK"
else
  echo "Servicio local: OK. Si ves la versión anterior, cierra Chrome y vuelve a abrir la web."
fi
