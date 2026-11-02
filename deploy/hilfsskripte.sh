#!/usr/bin/env bash
# Installiert Hilfsbefehle, systemd-Einheiten fürs Update und die nächtliche
# Sicherung. Gemeinsam genutzt von container-setup.sh und update.sh, damit
# beide immer denselben Stand einrichten.

set -euo pipefail
APP_DIR="${APP_DIR:-/opt/maschenwerk}"
D="$APP_DIR/deploy"

install -m 0755 "$D/update.sh"          /usr/local/sbin/maschenwerk-update
install -m 0755 "$D/selbstupdate.sh"    /usr/local/sbin/maschenwerk-selbstupdate
install -m 0755 "$D/backup.sh"          /usr/local/bin/maschenwerk-backup
install -m 0755 "$D/container-setup.sh" /usr/local/bin/maschenwerk-setup
ln -sfn /usr/local/sbin/maschenwerk-update /usr/local/bin/update
# `pct exec` startet mit PATH=/sbin:/bin:/usr/sbin:/usr/bin — ohne /usr/local.
# Damit `pct exec <CTID> -- update` vom Proxmox-Host aus klappt, liegen die
# Befehle zusätzlich in /usr/bin.
for b in update maschenwerk-setup maschenwerk-backup; do ln -sfn "/usr/local/bin/$b" "/usr/bin/$b"; done

# Update auf Knopfdruck: der Webdienst legt Anfrage-Dateien in
# /var/lib/maschenwerk/update/ ab, diese .path-Einheiten starten das Skript als root.
install -d -m 0755 /var/lib/maschenwerk/update /var/lib/maschenwerk-update
GEAENDERT=0
for u in maschenwerk-update-ausfuehren.path maschenwerk-update-ausfuehren.service \
         maschenwerk-update-pruefen.path maschenwerk-update-pruefen.service maschenwerk-update-pruefen.timer; do
  if ! diff -q "$D/$u" "/etc/systemd/system/$u" >/dev/null 2>&1; then
    cp "$D/$u" "/etc/systemd/system/$u"
    GEAENDERT=1
  fi
done
if [[ "$GEAENDERT" -eq 1 ]]; then systemctl daemon-reload; fi
systemctl enable --now maschenwerk-update-ausfuehren.path maschenwerk-update-pruefen.path maschenwerk-update-pruefen.timer >/dev/null 2>&1

echo '30 3 * * * root /usr/local/bin/maschenwerk-backup >/var/log/maschenwerk-backup.log 2>&1' > /etc/cron.d/maschenwerk-backup
chmod 0644 /etc/cron.d/maschenwerk-backup
systemctl enable --now cron >/dev/null 2>&1 || true

printf 'Maschenwerk\n  App aktualisieren:  update\n  Sicherung jetzt:    maschenwerk-backup\n  Einrichtung neu:    maschenwerk-setup\n' > /etc/motd
