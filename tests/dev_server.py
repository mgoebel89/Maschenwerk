"""Entwicklungs-Server für Maschenwerk ohne Node.

Liefert app/ aus und bildet die REST-Schnittstelle des Node-Backends
(backend/server.js) nach, damit sich die Oberfläche am Entwicklungsrechner
vollständig durchklicken lässt. Daten liegen nur im Speicher.

    python tests/dev_server.py 8470
"""
import json
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"
VERSION = json.loads((Path(__file__).resolve().parent.parent / "backend" / "package.json").read_text(encoding="utf-8"))["version"]
TABELLEN = ["personen", "garne", "proben", "projekte", "vorlagen"]
DATEN = {t: {} for t in TABELLEN}
DATEN["settings"] = None


def jetzt():
    return datetime.now(timezone.utc).isoformat()


def alles():
    d = {t: list(DATEN[t].values()) for t in TABELLEN}
    d["settings"] = DATEN["settings"]
    return d


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(APP_DIR), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"null")

    def _teile(self):
        return [p for p in self.path.split("?")[0].split("/") if p][1:]   # ohne "api"

    def do_GET(self):
        # Quelltext des Node-Backends für die Syntaxprüfung im Browser
        # (am Entwicklungsrechner gibt es kein Node): new Function(text).
        if self.path.startswith("/__backend/"):
            name = self.path.split("/")[-1]
            datei = APP_DIR.parent / "backend" / name
            if name.endswith(".js") and datei.is_file():
                body = datei.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        if not self.path.startswith("/api/"):
            return super().do_GET()
        t = self._teile()
        if t == ["health"]:
            return self._json({"ok": True, "version": VERSION})
        if t == ["snapshot"]:
            return self._json({**alles(), "version": VERSION, "serverTime": jetzt()})
        if t == ["export"]:
            return self._json({"app": "maschenwerk", "version": VERSION, "exportiertAm": jetzt(), "daten": alles()})
        if t == ["system"]:
            return self._json({"eingerichtet": False, "version": VERSION, "pruefung": None, "lauf": None,
                               "laeuft": False, "wartet": {"pruefen": False, "ausfuehren": False}, "protokoll": ""})
        if len(t) == 1 and t[0] in TABELLEN:
            return self._json(list(DATEN[t[0]].values()))
        self._json({"error": "nicht gefunden"}, 404)

    def do_PUT(self):
        t = self._teile()
        if t == ["settings"]:
            DATEN["settings"] = self._body()
            return self._json(DATEN["settings"])
        if len(t) == 2 and t[0] in TABELLEN:
            obj = self._body()
            if not obj or obj.get("id") != t[1]:
                return self._json({"error": "id passt nicht"}, 400)
            obj["lastModifiedAt"] = jetzt()
            DATEN[t[0]][t[1]] = obj
            return self._json(obj)
        self._json({"error": "nicht gefunden"}, 404)

    def do_DELETE(self):
        t = self._teile()
        if len(t) == 2 and t[0] in TABELLEN:
            DATEN[t[0]].pop(t[1], None)
            self.send_response(204)
            self.end_headers()
            return
        self._json({"error": "nicht gefunden"}, 404)

    def do_POST(self):
        t = self._teile()
        if t == ["import"]:
            body = self._body() or {}
            if body.get("app") != "maschenwerk" or not body.get("daten"):
                return self._json({"error": "Das ist keine Maschenwerk-Sicherung."}, 400)
            for tab in TABELLEN:
                if isinstance(body["daten"].get(tab), list):
                    DATEN[tab] = {o["id"]: o for o in body["daten"][tab] if o and o.get("id")}
            if body["daten"].get("settings"):
                DATEN["settings"] = body["daten"]["settings"]
            return self._json({"ok": True})
        if len(t) == 3 and t[:2] == ["system", "update"]:
            return self._json({"error": "Das Update über die Seite geht nur im Container."}, 409)
        self._json({"error": "nicht gefunden"}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8470
    print(f"Maschenwerk-Dev {VERSION} auf http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
