#!/usr/bin/env bash
# mailcow-signature installer
#
#   curl -fsSL https://raw.githubusercontent.com/btwlouis/mailcow-signature/main/install.sh | sudo bash
#
# Options (as arguments or env vars):
#   --dir <path>     mailcow directory (MAILCOW_DIR), auto-detected by default
#   --ref <ref>      branch/tag to install (MCS_REF, default: main)
#   --no-ui          install only the rspamd plugin, no web UI
#   --listen <ip>    address the web UI listens on (SIGNATURE_UI_BIND in mailcow.conf),
#                    e.g. a private/VPN IP like 10.1.0.4; default 127.0.0.1
#   --uninstall      remove plugin and web UI (signature config is kept)
#   --purge          with --uninstall: also delete templates/config/users
#
# Re-running the installer updates the code and keeps your configuration.

set -euo pipefail
trap 'echo "ERROR: installer failed at line $LINENO" >&2' ERR

REPO="btwlouis/mailcow-signature"
MARK_BEGIN="# >>> mailcow-signature (managed by install.sh)"
MARK_END="# <<< mailcow-signature"
LOADER_LINE="dofile('/etc/rspamd/custom/mailcow_signature.lua') -- mailcow-signature"
BACKUP_ROOT="${MCS_BACKUP_DIR:-/var/backups/mailcow-signature}"

# directory of this script when run from a git clone (empty for "curl | bash")
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_dim=$'\e[2m'; c_b=$'\e[1m'; c_0=$'\e[0m'
[ -t 1 ] || { c_ok=; c_warn=; c_err=; c_dim=; c_b=; c_0=; }
info() { printf '%s==>%s %s\n' "$c_ok" "$c_0" "$*"; }
warn() { printf '%s!!%s  %s\n' "$c_warn" "$c_0" "$*"; }
die()  { printf '%sERROR:%s %s\n' "$c_err" "$c_0" "$*" >&2; exit 1; }

main() {
  local mode=install with_ui=1 purge=0
  MAILCOW_DIR="${MAILCOW_DIR:-}"
  MCS_REF="${MCS_REF:-main}"
  MCS_LISTEN="${MCS_LISTEN:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir) MAILCOW_DIR="$2"; shift ;;
      --ref) MCS_REF="$2"; shift ;;
      --no-ui) with_ui=0 ;;
      --uninstall) mode=uninstall ;;
      --purge) purge=1 ;;
      --listen) MCS_LISTEN="$2"; shift ;;
      -h|--help) sed -n '2,17p' "$0" 2>/dev/null || true; exit 0 ;;
      *) die "Unknown option: $1" ;;
    esac
    shift
  done

  if [ -n "$MCS_LISTEN" ] && ! [[ "$MCS_LISTEN" =~ ^[0-9a-fA-F.:]+$ ]]; then
    die "--listen expects an IP address, got: $MCS_LISTEN"
  fi
  [ "$(id -u)" -eq 0 ] || die "Please run as root (sudo)."
  command -v docker >/dev/null || die "docker not found."
  if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null; then COMPOSE=(docker-compose)
  else die "docker compose not found."; fi

  detect_mailcow
  cd "$MAILCOW_DIR"
  RSPAMD="$MAILCOW_DIR/data/conf/rspamd"
  SIGDIR="$RSPAMD/local.d/mailcow-signature"

  if [ "$mode" = uninstall ]; then uninstall "$purge"; return; fi

  fetch_source
  backup
  migrate_data_dir
  install_plugin
  install_config
  if [ "$with_ui" = 1 ]; then install_ui; fi
  restart_services "$with_ui"
  summary "$with_ui"
}

# --------------------------------------------------------------------------- helpers

detect_mailcow() {
  if [ -z "$MAILCOW_DIR" ]; then
    MAILCOW_DIR="$(docker ps --filter 'name=rspamd-mailcow' \
      --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null | head -n1 || true)"
  fi
  [ -n "$MAILCOW_DIR" ] || MAILCOW_DIR=/opt/mailcow-dockerized
  [ -f "$MAILCOW_DIR/mailcow.conf" ] && [ -d "$MAILCOW_DIR/data/conf/rspamd" ] \
    || die "No mailcow installation found in $MAILCOW_DIR (use --dir <path>)."
  info "mailcow found in ${c_b}$MAILCOW_DIR${c_0}"
}

fetch_source() {
  local here="$SCRIPT_DIR"
  if [ -n "$here" ] && [ -f "$here/install.sh" ] && [ -f "$here/data/signature-ui/app.py" ] \
      && [ -f "$here/data/conf/rspamd/custom/mailcow_signature.lua" ]; then
    SRC="$here"
    info "Using local source in $SRC"
    return
  fi
  command -v curl >/dev/null || die "curl not found."
  command -v tar >/dev/null || die "tar not found."
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  info "Downloading $REPO@$MCS_REF"
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$MCS_REF" | tar -xz -C "$TMP" --strip-components=1 \
    || die "Download failed."
  [ -f "$TMP/data/conf/rspamd/custom/mailcow_signature.lua" ] || die "Downloaded archive is incomplete."
  SRC="$TMP"
}

backup() {
  BACKUP="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP"
  tar -czf "$BACKUP/rspamd-conf.tar.gz" -C "$MAILCOW_DIR/data/conf" rspamd
  cp -p mailcow.conf "$BACKUP/"
  [ -f docker-compose.override.yml ] && cp -p docker-compose.override.yml "$BACKUP/"
  info "Backup written to $BACKUP"
}

install_plugin() {
  install -m 0644 "$SRC/data/conf/rspamd/custom/mailcow_signature.lua" "$RSPAMD/custom/mailcow_signature.lua"
  local loader="$RSPAMD/local.d/rspamd.lua"
  if [ ! -f "$loader" ]; then
    printf -- '-- rspamd loads this file automatically ($LOCAL_CONFDIR/local.d/rspamd.lua)\n%s\n' "$LOADER_LINE" > "$loader"
    chmod 0644 "$loader"
  elif ! grep -q "mailcow_signature.lua" "$loader"; then
    warn "$loader already exists, appending loader line"
    printf '\n%s\n' "$LOADER_LINE" >> "$loader"
  fi
  info "rspamd plugin installed"
}

mailcow_domains() {
  # active domains straight from the mailcow database
  local DBNAME DBUSER DBPASS
  DBNAME="$(conf_get DBNAME)"; DBUSER="$(conf_get DBUSER)"; DBPASS="$(conf_get DBPASS)"
  [ -n "$DBNAME" ] && [ -n "$DBUSER" ] || return 0
  "${COMPOSE[@]}" exec -T mysql-mailcow mysql -u"$DBUSER" -p"$DBPASS" "$DBNAME" -N -B \
    -e "SELECT domain FROM domain WHERE active = 1 ORDER BY domain" 2>/dev/null || true
}

conf_get() {
  sed -n "s/^$1=//p" mailcow.conf | tail -n1 | tr -d '"'"'"
}

install_config() {
  mkdir -p "$SIGDIR/templates"
  if [ ! -d "$SIGDIR/templates/default" ]; then
    cp -r "$SRC/data/conf/rspamd/local.d/mailcow-signature/templates/default" "$SIGDIR/templates/"
    info "Default templates installed"
  fi
  if [ ! -f "$SIGDIR/config.json" ]; then
    local domains json="" d
    domains="$(mailcow_domains)"
    for d in $domains; do json="$json${json:+, }\"$d\""; done
    sed -e "s/^  \"domains\": .*/  \"domains\": [$json],/" \
        -e 's/^  "dry_run": .*/  "dry_run": true,/' \
        -e 's/^  "exclude_senders": .*/  "exclude_senders": [],/' \
        -e "s/^  \"internal_domains\": .*/  \"internal_domains\": [$json],/" \
        "$SRC/data/conf/rspamd/local.d/mailcow-signature/config.json" > "$SIGDIR/config.json"
    if [ -n "$json" ]; then info "config.json created for: $(echo $domains | tr ' ' ',')"
    else warn "No domains detected, add them in the web UI"; fi
  else
    info "Keeping existing config.json"
  fi
  [ -f "$SIGDIR/users.json" ] || echo "{}" > "$SIGDIR/users.json"
  fix_permissions
}

# Older versions kept the data in custom/signature. mailcow's rspamd entrypoint runs
# "chmod 644 -R /etc/rspamd/custom/*" on every start, which makes subdirectories
# unreadable for rspamd, so it now lives in local.d/mailcow-signature.
migrate_data_dir() {
  local old="$RSPAMD/custom/signature"
  [ -d "$old" ] || return 0
  if [ ! -d "$SIGDIR" ]; then
    mv "$old" "$SIGDIR"
    info "Moved signature data to $SIGDIR"
  else
    mv "$old" "$BACKUP/old-custom-signature"
    warn "Old $old moved to $BACKUP/old-custom-signature"
  fi
}

# rspamd runs as _rspamd and needs to traverse the folders (x bit on directories)
fix_permissions() {
  find "$SIGDIR" -type d -exec chmod 0755 {} +
  find "$SIGDIR" -type f -exec chmod 0644 {} +
}

install_ui() {
  mkdir -p data/signature-ui
  install -m 0644 "$SRC/data/signature-ui/app.py" data/signature-ui/app.py
  install -m 0644 "$SRC/data/signature-ui/index.html" data/signature-ui/index.html

  if ! grep -q '^SIGNATURE_UI_PASSWORD=.\+' mailcow.conf; then
    UI_PASSWORD="$(head -c 256 /dev/urandom | tr -dc 'A-Za-z0-9' | cut -c1-24)"
    sed -i '/^SIGNATURE_UI_PASSWORD=/d' mailcow.conf
    printf '\n# mailcow-signature web UI\nSIGNATURE_UI_PASSWORD=%s\n' "$UI_PASSWORD" >> mailcow.conf
    NEW_PASSWORD=1
  fi
  grep -q '^SIGNATURE_UI_API_KEY=' mailcow.conf || echo "SIGNATURE_UI_API_KEY=" >> mailcow.conf
  if [ -n "$MCS_LISTEN" ]; then
    sed -i '/^SIGNATURE_UI_BIND=/d' mailcow.conf
    echo "SIGNATURE_UI_BIND=$MCS_LISTEN" >> mailcow.conf
  fi
  grep -q '^SIGNATURE_UI_BIND=' mailcow.conf || echo "SIGNATURE_UI_BIND=127.0.0.1" >> mailcow.conf

  local block indent
  block_for() {
    local i="$1"
    cat <<EOF
${i}${MARK_BEGIN}
${i}signature-ui-mailcow:
${i}${i}image: python:3.12-alpine
${i}${i}restart: always
${i}${i}command: ["python", "/app/app.py", "--data", "/data", "--bind", "0.0.0.0", "--port", "8090"]
${i}${i}environment:
${i}${i}${i}- SIGNATURE_UI_PASSWORD=\${SIGNATURE_UI_PASSWORD}
${i}${i}${i}- MAILCOW_URL=https://\${MAILCOW_HOSTNAME}
${i}${i}${i}- MAILCOW_API_KEY=\${SIGNATURE_UI_API_KEY:-}
${i}${i}${i}- TZ=\${TZ}
${i}${i}volumes:
${i}${i}${i}- ./data/signature-ui:/app:ro,z
${i}${i}${i}- ./data/conf/rspamd/local.d/mailcow-signature:/data:z
${i}${i}ports:
${i}${i}${i}- "\${SIGNATURE_UI_BIND:-127.0.0.1}:8090:8090"
${i}${i}networks:
${i}${i}${i}mailcow-network:
${i}${MARK_END}
EOF
  }

  local ov=docker-compose.override.yml
  if [ -f "$ov" ] && grep -qF "$MARK_BEGIN" "$ov"; then
    # update managed block in place
    indent="$(grep -F "$MARK_BEGIN" "$ov" | head -n1 | sed 's/#.*//')"
    BLK="$(block_for "${indent:-  }")" awk -v b="$MARK_BEGIN" -v e="$MARK_END" '
      index($0,b){print ENVIRON["BLK"]; skip=1; next} skip&&index($0,e){skip=0; next} !skip' "$ov" > "$ov.new"
    mv "$ov.new" "$ov"
  elif [ -f "$ov" ] && grep -Eq '^services:[[:space:]]*(#.*)?$' "$ov"; then
    indent="$(awk '/^services:/{f=1;next} f&&/^[ \t]+[^ \t#]/{match($0,/^[ \t]+/); print substr($0,1,RLENGTH); exit}' "$ov")"
    BLK="$(block_for "${indent:-  }")" awk '{print} /^services:[ \t]*(#.*)?$/ && !done {print ENVIRON["BLK"]; done=1}' "$ov" > "$ov.new"
    mv "$ov.new" "$ov"
  elif [ -f "$ov" ] && grep -q '^services:' "$ov"; then
    die "Could not merge into $ov automatically. Add the service manually (see README)."
  elif [ -f "$ov" ]; then
    printf '\nservices:\n%s\n' "$(block_for "  ")" >> "$ov"
  else
    printf 'services:\n%s\n' "$(block_for "  ")" > "$ov"
  fi

  if ! "${COMPOSE[@]}" config -q 2>/dev/null; then
    [ -f "$BACKUP/$ov" ] && cp -p "$BACKUP/$ov" "$ov" || rm -f "$ov"
    die "docker-compose.override.yml became invalid and was restored. Add the service manually (see README)."
  fi
  info "Web UI installed"
}

restart_services() {
  if [ "$1" = 1 ]; then
    info "Starting web UI container"
    "${COMPOSE[@]}" up -d signature-ui-mailcow >/dev/null
  fi
  info "Restarting rspamd"
  local since
  since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "${COMPOSE[@]}" restart rspamd-mailcow >/dev/null
  info "Waiting for rspamd to load the plugin (up to 60 seconds)"
  local i
  for i in $(seq 1 30); do
    if "${COMPOSE[@]}" logs --since "$since" rspamd-mailcow 2>/dev/null | grep -q "mailcow_signature: loaded"; then
      info "rspamd loaded the plugin"
      return
    fi
    sleep 2
  done
  warn "Could not confirm the plugin was loaded. Check: ${COMPOSE[*]} logs rspamd-mailcow | grep mailcow_signature"
}

summary() {
  local dry
  dry="$(grep -o '"dry_run": *true' "$SIGDIR/config.json" || true)"
  echo
  printf '%s mailcow-signature installed%s\n\n' "$c_b" "$c_0"
  if [ "$1" = 1 ]; then
    local bind
    bind="$(conf_get SIGNATURE_UI_BIND)"; bind="${bind:-127.0.0.1}"
    if [ "$bind" = 127.0.0.1 ]; then
      echo "  Web UI:    only on 127.0.0.1:8090 of this server. From your computer:"
      echo "               ssh -L 8090:127.0.0.1:8090 root@$(conf_get MAILCOW_HOSTNAME)"
      echo "             then open http://localhost:8090"
      echo "             (to reach it via VPN/private network: re-run with --listen <private-ip>)"
    else
      [[ "$bind" == *:* ]] && bind="[$bind]"
      echo "  Web UI:    http://$bind:8090"
      [ "$bind" = 0.0.0.0 ] && echo "  ${c_warn}Listening on all interfaces${c_0}: restrict access with a firewall."
    fi
    if [ "${NEW_PASSWORD:-0}" = 1 ]; then
      echo "  Password:  ${c_b}$UI_PASSWORD${c_0}   ${c_dim}(stored as SIGNATURE_UI_PASSWORD in mailcow.conf)${c_0}"
    else
      echo "  Password:  SIGNATURE_UI_PASSWORD in $MAILCOW_DIR/mailcow.conf"
    fi
  fi
  [ -n "$dry" ] && echo "  ${c_warn}Dry run is ON${c_0}: mails are not changed yet. Test, then switch it off in the UI (Settings)."
  echo "  Next:      clear mailcow's \"domain wide footer\" for these domains, otherwise you get two signatures."
  echo "  Logs:      cd $MAILCOW_DIR && ${COMPOSE[*]} logs -f rspamd-mailcow | grep mailcow_signature"
  echo "  Backup:    $BACKUP"
  echo "  Uninstall: re-run this installer with --uninstall"
  echo
}

uninstall() {
  local purge="$1" loader="$RSPAMD/local.d/rspamd.lua" ov=docker-compose.override.yml
  backup
  if [ -f "$ov" ] && grep -qF "$MARK_BEGIN" "$ov"; then
    "${COMPOSE[@]}" rm -sf signature-ui-mailcow >/dev/null 2>&1 || true
    awk -v b="$MARK_BEGIN" -v e="$MARK_END" 'index($0,b){skip=1; next} skip&&index($0,e){skip=0; next} !skip' "$ov" > "$ov.new"
    mv "$ov.new" "$ov"
    # drop file if nothing but "services:" is left
    if [ -z "$(grep -v -e '^[[:space:]]*$' -e '^services:[[:space:]]*$' "$ov" || true)" ]; then rm -f "$ov"; fi
    info "Web UI container removed"
  fi
  if [ -f "$loader" ]; then
    sed -i '/mailcow_signature\.lua/d' "$loader"
    if [ -z "$(grep -v -e '^[[:space:]]*$' -e '^--' "$loader" || true)" ]; then rm -f "$loader"; fi
  fi
  rm -f "$RSPAMD/custom/mailcow_signature.lua"
  rm -rf data/signature-ui
  if [ "$purge" = 1 ]; then rm -rf "$SIGDIR"; info "Signature configuration deleted"; fi
  sed -i -e '/^# mailcow-signature web UI$/d' -e '/^SIGNATURE_UI_PASSWORD=/d' -e '/^SIGNATURE_UI_API_KEY=/d'     -e '/^SIGNATURE_UI_BIND=/d' mailcow.conf
  "${COMPOSE[@]}" restart rspamd-mailcow >/dev/null
  info "mailcow-signature removed (backup: $BACKUP)"
  [ "$purge" = 1 ] || echo "    Templates and config kept in $SIGDIR (use --uninstall --purge to delete)."
}

main "$@"
