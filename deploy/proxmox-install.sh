#!/usr/bin/env bash
# Maschenwerk — Proxmox-LXC-Installer
# Auf dem Proxmox-Host ausführen (als root). Legt einen unprivilegierten Debian-12-LXC an
# und installiert die App. Konfiguration über Environment-Variablen — Defaults siehe unten.
#
# Schnellaufruf (auf dem Proxmox-Host, Shell von 192.168.5.40):
#   bash -c "$(wget -qO- https://raw.githubusercontent.com/mgoebel89/Maschenwerk/main/deploy/proxmox-install.sh)"
#
# Mit fester IP und Container-Nummer:
#   CTID=240 IPV4=192.168.5.60/24 GATEWAY=192.168.5.1 \
#     bash -c "$(wget -qO- https://raw.githubusercontent.com/mgoebel89/Maschenwerk/main/deploy/proxmox-install.sh)"

set -euo pipefail

# -------- Defaults (per Env überschreibbar) --------
: "${CTID:=}"                              # leer = nächste freie ID
# NICHT "HOSTNAME": das setzt bash selbst (Name des Proxmox-Hosts), ein Vorgabewert griffe nie.
: "${CT_HOSTNAME:=maschenwerk}"
: "${STORAGE:=local-lvm}"                  # Storage für das Container-Volume
: "${TEMPLATE_STORAGE:=local}"             # Storage, in dem die Templates liegen
: "${DISK_GB:=4}"
: "${MEMORY_MB:=512}"
: "${SWAP_MB:=512}"
: "${CORES:=1}"
: "${BRIDGE:=vmbr0}"
: "${IPV4:=dhcp}"                          # z. B. 192.168.5.60/24  (mit GATEWAY)
: "${GATEWAY:=}"                           # nur bei statischer IP nötig
: "${UNPRIVILEGED:=1}"
: "${PASSWORD:=}"                          # leer = zufälliges Passwort wird gesetzt + ausgegeben
: "${REPO_URL:=https://github.com/mgoebel89/Maschenwerk.git}"
: "${REPO_BRANCH:=main}"
: "${HTTP_PORT:=80}"                       # leitet nur auf HTTPS um
: "${HTTPS_PORT:=443}"

log()  { printf '\033[1;34m[*]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[✓]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; }

if [[ $EUID -ne 0 ]]; then err "Bitte als root auf dem Proxmox-Host ausführen."; exit 1; fi
for c in pct pveam pvesh; do command -v "$c" >/dev/null 2>&1 || { err "Befehl fehlt: $c (ist das ein Proxmox-Host?)"; exit 1; }; done

# -------- CTID bestimmen --------
if [[ -z "$CTID" ]]; then CTID=$(pvesh get /cluster/nextid); fi
if pct status "$CTID" >/dev/null 2>&1; then err "Container $CTID existiert bereits."; exit 1; fi

# -------- Template sicherstellen --------
log "Suche Debian-12-Template…"
pveam update >/dev/null
TEMPLATE_NAME=$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -n1)
if [[ -z "$TEMPLATE_NAME" ]]; then err "Kein debian-12-standard-Template verfügbar."; exit 1; fi
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE_NAME"; then
  log "Lade Template ${TEMPLATE_NAME} (${TEMPLATE_STORAGE})…"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE_NAME"
fi
TEMPLATE_REF="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE_NAME}"

# -------- Passwort --------
GENERATED_PW=0
if [[ -z "$PASSWORD" ]]; then
  PASSWORD=$(tr -dc 'A-Za-z0-9!@%_+-' </dev/urandom | head -c 16 || true)
  GENERATED_PW=1
fi

# -------- Netzwerk --------
NET_OPTS="name=eth0,bridge=${BRIDGE}"
if [[ "$IPV4" == "dhcp" ]]; then
  NET_OPTS="${NET_OPTS},ip=dhcp"
else
  if [[ -z "$GATEWAY" ]]; then err "Bei statischer IPV4 muss GATEWAY gesetzt sein."; exit 1; fi
  NET_OPTS="${NET_OPTS},ip=${IPV4},gw=${GATEWAY}"
fi

log "Erzeuge LXC ${CTID} (${CT_HOSTNAME})…"
pct create "$CTID" "$TEMPLATE_REF" \
  --hostname "$CT_HOSTNAME" \
  --cores "$CORES" \
  --memory "$MEMORY_MB" \
  --swap "$SWAP_MB" \
  --rootfs "${STORAGE}:${DISK_GB}" \
  --net0 "$NET_OPTS" \
  --features nesting=1 \
  --unprivileged "$UNPRIVILEGED" \
  --password "$PASSWORD" \
  --onboot 1 \
  --start 0
ok "Container angelegt."

log "Starte Container…"
pct start "$CTID"
log "Warte auf Netzwerk im Container…"
for _ in {1..30}; do
  if pct exec "$CTID" -- bash -lc 'getent hosts deb.debian.org >/dev/null 2>&1'; then break; fi
  sleep 1
done

# -------- Setup im Container --------
# Die eigentliche Einrichtung steckt in container-setup.sh — im Container als
# `maschenwerk-setup` jederzeit wiederholbar.
log "Hole Repository in den Container…"
pct exec "$CTID" -- bash -lc "
  set -euo pipefail
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq git ca-certificates curl >/dev/null
  if [ ! -d /opt/maschenwerk/.git ]; then
    git clone --branch '${REPO_BRANCH}' '${REPO_URL}' /opt/maschenwerk
  fi
"

log "Richte Maschenwerk im Container ein (das dauert einige Minuten)…"
if ! pct exec "$CTID" -- env \
      REPO_URL="$REPO_URL" REPO_BRANCH="$REPO_BRANCH" \
      HTTP_PORT="$HTTP_PORT" HTTPS_PORT="$HTTPS_PORT" CERT_HOST="$CT_HOSTNAME" \
      bash /opt/maschenwerk/deploy/container-setup.sh; then
  err "Die Einrichtung im Container ist fehlgeschlagen (Meldungen oben)."
  err "Der Container $CTID bleibt bestehen. Nach dem Beheben erneut versuchen mit:"
  err "    pct exec $CTID -- maschenwerk-setup"
  exit 1
fi

CT_IP=$(pct exec "$CTID" -- bash -lc "hostname -I | awk '{print \$1}'" || true)
if [[ "$HTTPS_PORT" == "443" ]]; then SUFFIX=""; else SUFFIX=":${HTTPS_PORT}"; fi

ok "Fertig."
echo
echo "─────────────────────────────────────────────"
echo "  Container-ID : $CTID"
echo "  Hostname     : $CT_HOSTNAME"
echo "  IP           : ${CT_IP:-(noch nicht verfügbar)}"
echo "  URL          : https://${CT_IP:-<IP>}${SUFFIX}"
if [[ "$GENERATED_PW" -eq 1 ]]; then
  echo "  root-Passwort: $PASSWORD"
fi
echo
echo "  Zertifikat: selbstsigniert — die Browserwarnung einmal je Gerät bestätigen."
echo "  HTTPS braucht es, damit der Bildschirm im Strickmodus anbleibt."
echo
echo "  Am Handy als App: Seite öffnen → Teilen → „Zum Home-Bildschirm“ (iPhone)"
echo "                    bzw. Menü → „Zum Startbildschirm hinzufügen“ (Android)."
echo
echo "  Update: in der App unter Einstellungen, oder"
echo "    pct exec $CTID -- update"
echo "─────────────────────────────────────────────"
