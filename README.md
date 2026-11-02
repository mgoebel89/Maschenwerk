# Maschenwerk

Strickanleitungen für die **Brother KH-588** mit Doppelbett **KR-586** berechnen, speichern und
Reihe für Reihe abarbeiten. Läuft als kleiner LXC-Container auf Proxmox, bedienbar am Handy
(iPhone/Android, als App auf dem Homebildschirm) und am PC.

Konzept mit Ansichten: [`KONZEPT.html`](KONZEPT.html) · Stand und Entscheidungen: [`STAND_UND_KONZEPT.md`](STAND_UND_KONZEPT.md)

## Stand: Stufe B (Socken)

- **Personen** mit Fußmaßen und **Messmaske** (Fußzeichnung, Hinweis je Maß, Plausibilitätsprüfung,
  Schätzung aus der Schuhgröße, Messblatt zum Drucken)
- **Garne** und **Maschenproben** (flach oder rund), **Schnellrechner**
- **Sockenvorlage** rund auf dem Doppelbett: Bündchen 2:2/2:1/1:1/Mock-Rib, drei Fersen-/Spitzenformen
  (verkürzte Reihen nur auf dem Hauptbett), optionale Wadenabnahme, Spitze im Maschenstich
- **Projekt-Assistent** mit Live-Ergebnis und Garnbedarf; Projekte frieren Maße und Anleitung ein
- **Strickmodus**: Checkliste vor jedem Abschnitt, gerade Strecken als Block, verkürzte Reihen einzeln
  mit Nadelbett-Grafik, Reihenzähler-Soll, Bildschirm bleibt an, Weiter per Knopf, Bluetooth-Seitenwender
  (Leertaste/Pfeil/Bild↓) oder **Rundenzähler-Sensor** (`POST /api/zaehler`, z. B. aus Home Assistant)
- **Maschineneinstellungen** auf drei Ebenen: je Abschnitt, Änderungen beim Stricken (gelten für Socke 2),
  bearbeitbare **Einstellungs-Vorlagen** (dort die Hebelnamen aus den Anleitungen eintragen, ⚑ = Platzhalter)
- **PDF-Anleitung** mit Skizze, Ablauf zum Abhaken, Nadelfolge der verkürzten Reihen
- Datensicherung, nächtliche Sicherung, Update auf Knopfdruck

Als Nächstes: Stufe C — Pullover (eingesetzte Ärmel, Raglan, überschnittene Schulter).

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
