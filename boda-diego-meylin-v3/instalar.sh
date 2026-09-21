#!/usr/bin/env bash
set -euo pipefail

HOST="boda.aliproinv.com"
PORT="3010"
APP="$HOME/apps/boda-diego-meylin-v2"
DATA="$HOME/boda-media/diego-meylin"
CFG="/etc/cloudflared/config.yml"
BASE="https://raw.githubusercontent.com/A-Zegarra/Proyectos_pendientes/boda-diego-meylin/boda-diego-meylin-v3"

echo "== Diego & Meylin · actualización V3 =="

for cmd in node npm pm2 curl openssl sudo python3 cloudflared; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta $cmd"; exit 1; }
done

mkdir -p "$APP/public" "$DATA/uploads" "$DATA/chunks"
cd "$APP"

echo "Descargando versión nueva..."
curl -fsSL "$BASE/server.js" -o server.js
curl -fsSL "$BASE/public/index.html" -o public/index.html
curl -fsSL "$BASE/public/styles.css" -o public/styles.css
curl -fsSL "$BASE/public/app.js" -o public/app.js
curl -fsSL "$BASE/public/login.html" -o public/login.html
curl -fsSL "$BASE/public/admin.html" -o public/admin.html
curl -fsSL "$BASE/public/admin.js" -o public/admin.js

node --check server.js
node --check public/app.js
node --check public/admin.js

[ -f package.json ] || npm init -y >/dev/null 2>&1
npm install express@5.1.0 cookie-parser@1.4.7 --save-exact >/dev/null

PASSFILE="$APP/.admin-pass"
SECRETFILE="$APP/.session-secret"

if [ -f "$PASSFILE" ]; then
  ADMIN_PASS="$(cat "$PASSFILE")"
else
  ADMIN_PASS="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 16)"
  printf "%s" "$ADMIN_PASS" > "$PASSFILE"
  chmod 600 "$PASSFILE"
fi

if [ -f "$SECRETFILE" ]; then
  SESSION_SECRET="$(cat "$SECRETFILE")"
else
  SESSION_SECRET="$(openssl rand -hex 32)"
  printf "%s" "$SESSION_SECRET" > "$SECRETFILE"
  chmod 600 "$SECRETFILE"
fi

cat > ecosystem.config.cjs <<EOF
module.exports = {
  apps: [{
    name: "boda-diego-meylin-v2",
    script: "$APP/server.js",
    cwd: "$APP",
    env: {
      PORT: "$PORT",
      DATA_DIR: "$DATA",
      ADMIN_USER: "novios",
      ADMIN_PASSWORD: "$ADMIN_PASS",
      SESSION_SECRET: "$SESSION_SECRET"
    }
  }]
};
EOF
chmod 600 ecosystem.config.cjs

pm2 delete boda-diego-meylin >/dev/null 2>&1 || true
pm2 delete boda-diego-meylin-v2 >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs >/dev/null
pm2 save >/dev/null

sleep 2
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null
echo "Aplicación local: OK"

if [ -f "$CFG" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  sudo cp "$CFG" "$CFG.bak-$STAMP"

  sudo python3 - "$CFG" "$HOST" "$PORT" <<'PY'
import sys
cfg, host, port = sys.argv[1], sys.argv[2], sys.argv[3]
with open(cfg, "r", encoding="utf-8") as f:
    lines = f.read().splitlines()

target = "- hostname: " + host
service = "service: http://127.0.0.1:" + port
found = False

for i, line in enumerate(lines):
    if line.strip() == target:
        indent = line[:len(line)-len(line.lstrip())]
        if i + 1 < len(lines) and lines[i+1].strip().startswith("service:"):
            lines[i+1] = indent + "  " + service
        else:
            lines.insert(i+1, indent + "  " + service)
        found = True
        break

if not found:
    for i, line in enumerate(lines):
        if line.strip() == "- service: http_status:404":
            indent = line[:len(line)-len(line.lstrip())]
            lines[i:i] = [indent + target, indent + "  " + service]
            found = True
            break

if not found:
    raise SystemExit("No se encontró la regla final http_status:404")

with open(cfg, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
PY

  if ! sudo cloudflared tunnel --config "$CFG" ingress validate >/dev/null; then
    echo "La configuración de Cloudflare no validó. Restaurando copia."
    sudo cp "$CFG.bak-$STAMP" "$CFG"
    exit 1
  fi

  TUNNEL="$(sudo awk -F': *' '/^tunnel:/ {print $2; exit}' "$CFG" | tr -d "\"'")"
  if [ -n "$TUNNEL" ]; then
    cloudflared tunnel route dns "$TUNNEL" "$HOST" >/tmp/boda-dns.log 2>&1 || \
    sudo cloudflared tunnel route dns "$TUNNEL" "$HOST" >/tmp/boda-dns.log 2>&1 || true
  fi

  sudo systemctl restart cloudflared
fi

sleep 3

echo
echo "================================================="
echo " DIEGO & MEYLIN · V3 LISTA"
echo "================================================="
echo " Invitados:"
echo "   https://$HOST/"
echo "   Solo nombre/usuario — SIN contraseña"
echo "   Todos pueden descargar fotos y videos"
echo
echo " Panel privado de los novios:"
echo "   https://$HOST/novios"
echo "   Usuario: novios"
echo "   Clave: $ADMIN_PASS"
echo
echo " Archivos guardados en:"
echo "   $DATA/uploads"
echo "================================================="

if curl -fsS --max-time 20 "https://$HOST/health" >/dev/null 2>&1; then
  echo "Enlace público: OK"
else
  echo "Servidor listo. Si Cloudflare acaba de reiniciar, actualiza la página en unos segundos."
fi
