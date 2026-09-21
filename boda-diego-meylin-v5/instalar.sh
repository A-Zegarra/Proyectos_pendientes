#!/usr/bin/env bash
set -euo pipefail

APP="$HOME/apps/boda-diego-meylin-v2"
BASE="https://raw.githubusercontent.com/A-Zegarra/Proyectos_pendientes/boda-diego-meylin/boda-diego-meylin-v5"

echo "== Diego & Meylin · actualización visual V5 =="

for cmd in curl node pm2; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta $cmd"; exit 1; }
done

[ -d "$APP/public" ] || { echo "No encontré $APP/public"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$APP/backups/$STAMP"
cp -f "$APP/public/index.html" "$APP/backups/$STAMP/" 2>/dev/null || true
cp -f "$APP/public/styles.css" "$APP/backups/$STAMP/" 2>/dev/null || true
cp -f "$APP/public/app.js" "$APP/backups/$STAMP/" 2>/dev/null || true

echo "Descargando galería V5..."
curl -fsSL "$BASE/public/index.html" -o "$APP/public/index.html"
curl -fsSL "$BASE/public/styles.css" -o "$APP/public/styles.css"
curl -fsSL "$BASE/public/app.js" -o "$APP/public/app.js"

node --check "$APP/public/app.js"

pm2 restart boda-diego-meylin-v2 >/dev/null
sleep 2

echo
echo "=============================================="
echo " V5 INSTALADA"
echo "=============================================="
echo " https://boda.aliproinv.com/"
echo
echo " Mejoras:"
echo " - visor de fotos a pantalla completa"
echo " - videos se cargan al abrirlos, no en la galería"
echo " - anterior/siguiente y gesto lateral"
echo " - descarga del original desde el visor"
echo " - progreso individual con MB y porcentaje"
echo " - progreso general para varios archivos"
echo " - estados Preparando/Subiendo/Procesando/Subido"
echo "=============================================="
