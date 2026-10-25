# mailcow-signature

[![CI](https://github.com/btwlouis/mailcow-signature/actions/workflows/ci.yml/badge.svg)](https://github.com/btwlouis/mailcow-signature/actions/workflows/ci.yml)

Server-side email signatures for [mailcow](https://mailcow.email), placed the way Exclaimer/CodeTwo do it for Microsoft 365: **directly below the newest message, above the quoted history**. mailcow's built-in *domain wide footer* always appends to the very end of the mail, after the quoted thread.

- **rspamd prefilter**, the same hook mailcow uses for its footer. It runs before DKIM/ARC signing, so DKIM stays valid.
- Detects reply/forward markers of Outlook (desktop, OWA, new Outlook, mobile), Gmail, Apple Mail/iOS, Thunderbird, SOGo, Roundcube, Yahoo and Zimbra.
- Separate templates for new mails and replies. The reply template can be short or empty (no signature).
- Templates per domain or per person, with placeholders (`{{DisplayName}}`, `{{Title}}`, `{{#Mobile}}…{{/Mobile}}`, …).
- **Web UI**: a signature gallery with ready-made layouts (Classic, Logo on top, Modern, Compact, Minimal) to customize – logo, colors, font, fields – then pick one per domain or person. Live preview incl. dark mode simulation; placeholders and people per domain.
- **Domains and mailboxes synced from mailcow** with one click (mailcow API key).

## Safety

The plugin never touches S/MIME, PGP (MIME and inline), DSN/MDN, TNEF or calendar invites.

Only the bytes of the first `text/html` and `text/plain` part are replaced. Headers, attachments and attached messages stay byte-identical, and the original charset and transfer encoding are kept.

Every change is verified before the mail goes out: the plugin re-decodes and re-parses the result. On any error the mail is sent unchanged.

## Quick install

Run this on the mailcow host as root:

```bash
curl -fsSL https://raw.githubusercontent.com/btwlouis/mailcow-signature/main/install.sh | sudo bash
```

The installer:

- finds your mailcow directory (or pass `--dir /path`) and backs up the rspamd config to `/var/backups/mailcow-signature/`
- installs the rspamd plugin and default templates
- creates `config.json` with all active mailcow domains, with **dry run enabled**
- adds the web UI service to `docker-compose.override.yml` (merging into an existing file) and generates a UI password in `mailcow.conf`
- starts the UI, restarts rspamd and checks that the plugin loaded

Then:

1. Open the web UI and log in with the printed password. By default it only listens on `127.0.0.1:8090`, so use an SSH tunnel and browse to http://localhost:8090:
   ```bash
   ssh -L 8090:127.0.0.1:8090 root@your-mailcow-host
   ```
   To reach it over a VPN or private network instead (e.g. Hetzner Cloud network), run the installer with `--listen <private-ip>` and open `http://<private-ip>:8090`.
2. Edit the signatures, test, then turn off **dry run** (Settings).
3. Clear mailcow's **domain wide footer** for these domains, and turn off client-side signatures, otherwise you get two.

Changes are picked up within 60 seconds, without a restart.

| Task | Command |
|---|---|
| Update (keeps your config) | run the installer again |
| Web UI on a VPN/private IP | `curl -fsSL https://raw.githubusercontent.com/btwlouis/mailcow-signature/main/install.sh \| sudo bash -s -- --listen 10.1.0.4` |
| Plugin only, no web UI | `curl -fsSL https://raw.githubusercontent.com/btwlouis/mailcow-signature/main/install.sh \| sudo bash -s -- --no-ui` |
| Uninstall (keeps templates/config) | `curl -fsSL https://raw.githubusercontent.com/btwlouis/mailcow-signature/main/install.sh \| sudo bash -s -- --uninstall` |
| Uninstall everything | `curl -fsSL https://raw.githubusercontent.com/btwlouis/mailcow-signature/main/install.sh \| sudo bash -s -- --uninstall --purge` |

## Signatures, logos and dark mode

Signatures live in a library (`library.json`); domains and people point to one of them (`signatures` in `config.json`). On save the UI generates the templates the plugin reads. The designer builds email-safe HTML (tables, inline styles, no background colors) for Outlook, Gmail, Apple Mail and others. Logos are uploaded in the UI, stored in `data/web/sig-assets/` and served publicly by mailcow's nginx at `https://<mailcow-host>/sig-assets/…`, so recipients can load them. The UI checks that this URL is reachable.

**Logo mode** (Settings): *Linked* (default, small mails, but classic Outlook for Windows asks before loading external images) or *Embedded* (inline CID attachment, shown immediately everywhere, mails get a paperclip). Embedding is skipped for single-part HTML mails, which keep the link.

Dark mode: mail clients recolor text and backgrounds, but never images. So a dark logo on a transparent background disappears on a dark background. The designer analyzes each logo and offers:

- **White outline** (recommended): adds a thin white contour, works in every client.
- **White plate**: bakes the logo onto a rounded white area, looks the same everywhere.
- **Dark mode logo**: an alternative image shown via `prefers-color-scheme` in Apple Mail, Outlook for Mac/iOS and Thunderbird. Outlook for Windows and Gmail ignore it, so use it on top of the outline, not instead of it.

The preview can simulate light mode, dark mode with recolored colors, and dark mode with the dark mode logo. SVG uploads are converted to PNG, because Outlook and Gmail don't show SVG.

## Testing with dry run

With dry run on, the plugin does everything except modify the mail. Each outgoing mail gets a result:

- **rspamd log** on the mailcow host:
  ```bash
  cd /opt/mailcow-dockerized && docker compose logs -f --since 1m rspamd-mailcow | grep mailcow_signature
  ```
  You should see lines like `dry_run, would insert reply signature for max@example.com` or `unchanged (skip: multipart/signed)`.
- **rspamd history** in the mailcow UI (`https://<mailcow-host>/rspamd` → History): symbol `MAILCOW_SIGNATURE` with the same info.

**Live testers:** while dry run is on, addresses listed under *Live testers* (Settings, `live_senders` in `config.json`) get the real signature, so you can check placement in your own mails before switching everyone over.

No line at all means the mail was filtered before: the sender domain is not in the domain list, the sender is not authenticated, or it is an auto-reply/bounce.

## Manual installation

Run these on the mailcow host (`/opt/mailcow-dockerized`).

```bash
git clone https://github.com/btwlouis/mailcow-signature.git /opt/mailcow-signature
cd /opt/mailcow-dockerized

# 1. rspamd plugin + templates
cp /opt/mailcow-signature/data/conf/rspamd/custom/mailcow_signature.lua data/conf/rspamd/custom/
cp -r /opt/mailcow-signature/data/conf/rspamd/local.d/* data/conf/rspamd/local.d/   # local.d/rspamd.lua must not exist yet
# edit data/conf/rspamd/local.d/mailcow-signature/config.json: set "domains" and "dry_run": true

# 2. Web UI
cp -r /opt/mailcow-signature/data/signature-ui data/
echo "SIGNATURE_UI_PASSWORD=change-me-to-something-long" >> mailcow.conf
echo "SIGNATURE_UI_API_KEY=" >> mailcow.conf                    # optional, read-only mailcow API key
echo "SIGNATURE_UI_BIND=127.0.0.1" >> mailcow.conf               # or a VPN/private IP
cp /opt/mailcow-signature/docker-compose.override.yml .          # or merge the service into your existing one

# 3. Start
docker compose up -d signature-ui-mailcow
docker compose restart rspamd-mailcow
docker compose logs rspamd-mailcow | grep mailcow_signature     # expect "mailcow_signature: loaded"
```

Then continue with the steps after the quick install.

**Manual uninstall:** `rm data/conf/rspamd/local.d/rspamd.lua && docker compose restart rspamd-mailcow`, then remove the `signature-ui-mailcow` service from `docker-compose.override.yml`.

## Files

| Path | Purpose |
|---|---|
| `data/conf/rspamd/custom/mailcow_signature.lua` | rspamd plugin |
| `data/web/sig-assets/` | uploaded logos (public, served by mailcow's nginx) |
| `data/conf/rspamd/local.d/rspamd.lua` | loader (rspamd loads it automatically) |
| `data/conf/rspamd/local.d/mailcow-signature/` | `config.json`, `users.json`, `templates/<default\|domain\|address>/{new,reply}.{html,txt}` |
| `data/signature-ui/` | web UI server (`app.py`, Python stdlib) and the built React app (`dist/`) |
| `webui/` | web UI source (React + Tailwind, Vite) |
| `install.sh` | one-shot installer / updater / uninstaller |
| `tools/sync_users.py` | sync display names from the mailcow API (CLI alternative to the UI button) |

## Limitations

- The copy in *Sent Items* has no signature, because the client saves it before the server adds the signature. M365 and Exclaimer behave the same in server mode.
- Unknown clients without a recognizable quote marker get the signature at the end.
- Single-part plain-text mails in `7bit`/`us-ascii` get non-ASCII characters transliterated (ü → ue).

## Web UI development

```bash
cd webui
npm ci
npm run dev      # dev server, proxies /api to app.py on :8090
npm run build    # writes data/signature-ui/dist (commit it, CI checks it is up to date)
```

## Tests

```bash
pip install lupa pyyaml
python tests/test_signature.py      # plugin unit tests (LuaJIT)
bash tests/installer_test.sh        # installer against a fake mailcow
bash tests/rspamd_integration.sh    # plugin inside a real rspamd container (Docker)
```

All three run in GitHub Actions on every push, plus shellcheck, ruff and syntax checks.

## License

[MIT](LICENSE)
