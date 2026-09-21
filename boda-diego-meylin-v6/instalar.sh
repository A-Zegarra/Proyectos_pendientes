#!/usr/bin/env bash
set -euo pipefail

HOST="boda.aliproinv.com"
APP="$HOME/apps/boda-diego-meylin-v2"
DATA="$HOME/boda-media/diego-meylin"
BASE6="https://raw.githubusercontent.com/A-Zegarra/Proyectos_pendientes/boda-diego-meylin/boda-diego-meylin-v6"
BASE5="https://raw.githubusercontent.com/A-Zegarra/Proyectos_pendientes/boda-diego-meylin/boda-diego-meylin-v5"

echo "== Diego & Meylin · V6 duplicados + carga =="

for cmd in curl node pm2; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta $cmd"; exit 1; }
done

[ -d "$APP" ] || { echo "No encontré $APP"; exit 1; }
mkdir -p "$APP/public" "$APP/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$APP/backups/$STAMP"
mkdir -p "$BACKUP"

for f in server.js public/app.js public/index.html; do
  [ -f "$APP/$f" ] && cp -f "$APP/$f" "$BACKUP/$(basename "$f")"
done
[ -f "$DATA/db.json" ] && cp -f "$DATA/db.json" "$BACKUP/db.json"

echo "Descargando V6..."
curl -fsSL "$BASE6/server.js" -o "$APP/server.js"
curl -fsSL "$BASE6/public/app.js" -o "$APP/public/app.js"
curl -fsSL "$BASE6/public/index.html" -o "$APP/public/index.html"
curl -fsSL "$BASE6/migrate-hashes.js" -o "$APP/migrate-hashes.js"

# Asegura los estilos V5 si por alguna razón no existen.
if [ ! -s "$APP/public/styles.css" ]; then
  curl -fsSL "$BASE5/public/styles.css" -o "$APP/public/styles.css"
fi

node --check "$APP/server.js"
node --check "$APP/public/app.js"
node --check "$APP/migrate-hashes.js"

echo "Código: OK"
echo "Preparando huellas SHA-256 de archivos existentes..."
echo "(Solo se hace una vez por archivo; videos grandes pueden tardar un poco.)"

pm2 stop boda-diego-meylin-v2 >/dev/null 2>&1 || true

if ! DATA_DIR="$DATA" node "$APP/migrate-hashes.js"; then
  echo "Falló la indexación de hashes. Reiniciando el servicio para no dejar la web apagada."
  pm2 restart boda-diego-meylin-v2 >/dev/null 2>&1 || pm2 start "$APP/ecosystem.config.cjs" >/dev/null
  exit 1
fi

pm2 restart boda-diego-meylin-v2 --update-env >/dev/null 2>&1 || pm2 start "$APP/ecosystem.config.cjs" >/dev/null
pm2 save >/dev/null

sleep 2
curl -fsS "http://127.0.0.1:3010/health" >/dev/null

echo
echo "================================================="
echo " V6 INSTALADA"
echo "================================================="
echo " https://$HOST/"
echo
echo " ✓ No duplica el mismo archivo en la cola"
echo " ✓ Preverifica archivos ya subidos"
echo " ✓ SHA-256 detecta el mismo contenido aunque cambie el nombre"
echo " ✓ No guarda una segunda copia del duplicado"
echo " ✓ Botón muestra archivo actual y porcentaje"
echo " ✓ Resumen: subidos / duplicados / errores"
echo " ✓ Los errores quedan listos para reintentar"
echo
echo " Copia de seguridad:"
echo " $BACKUP"
echo "================================================="

if curl -fsS --max-time 20 "https://$HOST/health" >/dev/null 2>&1; then
  echo "Enlace público: OK"
else
  echo "Servicio local: OK. Si el navegador conserva la versión anterior, cierra la pestaña y vuelve a abrirla."
fi
