#!/usr/bin/env bash
set -euo pipefail

HOST="boda.aliproinv.com"
PORT="3010"
APP="$HOME/apps/boda-diego-meylin"
DATA="$HOME/boda-media/diego-meylin"
CFG="/etc/cloudflared/config.yml"
BASE="https://raw.githubusercontent.com/A-Zegarra/Proyectos_pendientes/boda-diego-meylin/boda-diego-meylin"

echo "== Boda Diego & Meylin =="

for cmd in node npm pm2 cloudflared curl python3; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta $cmd"; exit 1; }
done

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  if ! pm2 describe boda-diego-meylin >/dev/null 2>&1; then
    echo "El puerto $PORT ya esta ocupado por otro servicio. No se modifico nada."
    exit 1
  fi
fi

mkdir -p "$APP" "$DATA/uploads" "$DATA/chunks"
cd "$APP"

echo "Descargando aplicacion..."
curl -fsSL "$BASE/server.js" -o server.js
curl -fsSL "$BASE/index.html" -o index.html

if [ ! -f package.json ]; then
  npm init -y >/dev/null 2>&1
fi
npm install express@5.1.0 --save-exact --omit=dev >/dev/null

PASSFILE="$APP/.admin-pass"
if [ -f "$PASSFILE" ]; then
  ADMIN_PASS=$(cat "$PASSFILE")
else
  ADMIN_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 14)
  printf "%s" "$ADMIN_PASS" > "$PASSFILE"
  chmod 600 "$PASSFILE"
fi

cat > ecosystem.config.cjs <<EOF
module.exports={
  apps:[{
    name:"boda-diego-meylin",
    script:"$APP/server.js",
    cwd:"$APP",
    env:{
      PORT:"$PORT",
      DATA_DIR:"$DATA",
      ADMIN_USER:"alvaro",
      ADMIN_PASSWORD:"$ADMIN_PASS"
    }
  }]
};
EOF
chmod 600 ecosystem.config.cjs

pm2 delete boda-diego-meylin >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs >/dev/null
pm2 save >/dev/null

sleep 1
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null
echo "Aplicacion local: OK"

if [ ! -f "$CFG" ]; then
  echo "No encontre $CFG. La aplicacion quedo funcionando localmente en el puerto $PORT."
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
sudo cp "$CFG" "$CFG.bak-$STAMP"

sudo python3 - "$CFG" "$HOST" "$PORT" <<'PY'
import sys
cfg,host,port=sys.argv[1],sys.argv[2],sys.argv[3]
with open(cfg,"r",encoding="utf-8") as f:
    lines=f.read().splitlines()
target="- hostname: "+host
service="service: http://127.0.0.1:"+port
found=False
for i,line in enumerate(lines):
    if line.strip()==target:
        indent=line[:len(line)-len(line.lstrip())]
        if i+1<len(lines) and lines[i+1].strip().startswith("service:"):
            lines[i+1]=indent+"  "+service
        else:
            lines.insert(i+1,indent+"  "+service)
        found=True
        break
if not found:
    for i,line in enumerate(lines):
        if line.strip()=="- service: http_status:404":
            indent=line[:len(line)-len(line.lstrip())]
            lines[i:i]=[indent+target,indent+"  "+service]
            found=True
            break
if not found:
    raise SystemExit("No se encontro la regla final http_status:404")
with open(cfg,"w",encoding="utf-8") as f:
    f.write("\n".join(lines)+"\n")
PY

if ! sudo cloudflared tunnel --config "$CFG" ingress validate >/dev/null; then
  echo "La configuracion de Cloudflare no valido. Restaurando copia."
  sudo cp "$CFG.bak-$STAMP" "$CFG"
  exit 1
fi

TUNNEL=$(sudo awk -F': *' '/^tunnel:/ {print $2; exit}' "$CFG" | tr -d "\"'")
if [ -z "$TUNNEL" ]; then
  echo "No pude leer el UUID/nombre del tunnel en $CFG."
  exit 1
fi

echo "Creando ruta DNS..."
if ! sudo -H cloudflared tunnel route dns "$TUNNEL" "$HOST" >/tmp/boda-dns.log 2>&1; then
  if ! getent ahosts "$HOST" >/dev/null 2>&1; then
    cat /tmp/boda-dns.log
    echo "La web local esta lista, pero Cloudflare no pudo crear el DNS."
    exit 1
  fi
fi

sudo systemctl restart cloudflared
sleep 3

echo
echo "=============================================="
echo " LINK PARA INVITADOS"
echo " https://$HOST"
echo
echo " ADMINISTRACION"
echo " https://$HOST/admin"
echo " Usuario: alvaro"
echo " Clave: $ADMIN_PASS"
echo
echo " Archivos en:"
echo " $DATA/uploads"
echo "=============================================="

curl -fsS --max-time 15 "https://$HOST/health" >/dev/null 2>&1 && echo "Enlace publico: OK" || echo "El servicio esta listo; si el DNS acaba de crearse, prueba el enlace nuevamente en breve."
