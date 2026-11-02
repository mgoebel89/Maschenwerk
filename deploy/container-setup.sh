#!/usr/bin/env bash
# Richtet Maschenwerk INNERHALB des Containers ein.
#
# Wird vom proxmox-install.sh aufgerufen, lässt sich aber auch von Hand
# ausführen, um eine halb fertige oder kaputte Installation zu reparieren —
# alle Schritte sind wiederholbar:
#
#   In der Container-Konsole:   maschenwerk-setup
#   Vom Proxmox-Host:           pct exec <CTID> -- maschenwerk-setup

set -euo pipefail

: "${REPO_URL:=https://github.com/mgoebel89/Maschenwerk.git}"
: "${REPO_BRANCH:=main}"
: "${APP_DIR:=/opt/maschenwerk}"
: "${DATA_DIR:=/var/lib/maschenwerk}"
: "${HTTP_PORT:=80}"
: "${HTTPS_PORT:=443}"
: "${CERT_HOST:=$(hostname)}"

log()  { printf '\033[1;34m[*]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[✓]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; }

# Bei einem Abbruch klar sagen, WO es hakte.
schritt='Start'
trap 'err "Abgebrochen bei: ${schritt}"; err "Details oben. Nach dem Beheben einfach erneut ausführen: maschenwerk-setup"' ERR

if [[ $EUID -ne 0 ]]; then err "Bitte als root im Container ausführen."; exit 1; fi
export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- Pakete ----
schritt='Pakete installieren'
log "$schritt…"
apt-get update -qq
# build-essential und python3: Rückfallweg für better-sqlite3, falls es für die
# Node-Version kein fertiges Binary gibt. python3 schreibt außerdem den Update-Stand.
apt-get install -y -qq nginx git ca-certificates curl sqlite3 cron openssl \
  build-essential python3 >/dev/null
ok "Pakete da."

schritt='Node.js installieren'
if ! command -v node >/dev/null 2>&1; then
  log "$schritt (20.x via NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node $(node --version)"

# ------------------------------------------------------------------ Repo ----
# Voller Klon (nicht --depth=1): die Update-Prüfung zählt die neuen Commits.
schritt='Repository holen'
mkdir -p "$DATA_DIR" /var/backups/maschenwerk
if [[ -d "$APP_DIR/.git" ]]; then
  log "Repo vorhanden — aktualisiere…"
  git -C "$APP_DIR" fetch origin "$REPO_BRANCH"
  git -C "$APP_DIR" reset --hard "origin/${REPO_BRANCH}"
else
  log "Klone ${REPO_URL} (${REPO_BRANCH})…"
  rm -rf "$APP_DIR"
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi
ok "Stand: $(git -C "$APP_DIR" log -1 --pretty=format:'%h %s')"

# --------------------------------------------------------------- Backend ----
schritt='Backend-Abhängigkeiten installieren (better-sqlite3 kann übersetzt werden, das dauert)'
log "$schritt…"
(cd "$APP_DIR/backend" && npm install --omit=dev --no-audit --no-fund)
cp "$APP_DIR/backend/package.json" "$APP_DIR/backend/node_modules/.package.json.last"
ok "Abhängigkeiten installiert."

schritt='Backend-Dienst einrichten'
cp "$APP_DIR/deploy/maschenwerk.service" /etc/systemd/system/maschenwerk.service
systemctl daemon-reload
systemctl enable maschenwerk >/dev/null 2>&1
systemctl restart maschenwerk
# Wirklich nachsehen — `systemctl restart` meldet auch Erfolg, wenn der Dienst
# gleich darauf wieder aussteigt.
sleep 2
if ! systemctl is-active --quiet maschenwerk; then
  err "Backend läuft nicht. Letzte Zeilen aus dem Journal:"
  journalctl -u maschenwerk -n 30 --no-pager >&2 || true
  exit 1
fi
ok "Backend läuft."

# ------------------------------------------------------------ Zertifikat ----
schritt='TLS-Zertifikat erzeugen'
install -d -m 0700 /etc/ssl/maschenwerk
if [[ ! -f /etc/ssl/maschenwerk/server.crt ]]; then
  IPADDR=$(hostname -I | awk '{print $1}')
  log "Erzeuge selbstsigniertes Zertifikat für ${CERT_HOST} / ${IPADDR}…"
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout /etc/ssl/maschenwerk/server.key \
    -out /etc/ssl/maschenwerk/server.crt \
    -subj "/CN=${CERT_HOST}" \
    -addext "subjectAltName=DNS:${CERT_HOST},DNS:localhost,IP:${IPADDR},IP:127.0.0.1" >/dev/null 2>&1
  chmod 0600 /etc/ssl/maschenwerk/server.key
fi
ok "Zertifikat vorhanden."

# ----------------------------------------------------------------- nginx ----
schritt='nginx konfigurieren'
install -d /var/www
ln -sfn "$APP_DIR/app" /var/www/maschenwerk
if [[ "$HTTPS_PORT" == "443" ]]; then HTTPS_SUFFIX=""; else HTTPS_SUFFIX=":${HTTPS_PORT}"; fi
sed -e "s/__HTTP_PORT__/${HTTP_PORT}/g" \
    -e "s/__HTTPS_PORT__/${HTTPS_PORT}/g" \
    -e "s/__HTTPS_SUFFIX__/${HTTPS_SUFFIX}/g" \
    "$APP_DIR/deploy/nginx-site.conf" > /etc/nginx/sites-available/maschenwerk
ln -sfn /etc/nginx/sites-available/maschenwerk /etc/nginx/sites-enabled/maschenwerk

# Erst prüfen, DANN die Standard-Site entfernen — andersherum hinterlässt ein
# Konfigurationsfehler einen Container, der weiter die nginx-Startseite zeigt.
schritt='nginx-Konfiguration prüfen'
if ! nginx -t; then
  err "nginx-Konfiguration fehlerhaft — Standard-Site bleibt aktiv."
  exit 1
fi
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx >/dev/null 2>&1
systemctl reload nginx || systemctl restart nginx
ok "nginx konfiguriert."

# ------------------------------------------- Hilfsskripte, Update, Cron ----
schritt='Hilfsskripte und Update-Einheiten einrichten'
bash "$APP_DIR/deploy/hilfsskripte.sh"
ok "Hilfsskripte eingerichtet."

# -------------------------------------------------------------- Abnahme ----
schritt='Installation prüfen'
FEHLER=0
if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
  ok "Backend antwortet auf /api/health."
else
  err "Backend antwortet NICHT auf /api/health."; FEHLER=1
fi
if curl -fsSk "https://127.0.0.1:${HTTPS_PORT}/api/health" >/dev/null 2>&1; then
  ok "nginx reicht /api/ ans Backend durch."
else
  err "nginx erreicht das Backend nicht über HTTPS."; FEHLER=1
fi
if curl -fsSk "https://127.0.0.1:${HTTPS_PORT}/" 2>/dev/null | grep -q '<title>Maschenwerk</title>'; then
  ok "Oberfläche wird ausgeliefert."
else
  err "Statt der App kommt etwas anderes (vermutlich noch die nginx-Startseite)."; FEHLER=1
fi
if systemctl is-enabled --quiet maschenwerk-update-ausfuehren.path; then
  ok "Update auf Knopfdruck ist eingerichtet."
else
  err "Update-Einheiten fehlen."; FEHLER=1
fi

trap - ERR
if [[ "$FEHLER" -ne 0 ]]; then err "Einrichtung unvollständig — siehe Meldungen oben."; exit 1; fi

IPADDR=$(hostname -I | awk '{print $1}')
if [[ "$HTTPS_PORT" == "443" ]]; then SUFFIX=""; else SUFFIX=":${HTTPS_PORT}"; fi
echo
ok "Einrichtung abgeschlossen."
echo "   URL: https://${IPADDR}${SUFFIX}"
