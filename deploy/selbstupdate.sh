#!/usr/bin/env bash
# Update aus der App (Einstellungen → Update). Als /usr/local/sbin/maschenwerk-selbstupdate
# installiert und von systemd als root gestartet:
#   pruefen     neuesten Stand holen (git fetch) und mit dem installierten vergleichen → stand.json
#               (täglich per Timer und auf Knopfdruck)
#   ausfuehren  Sicherung anlegen, maschenwerk-update, danach pruefen → lauf.json, protokoll.txt
# Die Anfrage-Dateien legt der Webdienst in /var/lib/maschenwerk/update ab; sie werden hier
# nur gelöscht, nie gelesen. Die Ergebnisse liegen in /var/lib/maschenwerk-update (root, lesbar).

set -uo pipefail
REPO=/opt/maschenwerk
ANFRAGE=/var/lib/maschenwerk/update
STAND=/var/lib/maschenwerk-update
umask 022
export TZ=Europe/Berlin
install -d -o root -g root -m 755 "$STAND"

jetzt() { date '+%Y-%m-%dT%H:%M:%S%z'; }

schreiben() {   # Datei in $STAND aus stdin: erst fertig schreiben, dann austauschen
  local tmp
  tmp=$(mktemp "$STAND/.neu.XXXXXX")
  cat > "$tmp"
  chmod 644 "$tmp"
  mv -f "$tmp" "$STAND/$1"
}

pruefen() {
  rm -f "$ANFRAGE/pruefen"
  cd "$REPO" || exit 1
  local fehler=""
  if ! fehler=$(git fetch -q origin 2>&1); then
    fehler=${fehler:-git fetch fehlgeschlagen}
  else
    fehler=""
  fi
  python3 - "$fehler" <<'PY' | schreiben stand.json
import datetime, json, subprocess, sys

def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True).stdout.strip()

def version(ref):
    try:
        return json.loads(git("show", ref + ":backend/package.json")).get("version")
    except ValueError:
        return None

ziel = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}") or "origin/main"
aenderungen = [z.split("\t", 1) for z in git("log", "--format=%h\t%s", "-n", "40", "HEAD.." + ziel).splitlines() if "\t" in z]
print(json.dumps({
    "zeit": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    "fehler": sys.argv[1][-400:] or None,
    "installiert": {"version": version("HEAD"), "stand": git("rev-parse", "--short", "HEAD")},
    "verfuegbar": {"version": version(ziel), "stand": git("rev-parse", "--short", ziel)},
    "neu": int(git("rev-list", "--count", "HEAD.." + ziel) or 0),
    "aenderungen": [{"stand": h, "text": t} for h, t in aenderungen],
}, ensure_ascii=False))
PY
}

ausfuehren() {
  rm -f "$ANFRAGE/ausfuehren"
  local beginn ergebnis=ok
  beginn=$(jetzt)
  printf '{"beginn": "%s", "ende": null, "ergebnis": null}\n' "$beginn" | schreiben lauf.json
  {
    echo "== $(jetzt) Sicherung"
    /usr/local/bin/maschenwerk-backup || ergebnis=fehler
    if [ "$ergebnis" = ok ]; then
      echo "== $(jetzt) Update"
      /usr/local/sbin/maschenwerk-update || ergebnis=fehler
    else
      echo "Ohne Sicherung kein Update."
    fi
    echo "== $(jetzt) Ende: $ergebnis"
  } > "$STAND/protokoll.txt" 2>&1
  printf '{"beginn": "%s", "ende": "%s", "ergebnis": "%s"}\n' "$beginn" "$(jetzt)" "$ergebnis" | schreiben lauf.json
  pruefen
}

case "${1:-}" in
  pruefen) pruefen ;;
  ausfuehren) ausfuehren ;;
  *) echo "Aufruf: maschenwerk-selbstupdate pruefen|ausfuehren"; exit 1 ;;
esac
