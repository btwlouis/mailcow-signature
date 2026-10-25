#!/usr/bin/env python3
"""Uebernimmt die Anzeigenamen aller Postfaecher aus der mailcow-API nach users.json.

Manuell gepflegte Felder (Title, Mobile, ...) bleiben erhalten. Nur DisplayName
wird aus mailcow aktualisiert (ausser im Eintrag steht "DisplayNameLocked": true).

Aufruf (auf dem mailcow-Host, z. B. per Cronjob):
  MAILCOW_URL=https://mail.example.com MAILCOW_API_KEY=xxxx \
    python3 sync_users.py /opt/mailcow-dockerized/data/conf/rspamd/local.d/mailcow-signature/users.json

Der API-Key braucht nur Lesezugriff (mailcow UI -> System -> Konfiguration -> Zugang -> API).
"""
import json
import os
import sys
import tempfile
import urllib.request


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    url = os.environ.get("MAILCOW_URL", "").rstrip("/")
    key = os.environ.get("MAILCOW_API_KEY", "")
    if not url or not key:
        print("MAILCOW_URL und MAILCOW_API_KEY muessen gesetzt sein", file=sys.stderr)
        return 2

    req = urllib.request.Request(url + "/api/v1/get/mailbox/all", headers={"X-API-Key": key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        mailboxes = json.load(resp)
    if not isinstance(mailboxes, list):
        print("Unerwartete API-Antwort: %r" % (mailboxes,), file=sys.stderr)
        return 1

    try:
        with open(path, encoding="utf-8") as f:
            users = json.load(f)
    except FileNotFoundError:
        users = {}

    changed = 0
    for mb in mailboxes:
        addr = str(mb.get("username", "")).lower()
        name = str(mb.get("name") or "").strip()
        if not addr:
            continue
        entry = users.setdefault(addr, {})
        if name and not entry.get("DisplayNameLocked") and entry.get("DisplayName") != name:
            entry["DisplayName"] = name
            changed += 1

    directory = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".users.", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)
    print("%d Postfaecher, %d Namen aktualisiert" % (len(mailboxes), changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
