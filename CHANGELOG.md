# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [semantic versioning](https://semver.org/).

## [1.0.0] - 2026-10-25

First public release.

### Plugin
- rspamd prefilter that inserts signatures **below the newest reply, above the quoted thread**, before DKIM/ARC signing.
- Detects the reply position for Outlook (desktop, OWA, new Outlook, mobile), Gmail, Apple Mail/iOS, Thunderbird, SOGo, Roundcube, Yahoo and Zimbra.
- Never touches S/MIME, PGP (MIME and inline), DSN/MDN, TNEF or calendar invites; keeps charset and transfer encoding; verifies every change and sends the mail unchanged on any doubt.
- Separate signature for replies (short, same as new, or none).
- Logo linked (served by mailcow's nginx) or embedded as an inline (CID) attachment.
- Dry run with live testers, results in the rspamd log and as the `MAILCOW_SIGNATURE` symbol.

### Web UI
- React + Tailwind interface in mailcow's look, light and dark theme.
- German and English, switchable in the navigation bar.
- First-run setup: language, company details, logo, layout, live tester.
- Signature gallery with five ready-made layouts (Classic, Logo on top, Modern, Compact, Minimal) and an editor with live preview.
- Logo checks for dark mode with one-click white outline or white plate, and an optional dark mode logo.
- Per-domain signature, placeholders and people; people can get their own signature.
- Import of domains and mailboxes from the mailcow API.

### Installer
- One-command install, update and uninstall (`install.sh`), with backup, domain detection, docker-compose override merge, `--listen` for VPN/private networks and `--no-ui`.

[1.0.0]: https://github.com/btwlouis/mailcow-signature/releases/tag/v1.0.0
