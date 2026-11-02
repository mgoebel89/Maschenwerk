#!/usr/bin/env bash
# Aktualisiert Maschenwerk im Container: holt den aktuellen Stand aus Git,
# installiert ggf. neue Backend-Abhängigkeiten, übernimmt nginx- und
# systemd-Konfiguration und startet den Dienst neu.
#
# In der Container-Konsole:  update
# Vom Proxmox-Host:          pct exec <CTID> -- update
# In der App:                Einstellungen → Update (läuft über maschenwerk-selbstupdate)

set -euo pipefail
REPO_DIR="/opt/maschenwerk"

if [[ ! -d "$REPO_DIR/.git" ]]; then echo "Repo nicht gefunden unter $REPO_DIR" >&2; exit 1; fi

cd "$REPO_DIR"
VORHER=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"

# Abhängigkeiten nur neu installieren, wenn package.json sich geändert hat.
if [[ ! -d backend/node_modules ]] || ! diff -q backend/package.json backend/node_modules/.package.json.last >/dev/null 2>&1; then
  (cd backend && npm install --omit=dev --no-audit --no-fund)
  cp backend/package.json backend/node_modules/.package.json.last
fi

# nginx-Site übernehmen, falls geändert. Die Ports stammen aus der installierten
# Config, damit eine abweichende Port-Wahl erhalten bleibt.
SITE=/etc/nginx/sites-available/maschenwerk
if [[ -f "$SITE" ]]; then
  HTTP_PORT=$(awk '/listen / && $0 !~ /ssl/ && $2 !~ /\[/ {sub(";","",$2); print $2; exit}' "$SITE" 2>/dev/null || true)
  HTTPS_PORT=$(awk '/listen / && $0 ~ /ssl/ && $2 !~ /\[/ {sub(";","",$2); print $2; exit}' "$SITE" 2>/dev/null || true)
  HTTP_PORT=${HTTP_PORT:-80}; HTTPS_PORT=${HTTPS_PORT:-443}
  if [[ "$HTTPS_PORT" == "443" ]]; then HTTPS_SUFFIX=""; else HTTPS_SUFFIX=":${HTTPS_PORT}"; fi
  TMP=$(mktemp)
  sed -e "s/__HTTP_PORT__/${HTTP_PORT}/g" \
      -e "s/__HTTPS_PORT__/${HTTPS_PORT}/g" \
      -e "s/__HTTPS_SUFFIX__/${HTTPS_SUFFIX}/g" deploy/nginx-site.conf > "$TMP"
  if ! diff -q "$TMP" "$SITE" >/dev/null 2>&1; then
    cp "$TMP" "$SITE"
    nginx -t && systemctl reload nginx
  fi
  rm -f "$TMP"
fi

if ! diff -q deploy/maschenwerk.service /etc/systemd/system/maschenwerk.service >/dev/null 2>&1; then
  cp deploy/maschenwerk.service /etc/systemd/system/maschenwerk.service
  systemctl daemon-reload
fi
systemctl restart maschenwerk

bash deploy/hilfsskripte.sh

sleep 2
if ! systemctl is-active --quiet maschenwerk; then
  echo "FEHLER: Der Dienst läuft nach dem Update nicht. Journal:" >&2
  journalctl -u maschenwerk -n 30 --no-pager >&2 || true
  exit 1
fi
echo "Update abgeschlossen: ${VORHER} → $(git log -1 --pretty=format:'%h %s')"
