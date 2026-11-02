# Maschenwerk

Strickanleitungen für die **Brother KH-588** mit Doppelbett **KR-586** berechnen, speichern und
Reihe für Reihe abarbeiten. Läuft als kleiner LXC-Container auf Proxmox, bedienbar am Handy
(iPhone/Android, als App auf dem Homebildschirm) und am PC.

Konzept mit Ansichten: [`KONZEPT.html`](KONZEPT.html) · Stand und Entscheidungen: [`STAND_UND_KONZEPT.md`](STAND_UND_KONZEPT.md)

## Stand: Stufe A (Fundament)

- **Personen** mit Fußmaßen; **Messmaske** mit Fußzeichnung (Messlinie leuchtet, Hinweis je Maß,
  Plausibilitätsprüfung gegen die Schuhgröße); fehlende Maße werden aus der Schuhgröße geschätzt;
  **Messblatt** zum Ausdrucken
- **Garne** mit Lauflänge, Gewicht, Farbe
- **Maschenproben** flach oder rund (Doppelbett), gezählt + gemessen oder direkt auf 10 cm
- **Schnellrechner**: Breite → Maschen und Nadeln (L/R, je Bett), Länge → Reihen/Runden und
  Reihenzähler, Maschen/Reihen → cm, Zu- und Abnahmen gleichmäßig verteilen
- **Datensicherung** als Datei, nächtliche Sicherung im Container, **Update auf Knopfdruck**

Als Nächstes: Stufe B — Sockenvorlage, Projekt-Assistent, Strickmodus, PDF.

## Installation (Proxmox-Shell)

```bash
bash -c "$(wget -qO- https://raw.githubusercontent.com/mgoebel89/Maschenwerk/main/deploy/proxmox-install.sh)"
```

Mit fester IP und Container-Nummer:

```bash
CTID=240 IPV4=192.168.5.60/24 GATEWAY=192.168.5.1 bash -c "$(wget -qO- https://raw.githubusercontent.com/mgoebel89/Maschenwerk/main/deploy/proxmox-install.sh)"
```

Weitere Variablen: `CT_HOSTNAME`, `STORAGE`, `DISK_GB`, `MEMORY_MB`, `BRIDGE`, `HTTPS_PORT` (siehe Kopf von
`deploy/proxmox-install.sh`). Das Zertifikat ist selbstsigniert; die Browserwarnung je Gerät einmal bestätigen.

## Betrieb

| Was | Wie |
|---|---|
| Update | in der App unter *Einstellungen → Update*, oder `pct exec <CTID> -- update` |
| Sicherung jetzt | `pct exec <CTID> -- maschenwerk-backup` (liegt in `/var/backups/maschenwerk`) |
| Einrichtung reparieren | `pct exec <CTID> -- maschenwerk-setup` |
| Dienst / Log | `systemctl status maschenwerk`, `journalctl -u maschenwerk` |
| Daten | `/var/lib/maschenwerk/data.db` (SQLite) |

## Aufbau

- `backend/` — Node + Express + better-sqlite3. Jede Entität als JSON-Payload (Muster wie ImkereiApp).
- `app/` — Oberfläche ohne Framework, Namespace `MW`, Hash-Router. Alle Berechnungen in `app/src/models.js`.
- `deploy/` — Installer, Einrichtung, Update (auch auf Knopfdruck über systemd-.path-Einheiten), Sicherung.
- `tests/dev_server.py` — Entwicklungsserver ohne Node: liefert `app/` aus und bildet die REST-Schnittstelle nach.

```bash
python tests/dev_server.py 8470
```
