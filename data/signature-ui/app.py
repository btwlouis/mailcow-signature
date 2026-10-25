#!/usr/bin/env python3
"""Weboberflaeche fuer mailcow-signature (nur Python-Standardbibliothek).

  SIGNATURE_UI_PASSWORD=geheim python3 app.py \
      --data /opt/mailcow-dockerized/data/conf/rspamd/local.d/mailcow-signature \
      --bind 127.0.0.1 --port 8090

Optional fuer den Abgleich von Domains und Anzeigenamen: MAILCOW_URL, MAILCOW_API_KEY.
Logos werden in --assets gespeichert (mailcow: data/web/sig-assets) und sind dann
oeffentlich unter SIGNATURE_ASSET_URL erreichbar (Standard: MAILCOW_URL/sig-assets/).
"""
import hashlib
import argparse
import hmac
import http.server
import json
import os
import re
import secrets
import shutil
import tempfile
import threading
import time
import urllib.request
from http import cookies

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
STATIC_TYPES = {"js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8", "svg": "image/svg+xml",
                "png": "image/png", "woff2": "font/woff2"}
TEMPLATE_FILES = ("new.html", "new.txt", "reply.html", "reply.txt", "design.json")
ASSET_RE = re.compile(r"^[a-f0-9]{16}\.(png|jpg|gif)$")
ASSET_TYPES = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif"}
LEVEL_RE = re.compile(r"^(default|[a-z0-9][a-z0-9._+-]*(@[a-z0-9][a-z0-9.-]*)?)$")
SESSION_TTL = 8 * 3600
MAX_BODY = 2 * 1024 * 1024

DATA = ""
ASSETS = ""
ASSET_URL = ""
PASSWORD = ""
sessions = {}
failed_logins = {}
lock = threading.Lock()


# --------------------------------------------------------------------------- Dateien

def fix_permissions():
    """rspamd (Benutzer _rspamd) muss die Ordner betreten koennen: Ordner 755, Dateien 644."""
    for root, dirs, files in os.walk(DATA):
        for d in dirs:
            p = os.path.join(root, d)
            if os.stat(p).st_mode & 0o777 != 0o755:
                os.chmod(p, 0o755)
        for f in files:
            p = os.path.join(root, f)
            if os.stat(p).st_mode & 0o777 != 0o644:
                os.chmod(p, 0o644)
    if os.stat(DATA).st_mode & 0o777 != 0o755:
        os.chmod(DATA, 0o755)


def permission_watchdog():
    while True:
        try:
            sync_assets()
            fix_permissions()
        except OSError as e:
            print("fix_permissions: %s" % e)
        time.sleep(60)


def atomic_write(path, data: bytes):
    os.makedirs(os.path.dirname(path), mode=0o755, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp.")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def read_json(name, default):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_json(name, obj):
    path = os.path.join(DATA, name)
    if os.path.exists(path):
        shutil.copy2(path, path + ".bak")
    atomic_write(path, (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def tpl_dir(level):
    if not LEVEL_RE.match(level) or ".." in level:
        raise ValueError("Ungueltiger Name: %r" % level)
    return os.path.join(DATA, "templates", level)


def read_templates():
    out = {}
    base = os.path.join(DATA, "templates")
    if os.path.isdir(base):
        for level in sorted(os.listdir(base)):
            d = os.path.join(base, level)
            if not os.path.isdir(d) or not LEVEL_RE.match(level):
                continue
            files = {}
            for fn in TEMPLATE_FILES:
                p = os.path.join(d, fn)
                if os.path.isfile(p):
                    with open(p, encoding="utf-8", errors="replace") as f:
                        files[fn] = f.read()
                else:
                    files[fn] = None
            out[level] = files
    return out


def write_templates(level, files):
    d = tpl_dir(level)
    for fn in TEMPLATE_FILES:
        p = os.path.join(d, fn)
        val = files.get(fn)
        if val is None:
            if os.path.exists(p):
                os.remove(p)
        else:
            if not isinstance(val, str):
                raise ValueError("Vorlage %s muss Text sein" % fn)
            atomic_write(p, val.replace("\r\n", "\n").encode("utf-8"))


def delete_templates(level):
    if level == "default":
        raise ValueError("Die Standard-Signatur kann nicht geloescht werden")
    d = tpl_dir(level)
    if os.path.isdir(d):
        shutil.rmtree(d)


def validate_config(cfg):
    if not isinstance(cfg, dict):
        raise ValueError("config muss ein Objekt sein")
    for key in ("domains", "trusted_networks", "exclude_senders", "internal_domains", "live_senders"):
        if key in cfg and not (isinstance(cfg[key], list) and all(isinstance(x, str) for x in cfg[key])):
            raise ValueError("%s muss eine Liste von Texten sein" % key)
    for key in ("enabled", "dry_run", "require_auth", "skip_internal", "skip_calendar"):
        if key in cfg and not isinstance(cfg[key], bool):
            raise ValueError("%s muss true/false sein" % key)
    if cfg.get("logo_mode", "link") not in ("link", "embed"):
        raise ValueError("logo_mode muss link oder embed sein")
    if "vars" in cfg and not isinstance(cfg["vars"], dict):
        raise ValueError("vars muss ein Objekt sein")
    sigs = cfg.get("signatures", {})
    if not isinstance(sigs, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in sigs.items()):
        raise ValueError("signatures muss {ebene: signatur-id} sein")
    cfg["domains"] = sorted({d.strip().lower() for d in cfg.get("domains", []) if d.strip()})
    for key in ("exclude_senders", "live_senders"):
        if key in cfg:
            cfg[key] = sorted({a.strip().lower() for a in cfg[key] if a.strip()})
            bad = [a for a in cfg[key] if not re.match(r"^[^@\s]+@[^@\s]+$", a)]
            if bad:
                raise ValueError("Ungueltige Adresse in %s: %s" % (key, ", ".join(bad)))
    return cfg


def validate_library(lib):
    """Signatur-Bibliothek: {id: {"name": str, "design": {...}}} – nur fuer die UI, das Plugin
    liest weiterhin die daraus erzeugten Vorlagen in templates/<ebene>/."""
    if not isinstance(lib, dict):
        raise ValueError("library muss ein Objekt sein")
    for sid, entry in lib.items():
        if not re.match(r"^[a-z0-9_-]{1,64}$", sid):
            raise ValueError("Ungueltige Signatur-ID: %r" % sid)
        if not isinstance(entry, dict) or not isinstance(entry.get("name"), str) or not isinstance(entry.get("design"), dict):
            raise ValueError("Signatur %s braucht name und design" % sid)
    return lib


def validate_users(users):
    if not isinstance(users, dict):
        raise ValueError("users muss ein Objekt sein")
    clean = {}
    for addr, fields in users.items():
        addr = addr.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+$", addr):
            raise ValueError("Ungueltige Adresse: %r" % addr)
        if not isinstance(fields, dict):
            raise ValueError("Eintrag %s muss ein Objekt sein" % addr)
        clean[addr] = {str(k): v for k, v in fields.items() if v not in (None, "")}
    return clean


def asset_kind(data: bytes):
    if data.startswith(bytes.fromhex("89504e470d0a1a0a")):
        return "png"
    if data.startswith(bytes.fromhex("ffd8ff")):
        return "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


def save_asset(data: bytes):
    kind = asset_kind(data)
    if not kind:
        raise ValueError("Nur PNG, JPG oder GIF erlaubt (SVG zeigen Outlook und Gmail nicht an)")
    name = "%s.%s" % (hashlib.sha256(data).hexdigest()[:16], kind)
    os.makedirs(ASSETS, mode=0o755, exist_ok=True)
    os.chmod(ASSETS, 0o755)
    path = os.path.join(ASSETS, name)
    if not os.path.exists(path):
        atomic_write(path, data)
    sync_assets()
    return {"name": name, "url": ASSET_URL + name, "size": len(data)}


def sync_assets():
    """Kopie der Logos in den rspamd-Ordner, damit das Plugin sie einbetten kann."""
    if not os.path.isdir(ASSETS):
        return
    target = os.path.join(DATA, "assets")
    os.makedirs(target, mode=0o755, exist_ok=True)
    present = set(n for n in os.listdir(ASSETS) if ASSET_RE.match(n))
    for name in present:
        dst = os.path.join(target, name)
        if not os.path.exists(dst):
            shutil.copyfile(os.path.join(ASSETS, name), dst)
            os.chmod(dst, 0o644)
    for name in os.listdir(target):
        if ASSET_RE.match(name) and name not in present:
            os.remove(os.path.join(target, name))


def list_assets():
    if not os.path.isdir(ASSETS):
        return []
    out = []
    for name in sorted(os.listdir(ASSETS)):
        if ASSET_RE.match(name):
            p = os.path.join(ASSETS, name)
            out.append({"name": name, "url": ASSET_URL + name, "size": os.path.getsize(p),
                        "mtime": int(os.path.getmtime(p))})
    out.sort(key=lambda a: -a["mtime"])
    return out


def delete_asset(name):
    if not ASSET_RE.match(name):
        raise ValueError("Ungueltiger Dateiname")
    for p in (os.path.join(ASSETS, name), os.path.join(DATA, "assets", name)):
        if os.path.exists(p):
            os.remove(p)


def mailcow_api(path):
    url = os.environ.get("MAILCOW_URL", "").rstrip("/")
    key = os.environ.get("MAILCOW_API_KEY", "")
    if not url or not key:
        raise ValueError("MAILCOW_URL und MAILCOW_API_KEY sind nicht gesetzt")
    req = urllib.request.Request(url + path, headers={"X-API-Key": key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    if not isinstance(data, list):
        raise ValueError("Unerwartete Antwort der mailcow-API (%s)" % path)
    return data


def mailcow_sync():
    mailboxes = mailcow_api("/api/v1/get/mailbox/all")
    domains = mailcow_api("/api/v1/get/domain/all")

    cfg = read_json("config.json", {})
    have = set(cfg.get("domains", []))
    new_domains = sorted({str(d.get("domain_name", "")).lower() for d in domains
                          if str(d.get("active", "1")) in ("1", "True", "true") and d.get("domain_name")} - have)
    if new_domains:
        cfg["domains"] = sorted(have | set(new_domains))
        write_json("config.json", validate_config(cfg))
    users = read_json("users.json", {})
    added = updated = 0
    for mb in mailboxes:
        addr = str(mb.get("username", "")).lower()
        name = str(mb.get("name") or "").strip()
        if not addr:
            continue
        if addr not in users:
            users[addr] = {}
            added += 1
        entry = users[addr]
        if name and not entry.get("DisplayNameLocked") and entry.get("DisplayName") != name:
            entry["DisplayName"] = name
            updated += 1
    write_json("users.json", users)
    fix_permissions()
    return {"mailboxes": len(mailboxes), "added": added, "updated": updated, "domains_added": new_domains}


# --------------------------------------------------------------------------- HTTP

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "mailcow-signature-ui"

    def log_message(self, fmt, *args):
        print("%s %s" % (self.address_string(), fmt % args))

    # Helfer
    def send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if "Cache-Control" not in (extra or {}):
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                         "font-src https://fonts.gstatic.com; img-src * data: blob:; frame-src 'self'; "
                         "script-src 'self'")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def session(self):
        c = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        tok = c.get("sigui")
        if not tok:
            return None
        with lock:
            exp = sessions.get(tok.value)
            if not exp or exp < time.time():
                sessions.pop(tok.value, None)
                return None
            sessions[tok.value] = time.time() + SESSION_TTL
        return tok.value

    def body_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("Anfrage zu gross")
        return json.loads(self.rfile.read(n).decode("utf-8") or "null")

    def api_guard(self):
        # CSRF-Schutz: nur JSON mit eigenem Header (ein fremdes Formular kann den nicht setzen)
        if self.command != "GET" and self.headers.get("X-Requested-With") != "sigui":
            self.send(403, {"error": "CSRF-Pruefung fehlgeschlagen"})
            return False
        if not self.session():
            self.send(401, {"error": "Nicht angemeldet"})
            return False
        return True

    # Routen
    def do_GET(self):
        # Fehler nie als leere Antwort enden lassen (Browser: ERR_EMPTY_RESPONSE)
        try:
            self.get()
        except Exception as e:  # noqa: BLE001
            print("GET %s failed: %r" % (self.path, e))
            self.send(500, ("Fehler: %s" % e).encode(), "text/plain; charset=utf-8")

    def get(self):
        if self.path in ("/", "/index.html"):
            index = os.path.join(DIST, "index.html")
            if not os.path.isfile(index):
                return self.send(500, ("Web UI fehlt: %s nicht gefunden. Installer erneut ausfuehren." % index).encode(),
                                 "text/plain; charset=utf-8")
            with open(index, "rb") as f:
                return self.send(200, f.read(), "text/html; charset=utf-8")
        if self.path.startswith("/static/"):
            # React-Build (webui/ -> dist/static)
            name = self.path[len("/static/"):].split("?", 1)[0]
            p = os.path.join(DIST, "static", name)
            ext = name.rsplit(".", 1)[-1]
            if re.match(r"^[\w.-]+$", name) and ext in STATIC_TYPES and os.path.isfile(p):
                with open(p, "rb") as f:
                    return self.send(200, f.read(), STATIC_TYPES[ext], extra={"Cache-Control": "public, max-age=31536000, immutable"})
        if self.path == "/api/state":
            if not self.api_guard():
                return
            return self.send(200, {
                "config": read_json("config.json", {}),
                "users": read_json("users.json", {}),
                "templates": read_templates(),
                "library": read_json("library.json", {}),
                "sync_available": bool(os.environ.get("MAILCOW_URL") and os.environ.get("MAILCOW_API_KEY")),
                "assets": list_assets(),
                "asset_url": ASSET_URL,
            })
        if self.path.startswith("/assets/"):
            # Vorschau im VPN, auch wenn die oeffentliche Adresse (noch) nicht erreichbar ist
            name = self.path[len("/assets/"):].split("?", 1)[0]
            p = os.path.join(ASSETS, name)
            if ASSET_RE.match(name) and os.path.isfile(p):
                with open(p, "rb") as f:
                    return self.send(200, f.read(), ASSET_TYPES[name.rsplit(".", 1)[1]])
        if self.path == "/api/session":
            return self.send(200, {"authenticated": bool(self.session())})
        self.send(404, {"error": "Nicht gefunden"})

    def do_POST(self):
        try:
            if self.path == "/api/login":
                return self.login()
            if self.path == "/api/logout":
                tok = self.session()
                with lock:
                    sessions.pop(tok, None)
                return self.send(200, {"ok": True}, extra={"Set-Cookie": "sigui=; Max-Age=0; Path=/"})
            if not self.api_guard():
                return
            if self.path == "/api/sync":
                return self.send(200, mailcow_sync())
            if self.path == "/api/assets":
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > MAX_BODY:
                    raise ValueError("Bild fehlt oder ist groesser als 2 MB")
                return self.send(200, save_asset(self.rfile.read(n)))
            self.send(404, {"error": "Nicht gefunden"})
        except ValueError as e:
            self.send(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            self.send(500, {"error": "Interner Fehler: %s" % e})

    def do_PUT(self):
        try:
            if not self.api_guard():
                return
            data = self.body_json()
            if self.path == "/api/config":
                write_json("config.json", validate_config(data))
            elif self.path == "/api/library":
                write_json("library.json", validate_library(data))
            elif self.path == "/api/users":
                write_json("users.json", validate_users(data))
            elif self.path.startswith("/api/templates/"):
                write_templates(self.path[len("/api/templates/"):].lower(), data or {})
            else:
                return self.send(404, {"error": "Nicht gefunden"})
            fix_permissions()
            self.send(200, {"ok": True})
        except ValueError as e:
            self.send(400, {"error": str(e)})

    def do_DELETE(self):
        try:
            if not self.api_guard():
                return
            if self.path.startswith("/api/templates/"):
                delete_templates(self.path[len("/api/templates/"):].lower())
                return self.send(200, {"ok": True})
            if self.path.startswith("/api/assets/"):
                delete_asset(self.path[len("/api/assets/"):])
                return self.send(200, {"ok": True})
            self.send(404, {"error": "Nicht gefunden"})
        except ValueError as e:
            self.send(400, {"error": str(e)})

    def login(self):
        ip = self.client_address[0]
        now = time.time()
        with lock:
            fails = [t for t in failed_logins.get(ip, []) if now - t < 600]
            failed_logins[ip] = fails
        if len(fails) >= 10:
            return self.send(429, {"error": "Zu viele Fehlversuche, bitte 10 Minuten warten"})
        data = self.body_json() or {}
        pw = str(data.get("password", ""))
        if not hmac.compare_digest(pw.encode(), PASSWORD.encode()):
            with lock:
                failed_logins.setdefault(ip, []).append(now)
            time.sleep(1)
            return self.send(403, {"error": "Falsches Passwort"})
        tok = secrets.token_urlsafe(32)
        with lock:
            sessions[tok] = now + SESSION_TTL
        secure = "; Secure" if os.environ.get("SIGNATURE_UI_SECURE_COOKIE") == "1" else ""
        self.send(200, {"ok": True},
                  extra={"Set-Cookie": "sigui=%s; HttpOnly; SameSite=Strict; Path=/%s" % (tok, secure)})


def main():
    global DATA, PASSWORD, ASSETS, ASSET_URL
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=os.environ.get("SIGNATURE_DATA", "/data"))
    ap.add_argument("--assets", default=os.environ.get("SIGNATURE_ASSETS", "/assets"))
    ap.add_argument("--bind", default=os.environ.get("SIGNATURE_UI_BIND", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SIGNATURE_UI_PORT", "8090")))
    args = ap.parse_args()
    DATA = os.path.abspath(args.data)
    ASSETS = os.path.abspath(args.assets)
    ASSET_URL = os.environ.get("SIGNATURE_ASSET_URL") or (os.environ.get("MAILCOW_URL", "").rstrip("/") + "/sig-assets/")
    if not ASSET_URL.endswith("/"):
        ASSET_URL += "/"
    PASSWORD = os.environ.get("SIGNATURE_UI_PASSWORD", "")
    if len(PASSWORD) < 10:
        raise SystemExit("SIGNATURE_UI_PASSWORD muss gesetzt sein (mind. 10 Zeichen)")
    if not os.path.isdir(DATA):
        raise SystemExit("Datenverzeichnis nicht gefunden: %s" % DATA)
    threading.Thread(target=permission_watchdog, daemon=True).start()
    srv = http.server.ThreadingHTTPServer((args.bind, args.port), Handler)
    print("mailcow-signature UI: http://%s:%d  (Daten: %s)" % (args.bind, args.port, DATA))
    srv.serve_forever()


if __name__ == "__main__":
    main()
