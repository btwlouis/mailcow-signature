#!/usr/bin/env bash
# Runs the plugin inside a real rspamd container and checks the rewritten mails.
#   RSPAMD_IMAGE=rspamd/rspamd:latest bash tests/rspamd_integration.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${RSPAMD_IMAGE:-rspamd/rspamd:latest}"
NAME="mcsig-rspamd-$$"
WORK="$(mktemp -d)"
FAILS=0
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

pass() { printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; FAILS=$((FAILS + 1)); }

# --- Konfiguration wie auf einem mailcow-Host
SIG="$WORK/local.d/mailcow-signature"
mkdir -p "$WORK/local.d" "$WORK/custom"
cp "$ROOT/data/conf/rspamd/local.d/rspamd.lua" "$WORK/local.d/"
cp -r "$ROOT/data/conf/rspamd/local.d/mailcow-signature" "$SIG"
cp "$ROOT/data/conf/rspamd/custom/mailcow_signature.lua" "$WORK/custom/"
mkdir -p "$SIG/assets"
# 1x1 PNG als Logo
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82' > "$SIG/assets/0123456789abcdef.png"
mkdir -p "$SIG/templates/logo.example"
printf '<p><img src="https://mail.example.com/sig-assets/0123456789abcdef.png" width="80" alt="x">{{DisplayName}}</p>' > "$SIG/templates/logo.example/new.html"
printf '{{DisplayName}}' > "$SIG/templates/logo.example/new.txt"

write_config() { # $1 = logo_mode, $2 = dry_run
  cat > "$SIG/config.json" <<EOF
{ "enabled": true, "dry_run": $2, "live_senders": ["tester@example.com"],
  "domains": ["example.com", "logo.example"], "require_auth": true, "trusted_networks": [],
  "skip_calendar": true, "logo_mode": "$1",
  "vars": { "*": { "Company": "Integration GmbH" } } }
EOF
  echo '{ "max@example.com": { "DisplayName": "Max Integration", "Title": "Tester" } }' > "$SIG/users.json"
  chmod -R a+rX "$WORK"
}

start() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" \
    -v "$WORK/local.d/rspamd.lua:/etc/rspamd/local.d/rspamd.lua:ro" \
    -v "$SIG:/etc/rspamd/local.d/mailcow-signature:ro" \
    -v "$WORK/custom/mailcow_signature.lua:/etc/rspamd/custom/mailcow_signature.lua:ro" \
    "$IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    if printf 'Subject: ping\r\n\r\nping\r\n' | docker exec -i "$NAME" rspamc -h localhost:11333 >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  docker logs "$NAME" | tail -50
  echo "rspamd did not start"; exit 1
}

scan() { # $1 = mail file, rest = rspamc args
  local f="$1"; shift
  docker exec -i "$NAME" rspamc -h localhost:11333 "$@" --mime < "$f"
}

mail() { # $1 = from, $2 = body
  printf 'From: %s\r\nTo: x@external.org\r\nSubject: Test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="b1"\r\n\r\n--b1\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n--b1\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n<html><body><p>%s</p></body></html>\r\n--b1--\r\n' "$1" "$2" "$2"
}

# --- Lauf 1: Link-Modus, live
write_config link false
start
if docker logs "$NAME" 2>&1 | grep -q "mailcow_signature: loaded"; then pass "plugin loaded"; else fail "plugin loaded"; docker logs "$NAME" 2>&1 | grep -i -E "error|lua" | tail -20; fi

mail "Max <max@example.com>" "Hallo" > "$WORK/m1.eml"
OUT="$(scan "$WORK/m1.eml" -u max@example.com -F max@example.com -r x@external.org)"
grep -q "Max Integration" <<<"$OUT" && pass "signature inserted (html + text)" || { fail "signature inserted"; echo "$OUT" | tail -40; }
grep -q 'data-mcsig="1"' <<<"$OUT" && pass "html marker present" || fail "html marker present"
grep -q "MAILCOW_SIGNATURE" <<<"$OUT" && pass "symbol reported" || fail "symbol reported"
grep -q "Integration GmbH" <<<"$OUT" && pass "company var from config" || fail "company var from config"

OUT="$(scan "$WORK/m1.eml" -F max@example.com -r x@external.org)"
grep -q "Max Integration" <<<"$OUT" && fail "unauthenticated mail untouched" || pass "unauthenticated mail untouched"

mail "Ext <someone@other.org>" "Hallo" > "$WORK/m2.eml"
OUT="$(scan "$WORK/m2.eml" -u someone@other.org -F someone@other.org -r x@external.org)"
grep -q "data-mcsig" <<<"$OUT" && fail "foreign domain untouched" || pass "foreign domain untouched"

printf 'From: max@example.com\r\nTo: x@external.org\r\nSubject: signed\r\nMIME-Version: 1.0\r\nContent-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="s1"\r\n\r\n--s1\r\nContent-Type: text/plain\r\n\r\nsigned body\r\n--s1\r\nContent-Type: application/pkcs7-signature; name=smime.p7s\r\n\r\nAAAA\r\n--s1--\r\n' > "$WORK/m3.eml"
OUT="$(scan "$WORK/m3.eml" -u max@example.com -F max@example.com -r x@external.org)"
grep -q "Max Integration" <<<"$OUT" && fail "S/MIME untouched" || pass "S/MIME untouched"

# --- Lauf 2: eingebettetes Logo
write_config embed false
start
mail "Logo <max@logo.example>" "Logo-Test" > "$WORK/m4.eml"
OUT="$(scan "$WORK/m4.eml" -u max@logo.example -F max@logo.example -r x@external.org)"
grep -q 'src="cid:mcsig\.' <<<"$OUT" && pass "embed: html references cid" || { fail "embed: html references cid"; echo "$OUT" | tail -40; }
grep -q 'Content-ID: <mcsig\.' <<<"$OUT" && pass "embed: image part attached" || fail "embed: image part attached"
grep -q 'multipart/related' <<<"$OUT" && pass "embed: multipart/related created" || fail "embed: multipart/related created"

# --- Lauf 3: Testmodus mit Live-Tester
write_config link true
start
OUT="$(scan "$WORK/m1.eml" -u max@example.com -F max@example.com -r x@external.org)"
grep -q "Max Integration" <<<"$OUT" && fail "dry run: mail unchanged" || pass "dry run: mail unchanged"
SYM="$(docker exec -i "$NAME" rspamc -h localhost:11333 -u max@example.com -F max@example.com -r x@external.org < "$WORK/m1.eml")"
grep -q "MAILCOW_SIGNATURE.*dry_run" <<<"$SYM" && pass "dry run: symbol says dry_run" || { fail "dry run: symbol says dry_run"; echo "$SYM"; }
mail "Tester <tester@example.com>" "Hallo" > "$WORK/m5.eml"
OUT="$(scan "$WORK/m5.eml" -u tester@example.com -F tester@example.com -r x@external.org)"
grep -q 'data-mcsig="1"' <<<"$OUT" && pass "dry run: live tester gets signature" || fail "dry run: live tester gets signature"

echo
if [ "$FAILS" -eq 0 ]; then echo "rspamd integration: all passed"; else
  docker logs "$NAME" 2>&1 | grep -i mailcow_signature | tail -20
  echo "rspamd integration: $FAILS failed"; exit 1
fi
