# Maschenwerk – Stand und Konzept

Projektgedächtnis, lokal auf diesem PC. Wird nach jeder Arbeitsrunde fortgeschrieben.
Ausführliches Konzept mit Ansichten-Entwürfen: `KONZEPT.html`.

## Ziel
LXC-Container auf dem Proxmox **192.168.5.40**: Web-App, um Strickanleitungen für die
**Brother KH-588** mit Doppelbett zu berechnen, zu speichern und Reihe für Reihe bzw. Runde für
Runde abzuarbeiten. Hauptsächlich **Socken** (für verschiedene Personen in deren Größe) und
**Pullover**. Nadel- und Reihenzahlen werden aus der **Maschenprobe** berechnet. Anleitungen als
**PDF** druckbar. Modernes Design, auf iPhone und Android bequem.

## Stand 2026-11-02
- Konzept geschrieben und Funktionsumfang in drei Fragerunden abgestimmt.
- **Stufe A gebaut**, lokales Git-Repo (Zweig `main`), Commit `c36d70b`. Auf GitHub gepusht:
  `https://github.com/mgoebel89/Maschenwerk` (öffentlich, Installer per raw-URL abrufbar, geprüft).
  **Installiert als CT 119 unter https://192.168.5.40** (2026-11-02), Zertifikat neu erzeugt,
  `pct exec 119 -- update` funktioniert, Matthias: „läuft soweit alles". **Stufe A im Container abgenommen.**
  Fixes beim Installieren: `de9a6f6` (nginx-Standardseite, CT_HOSTNAME), `93b9b79` (alle IPs ins Zertifikat),
  `36e5cc0` (Befehle auch in /usr/bin, weil pct exec /usr/local nicht im PATH hat).
- **Stufe B gebaut (Version 0.2.0)**, lokal im Browser-Pane durchgetestet, noch NICHT im Container.
  Hebelnamen von KH-588/KR-586 stehen weiter als Platzhalter ⚑ in den Einstellungs-Vorlagen
  (Einstellungen → Vorlagen); Matthias kann sie dort selbst eintragen.

## Stufe B – was drin ist
- `app/src/socke.js`: Berechnung + Anleitung. RC: Rippe 1 Fahrt/Reihe, rund 2 Fahrten/Runde, verkürzt 1/Reihe.
  Maschen = rundeAuf(Umfang × (1+Weite) × M/cm, kgV(Rapport, 2)); Ferse/Spitze verkürzt bis Rest-Anteil
  (⅓ bzw. ⅖, ggf. + 2 Zwischenreihen), (F−Rest) gerade erzwungen; Tiefe = (ab + zw/2)/R-pro-cm;
  Schaft = Schafthöhe − Bündchen − Fersentiefe; Fuß = Sockenlänge − Fersen- − Spitzentiefe.
  Wadenabnahme: 4 Maschen je Abnahmerunde (je Bett beide Ränder), per `verteilen(…, 4)`.
  Garn ≈ Maschen × 2,3 × (Maschenbreite + Maschenhöhe).
- Verkürzte Reihen: Abnahme Nadel auf Schlittenseite nach E, Zunahme gegenüber zurück nach D —
  **einstellbar** (Einstellungen), weil die Literatur das unterschiedlich beschreibt. Schlitten startet rechts.
- Projekt = eingefrorene Eingaben + Anleitung; Fortschritt = Index in `MW.socke.karten()` (+ gezählte Runden).
  Vorlagen werden LIVE aus den Settings gelesen (nachgetragene Hebelnamen gelten sofort), Änderungen
  je Abschnitt in `projekt.aenderungen` (gelten ab sofort und für Socke 2).
- Strickmodus `views/stricken.js`: Wake Lock, Piep + Vibration, Tasten (Bluetooth-Seitenwender),
  Sensor-Abfrage `/api/zaehler` alle 1,5 s — zählt nur in Blöcken, bei Aktionen nur Piep.
- PDF `export/pdf.js` mit jsPDF aus der ImkereiApp (`app/vendor/`); Helvetica kann nur WinAnsi →
  `MW.pdf.rein()` ersetzt ≈ → − ⚑ ⅓.
- Test-Hilfen im dev_server: `/__backend/<datei>` (Syntaxprüfung) und `POST /__ablage/<name>` (PDF ablegen,
  landet in `%TEMP%\maschenwerk-ablage`, dann mit Read ansehen).
- Lokal geprüft (Browser-Pane, `tests/dev_server.py`, Launch-Config `maschenwerk-dev` Port 8470):
  Person anlegen → Messmaske (Schritte, Tippen auf Linie, Speichern beim sofortigen Verlassen,
  Plausibilitätswarnung), Garn, Probe rund (40 M/13,3 cm, 60 Rd/14,3 cm → 30,1 M / 42 Rd),
  Rechner (23 cm −10 % → 64 M, L16–R16 je Bett; 16 cm → 67 Rd = RC +134; 54→90 über 120 R),
  Export/Import, Messblatt, Handy- und PC-Layout. Syntax von server.js/db.js per `new Function` im Browser.
- **NICHT geprüft: das Node-Backend selbst und alle deploy-Skripte** (kein Node am PC, kein Container).
  Shell-Skripte nur mit `bash -n`.

## Stufe A – was drin ist
- Backend `backend/server.js`: Payload-CRUD für personen/garne/proben/projekte/vorlagen, `/api/snapshot`,
  `/api/export`, `/api/import` (ersetzt alles in einer Transaktion), `/api/system` + `/api/system/update/:art`.
- Update auf Knopfdruck wie TrackingDRS: Anfrage-Datei in `/var/lib/maschenwerk/update/` →
  `.path`-Unit → `maschenwerk-selbstupdate pruefen|ausfuehren` (root) → Ergebnis in `/var/lib/maschenwerk-update/`.
  Vor dem Update `maschenwerk-backup`. Voller Git-Klon (nicht shallow), damit `rev-list --count` stimmt.
- `deploy/hilfsskripte.sh` wird von Setup UND Update aufgerufen (Hilfsbefehle, Units, Cron).
- Frontend: Hash-Router, jede Ansicht bekommt einen frischen Container (sonst stapeln sich Listener —
  war der erste Fehler: „Weiter" sprang zwei Maße). Ansichten mit Eingabefeldern haben `live: false`.
- Schätzung aus Schuhgröße: Fußlänge = Gr × 2/3 − 1,5; Umfang = Länge × 0,98 (≤ Gr 30) … 0,92 (≥ Gr 38);
  Rist ×1,04, Ferse ×1,36, Knöchel ×0,95, Wade = Knöchel ×1,5. Plausibilität: Länge ±10 %, Umfänge ±20 %.

## Entscheidungen (2026-11-02)
| Thema | Entscheidung |
|---|---|
| Maschine | KH-588 **ohne Lochkartenleser**: 8 Tasten zur Nadelvorwahl + Handauswahl (Nadeln nach D). Doppelbett **vorhanden: Brother KR-586**. |
| Socken | **rund auf dem Doppelbett** (Schlauch). 1 Runde = 2 Schlittenfahrten = RC +2. Maschenzahl rundherum, halbe je Bett. |
| Bündchen | wählbar: 1:1 Doppelbett, 2:1/2:2 Doppelbett, Mock-Rib einbettig |
| Ferse/Spitze | **mehrere Formen je Projekt wählbar** (Start: Bumerang in verkürzten Reihen nur auf dem Hauptbett, Ribber ruht) |
| Spitzenschluss | Hilfsgarn + **Maschenstich (Kitchener)**, App zeigt Kurzanleitung |
| Strickmodus | **gemischt**: Aktionen (Ferse, Umstellen) reihenweise, gerade Strecken als Block |
| Weiterzählen | **Knopf zuerst**, Zählschnittstelle (Webhook, z. B. `POST /api/zaehler`) gleich mitbauen; Sensor später: Zigbee-Kontakt am Bettende über Home Assistant **oder** ESP32/ESPHome mit Reed/Hall. Vor Aktionen hält die App an und piept; ±1-Korrektur. |
| Pullover | eingesetzte Ärmel, Raglan, überschnittene Schulter |
| Muster | Muster-Assistent für die 8 Vorwahltasten + Handauswahl, **Stufe E** |
| Garne | Garne (Lauflänge, Gewicht, Farbe) + Garnbedarf je Projekt, **kein Vorrat** |
| Zugriff | nur Matthias, nur Heimnetz, **kein Login** |
| Installation | **Einzeiler in der Proxmox-Shell** von 192.168.5.40; Update per `update` im Container + Knopf in den Einstellungen |
| Design | **Petrol `#23606e` + Wollrot `#c2553a`**, helle Oberfläche, dunkler Strickmodus |
| Name | **Maschenwerk** |

## Technik (vorgeschlagen, nicht widersprochen)
Wie ImkereiApp: Debian-12-LXC, Node + Express + better-sqlite3, Vanilla-JS-Frontend als PWA,
nginx mit selbstsigniertem HTTPS (Wake Lock braucht secure context; auf Debian 12
`listen 443 ssl http2;`, nicht `http2 on;`), PDF per jsPDF im Browser, nächtliches DB-Backup.

## Stufen
- **A** Fundament: Container, Installer, Update, Design, Personen, Garne, Maschenproben, Schnellrechner
- **B** Rundsocke, Projekt-Assistent, Strickmodus mit Zählschnittstelle, PDF → arbeitsfähig
- **C** Pullover (3 Schnitte), verteilte Zu-/Abnahmen, Schnittskizze im PDF
- **D** Sensor, Ist-Maße/Kalibrierung, Garnbedarf, Statistik
- **E** Muster-Assistent (8 Vorwahltasten + Handauswahl)

## Offen
- Belegung der 8 Vorwahltasten (Foto der Tasten oder der Anleitungsseite), spätestens zu Stufe E
- Ribber ist **KR-586** (2026-11-02). Noch offen: Hebelbezeichnungen, Rundstrick-Einstellung,
  Versatz-Skala, Maschenweitenbereich des Ribberschlosses aus der Bedienungsanleitung übernehmen
  (Foto/PDF der Seiten) — nicht raten. Übergang Rippenbündchen → Schlauch beim Bau der Sockenvorlage klären.

## Ergänzungen 2026-11-02 (ins Konzept übernommen, inkl. Mockups Messmaske + Checkliste)
- Maschineneinstellungen auf drei Ebenen: je Abschnitt geplant (MW Haupt/Ribber, Hebel, Tasten,
  Ribberschloss, Racking, Nadelanordnung, Gewichte, Fadenspanner, Garn) als Checkliste beim
  Abschnittswechsel · je Projekt tatsächlich gestrickt (Änderungen wirken auf Socke 2) ·
  benannte Einstellungs-Vorlagen
- Messmaske mit Fußzeichnung (Seite + oben), Messlinie leuchtet beim Feld auf, Hinweistexte je Maß,
  Plausibilitätsprüfung gegen Schuhgröße, Messblatt als PDF
- Rechenweg ausführlich im Konzept; Maschenprobe flach/rund unterscheiden (Socken bevorzugt runde
  Probe); optionale Wadenabnahme im Schaft
- Schuhgröße nur als Schätzung: Fußlänge ≈ Größe × 2/3 cm − 1,5 cm; Umfang nicht aus der Größe ableitbar
- Container-Nummer (CTID) und feste IP
- GitHub-Repo (Name, öffentlich/privat), Matthias legt es an
