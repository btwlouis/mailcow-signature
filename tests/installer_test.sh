#!/usr/bin/env bash
# Tests install.sh against a fake mailcow directory with a stubbed docker CLI.
#   bash tests/installer_test.sh        (needs python3 with PyYAML)
set -euo pipefail
trap '[ -n "${GITHUB_ACTIONS:-}" ] && echo "::error title=aborted at line $LINENO::$BASH_COMMAND"' ERR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PY="${PYTHON:-python3}"
FAILS=0

pass() { printf 'PASS %s\n' "$1"; }
fail() {
  printf 'FAIL %s\n' "$1"; FAILS=$((FAILS + 1))
  # in GitHub Actions als Annotation, damit der Grund ohne Login sichtbar ist
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error title=$1::$(tail -15 "$WORK/out.log" 2>/dev/null | annotate)"
  fi
}
annotate() { sed -e 's/%/%25/g' -e 's/\r//g' | awk 'BEGIN{ORS="%0A"} {print}'; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

MC="$WORK/mailcow"
mkdir -p "$WORK/bin" "$MC/data/conf/rspamd/custom" "$MC/data/conf/rspamd/local.d" "$MC/data/web"
cat > "$MC/mailcow.conf" <<'EOF'
MAILCOW_HOSTNAME=mail.example.com
DBNAME=mailcow
DBUSER=mailcow
DBPASS=secret
TZ=Europe/Berlin
EOF

# docker stub: validates the override YAML, fakes mysql and rspamd logs
cat > "$WORK/bin/docker" <<EOF
#!/usr/bin/env bash
case "\$1 \$2" in
  "compose version") echo "Docker Compose v2" ;;
  "compose config")
    [ -f docker-compose.override.yml ] || exit 0
    "$PY" -c "import yaml; d = yaml.safe_load(open('docker-compose.override.yml')); assert isinstance(d.get('services'), dict)" ;;
  "compose exec") printf 'example.com\nexample.org\n' ;;
  "compose logs") echo "rspamd: mailcow_signature: loaded (symbol id 1)" ;;
  "ps --filter") echo "$MC" ;;
esac
exit 0
EOF
printf '#!/usr/bin/env bash\necho 0\n' > "$WORK/bin/id"
chmod +x "$WORK/bin/"*
export PATH="$WORK/bin:$PATH" MCS_BACKUP_DIR="$WORK/backups"
run() { bash "$ROOT/install.sh" "$@" > "$WORK/out.log" 2>&1; }
yaml() { (cd "$MC" && "$PY" -c "import yaml; d=yaml.safe_load(open('docker-compose.override.yml')); print($1)"); }
SIG="$MC/data/conf/rspamd/local.d/mailcow-signature"

# 1) fresh install
run --listen 10.1.0.4 || { cat "$WORK/out.log"; fail "fresh install exits 0"; }
check "fresh: plugin installed" "[ -f '$MC/data/conf/rspamd/custom/mailcow_signature.lua' ]"
check "fresh: loader created" "grep -q mailcow_signature.lua '$MC/data/conf/rspamd/local.d/rspamd.lua'"
check "fresh: domains from database" "grep -q '\"example.org\"' '$SIG/config.json'"
check "fresh: dry run on" "grep -q '\"dry_run\": true' '$SIG/config.json'"
check "fresh: config is valid JSON" "(cd '$SIG' && $PY -c 'import json; json.load(open(\"config.json\"))')"
check "fresh: password generated" "grep -Eq '^SIGNATURE_UI_PASSWORD=.{24}$' '$MC/mailcow.conf'"
check "fresh: bind address" "grep -q '^SIGNATURE_UI_BIND=10.1.0.4$' '$MC/mailcow.conf'"
check "fresh: UI service in override" "[ \"\$(yaml \"'signature-ui-mailcow' in d['services']\")\" = True ]"
check "fresh: assets dir" "[ -d '$MC/data/web/sig-assets' ]"
check "fresh: dir permissions 755" "[ \"\$(stat -c %a '$SIG/templates')\" = 755 ]"
check "fresh: summary printed" "grep -q 'mailcow-signature installed' '$WORK/out.log'"

# 2) re-run is idempotent
PW="$(grep '^SIGNATURE_UI_PASSWORD=' "$MC/mailcow.conf")"
echo '{"marker": true}' > "$SIG/users.json"
run || fail "re-run exits 0"
check "rerun: one UI block" "[ \"\$(grep -c 'signature-ui-mailcow:' '$MC/docker-compose.override.yml')\" = 1 ]"
check "rerun: password kept" "grep -qx '$PW' '$MC/mailcow.conf'"
check "rerun: users kept" "grep -q marker '$SIG/users.json'"
check "rerun: one loader line" "[ \"\$(grep -c mailcow_signature.lua '$MC/data/conf/rspamd/local.d/rspamd.lua')\" = 1 ]"

# 3) uninstall restores an existing override exactly
run --uninstall || fail "uninstall exits 0"
cat > "$MC/docker-compose.override.yml" <<'EOF'
services:
    # existing
    clamd-mailcow:
        environment:
            - SKIP_CLAMD=y
EOF
cp "$MC/docker-compose.override.yml" "$WORK/orig.yml"
run || fail "install into existing override exits 0"
check "merge: both services" "[ \"\$(yaml \"sorted(d['services'])\")\" = \"['clamd-mailcow', 'signature-ui-mailcow']\" ]"
check "merge: 4-space indent kept" "grep -q '^    signature-ui-mailcow:' '$MC/docker-compose.override.yml'"
run --uninstall || fail "uninstall exits 0"
check "uninstall: override restored" "cmp -s '$WORK/orig.yml' '$MC/docker-compose.override.yml'"
check "uninstall: loader removed" "[ ! -f '$MC/data/conf/rspamd/local.d/rspamd.lua' ]"
check "uninstall: plugin removed" "[ ! -f '$MC/data/conf/rspamd/custom/mailcow_signature.lua' ]"
check "uninstall: config kept" "[ -f '$SIG/config.json' ]"
check "uninstall: mailcow.conf cleaned" "! grep -q '^SIGNATURE_UI_' '$MC/mailcow.conf'"

# 4) migration from the old custom/signature location
mv "$SIG" "$MC/data/conf/rspamd/custom/signature"
chmod 644 "$MC/data/conf/rspamd/custom/signature/templates"
run || fail "migration exits 0"
check "migration: moved to local.d" "[ -f '$SIG/config.json' ] && [ ! -d '$MC/data/conf/rspamd/custom/signature' ]"
check "migration: permissions fixed" "[ \"\$(stat -c %a '$SIG/templates')\" = 755 ]"

# 5) purge
run --uninstall --purge || fail "purge exits 0"
check "purge: data deleted" "[ ! -d '$SIG' ] && [ ! -d '$MC/data/web/sig-assets' ]"

# 6) invalid --listen is rejected before anything happens
if bash "$ROOT/install.sh" --listen 'x;y' > "$WORK/out.log" 2>&1; then fail "bad --listen rejected"; else pass "bad --listen rejected"; fi

echo
[ "$FAILS" -eq 0 ] && echo "installer tests: all passed" || { echo "installer tests: $FAILS failed"; exit 1; }
