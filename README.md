# mailcow-signature

Server-side email signatures for [mailcow](https://mailcow.email), placed the way Exclaimer/CodeTwo do it for Microsoft 365: **directly below the newest message, above the quoted history**. mailcow's built-in *domain wide footer* always appends to the very end of the mail, after the quoted thread.

- **rspamd prefilter**, the same hook mailcow uses for its footer. It runs before DKIM/ARC signing, so DKIM stays valid.
- Detects reply/forward markers of Outlook (desktop, OWA, new Outlook, mobile), Gmail, Apple Mail/iOS, Thunderbird, SOGo, Roundcube, Yahoo and Zimbra.
- Separate templates for new mails and replies. The reply template can be short or empty (no signature).
- Templates per domain or per person, with placeholders (`{{DisplayName}}`, `{{Title}}`, `{{#Mobile}}…{{/Mobile}}`, …).
- **Web UI** with live preview to manage signatures per domain, company data and people.

## Safety

The plugin never touches S/MIME, PGP (MIME and inline), DSN/MDN, TNEF or calendar invites.

Only the bytes of the first `text/html` and `text/plain` part are replaced. Headers, attachments and attached messages stay byte-identical, and the original charset and transfer encoding are kept.

Every change is verified before the mail goes out: the plugin re-decodes and re-parses the result. On any error the mail is sent unchanged.

## Installation

Run these on the mailcow host (`/opt/mailcow-dockerized`).

```bash
git clone https://github.com/btwlouis/mailcow-signature.git /opt/mailcow-signature
cd /opt/mailcow-dockerized

# 1. rspamd plugin + templates
cp -r /opt/mailcow-signature/data/conf/rspamd/custom/* data/conf/rspamd/custom/
cp /opt/mailcow-signature/data/conf/rspamd/local.d/rspamd.lua data/conf/rspamd/local.d/   # must not exist yet

# 2. Web UI
cp -r /opt/mailcow-signature/data/signature-ui data/
echo "SIGNATURE_UI_PASSWORD=change-me-to-something-long" >> mailcow.conf
echo "SIGNATURE_UI_API_KEY=" >> mailcow.conf                    # optional, read-only mailcow API key
cp /opt/mailcow-signature/docker-compose.override.yml .          # or merge the service into your existing one

# 3. Start
docker compose up -d signature-ui-mailcow
docker compose restart rspamd-mailcow
docker compose logs rspamd-mailcow | grep mailcow_signature     # expect "mailcow_signature: loaded"
```

Then:

1. Open the UI through an SSH tunnel and browse to http://localhost:8090:
   ```bash
   ssh -L 8090:127.0.0.1:8090 root@your-mailcow-host
   ```
2. In the UI, add your domains and edit the templates. Start with **dry run** enabled (Settings), check the rspamd log, then disable it.
3. Clear mailcow's **domain wide footer** for these domains, and turn off client-side signatures, otherwise you get two.

Changes are picked up within 60 seconds, without a restart.

**Uninstall:** `rm data/conf/rspamd/local.d/rspamd.lua && docker compose restart rspamd-mailcow`

## Files

| Path | Purpose |
|---|---|
| `data/conf/rspamd/custom/mailcow_signature.lua` | rspamd plugin |
| `data/conf/rspamd/local.d/rspamd.lua` | loader (rspamd loads it automatically) |
| `data/conf/rspamd/custom/signature/` | `config.json`, `users.json`, `templates/<default\|domain\|address>/{new,reply}.{html,txt}` |
| `data/signature-ui/` | web UI (Python stdlib only) |
| `tools/sync_users.py` | sync display names from the mailcow API (CLI alternative to the UI button) |

## Limitations

- The copy in *Sent Items* has no signature, because the client saves it before the server adds the signature. M365 and Exclaimer behave the same in server mode.
- Unknown clients without a recognizable quote marker get the signature at the end.
- Single-part plain-text mails in `7bit`/`us-ascii` get non-ASCII characters transliterated (ü → ue).

## Tests

```bash
pip install lupa
python tests/test_signature.py
```

## License

[MIT](LICENSE)
