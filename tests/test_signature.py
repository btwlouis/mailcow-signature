"""Tests fuer mailcow_signature.lua (LuaJIT via lupa, Pruefung mit Pythons email-Parser).

  pip install lupa
  python tests/test_signature.py
"""
import base64
import email
import email.policy
import os
import quopri
import sys

import lupa.luajit21 as lupa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, "data", "conf", "rspamd", "custom", "mailcow_signature.lua")
TPL = os.path.join(ROOT, "data", "conf", "rspamd", "local.d", "mailcow-signature", "templates", "default")

lua = lupa.LuaRuntime(encoding=None, unpack_returned_tuples=True)
M = lua.execute(open(PLUGIN, "rb").read())


def read(name):
    with open(os.path.join(TPL, name), "rb") as f:
        return f.read()


TEMPLATES = {k: (read(k + ".html"), read(k + ".txt")) for k in ("new", "reply")}
VARS = {
    b"DisplayName": "Max Müller".encode(), b"Title": "Geschäftsführer".encode(),
    b"Company": b"Beispiel GmbH", b"Street": "Musterstraße 1".encode(), b"City": b"12345 Musterstadt",
    b"Phone": b"+49 30 1234560", b"Email": b"max@example.com", b"Website": b"www.example.com",
    b"Legal": b"HRB 12345",
}


def apply(msg: bytes, skip_calendar=True):
    opts = lua.table_from({
        b"get_templates": lambda kind: TEMPLATES[kind.decode()],
        b"vars": lua.table_from(VARS),
        b"skip_calendar": skip_calendar,
    })
    out, info = M.apply(msg, opts)
    return out, (info.decode() if isinstance(info, bytes) else info)


def crlf(s: str) -> bytes:
    return s.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")


def parts(raw: bytes):
    m = email.message_from_bytes(raw, policy=email.policy.default)
    res = {}
    for p in m.walk():
        if p.get_content_maintype() == "multipart":
            continue
        if p.get_content_type() in ("text/html", "text/plain") and not p.is_attachment() \
                and p.get_content_type() not in res:
            res[p.get_content_type()] = p.get_content()
    return m, res


def defects(raw: bytes):
    m = email.message_from_bytes(raw, policy=email.policy.default)
    return [d for p in m.walk() for d in p.defects]


RESULTS = []


def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(detail)))


def qp(s: str, charset="utf-8") -> str:
    return quopri.encodestring(s.encode(charset).replace(b"\n", b"\r\n")).decode()


# --------------------------------------------------------------------------
HIST_SIG = '<div class="mcsig" data-mcsig="1">Alte Signatur</div>'

outlook_owa_html = (
    '<html><head><meta charset="us-ascii"></head><body>'
    '<div dir="ltr">Hallo Bob,<br>passt so.</div>\n'
    '<div id="appendonsend"></div>\n'
    '<hr style="display:inline-block;width:98%" tabindex="-1">'
    '<div id="divRplyFwdMsg" dir="ltr"><b>Von:</b> Bob &lt;bob@ext.de&gt;<br><b>Gesendet:</b> Montag</div>'
    '<div>Alte Nachricht ' + HIST_SIG + '</div></body></html>'
)
outlook_owa_plain = "Hallo Bob,\npasst so.\n\n________________________________\nVon: Bob <bob@ext.de>\nGesendet: Montag\n\nAlte Nachricht\n"
msg1 = crlf(
    "From: Max <max@example.com>\nTo: bob@ext.de\nSubject: AW: Test\nIn-Reply-To: <a@b>\n"
    "MIME-Version: 1.0\nContent-Type: multipart/alternative; boundary=\"_000_ABC_\"\n\n"
    "--_000_ABC_\nContent-Type: text/plain; charset=\"us-ascii\"\nContent-Transfer-Encoding: quoted-printable\n\n"
    + qp(outlook_owa_plain) +
    "\n--_000_ABC_\nContent-Type: text/html; charset=\"us-ascii\"\nContent-Transfer-Encoding: quoted-printable\n\n"
    + qp(outlook_owa_html) + "\n--_000_ABC_--\n"
)
out, info = apply(msg1)
check("OWA reply: modified", out is not None, info)
if out:
    m, p = parts(out)
    h, t = p["text/html"], p["text/plain"]
    check("OWA reply: reply template", info == "reply", info)
    check("OWA reply: html sig before <div id=appendonsend>",
          h.find("data-mcsig") < h.find('id="appendonsend"') and h.find("Hallo Bob") < h.find("data-mcsig"), h)
    check("OWA reply: umlauts as entities in us-ascii html", "M&#252;ller" in h, h)
    check("OWA reply: plain sig before separator", t.find("Max M") < t.find("______") and t.find("passt so") < t.find("Max M"), t)
    check("OWA reply: plain charset upgraded to utf-8", "Max Müller" in t and 'charset="utf-8"' in out.decode(), t)
    check("OWA reply: no MIME defects", not defects(out), defects(out))
    check("OWA reply: headers unchanged", out.split(b"\r\n\r\n")[0] == msg1.split(b"\r\n\r\n")[0])
    check("OWA reply: CRLF only", b"\n" not in out.replace(b"\r\n", b""))
    check("OWA reply: QP lines <= 76", all(len(l) <= 76 for l in out.split(b"\r\n")[8:]))

# --------------------------------------------------------------------------
outlook_desktop_html = (
    '<html><body lang="DE"><div class="WordSection1"><p class="MsoNormal">Danke!<o:p></o:p></p>\n'
    '<div><div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm">'
    '<p class="MsoNormal"><b>Von:</b> Bob<br><b>Gesendet:</b> Montag</p></div></div>'
    '<p class="MsoNormal">alt</p></div></body></html>'
)
outlook_desktop_plain = "Danke!\n\nVon: Bob <bob@ext.de>\nGesendet: Montag, 1. Januar\nAn: Max\nBetreff: Test\n\nalt\n"
msg2 = crlf(
    "From: max@example.com\nTo: bob@ext.de\nSubject: AW: Test\n"
    "Content-Type: multipart/alternative; boundary=b1\n\n"
    "--b1\nContent-Type: text/plain; charset=\"iso-8859-1\"\nContent-Transfer-Encoding: quoted-printable\n\n"
    + qp(outlook_desktop_plain, "latin-1") +
    "\n--b1\nContent-Type: text/html; charset=\"iso-8859-1\"\nContent-Transfer-Encoding: quoted-printable\n\n"
    + qp(outlook_desktop_html, "latin-1") + "\n--b1--\n"
)
out, info = apply(msg2)
check("Outlook desktop: modified", out is not None, info)
if out:
    m, p = parts(out)
    h, t = p["text/html"], p["text/plain"]
    check("Outlook desktop: html sig before border-top div", "Danke" in h[:h.find("data-mcsig")] and h.find("data-mcsig") < h.find("border-top"), h)
    check("Outlook desktop: plain sig before Von: block (latin-1 kept)", t.find("Max Müller") < t.find("Von: Bob") and t.find("Danke") < t.find("Max Müller"), t)
    check("Outlook desktop: charset stays iso-8859-1", out.count(b'charset="iso-8859-1"') == 2)

# --------------------------------------------------------------------------
gmail_html = ('<div dir="ltr">Super, danke</div><br><div class="gmail_quote gmail_quote_container">'
              '<div dir="ltr" class="gmail_attr">Am Mo., 1. Jan. schrieb Bob:<br></div>'
              '<blockquote class="gmail_quote">alt</blockquote></div>')
gmail_plain = "Super, danke\n\nAm Mo., 1. Jan. 2026 um 10:00 Uhr schrieb Bob <\nbob@ext.de>:\n\n> alt\n"
b64 = lambda s: base64.encodebytes(s.encode()).decode()
pdf = base64.encodebytes(os.urandom(3000)).decode()
msg3 = crlf(
    "From: max@example.com\nSubject: Re: x\nContent-Type: multipart/mixed; boundary=\"000mix\"\n\n"
    "--000mix\nContent-Type: multipart/alternative; boundary=\"000alt\"\n\n"
    "--000alt\nContent-Type: text/plain; charset=\"UTF-8\"\nContent-Transfer-Encoding: base64\n\n" + b64(gmail_plain) +
    "\n--000alt\nContent-Type: text/html; charset=\"UTF-8\"\nContent-Transfer-Encoding: base64\n\n" + b64(gmail_html) +
    "\n--000alt--\n\n--000mix\nContent-Type: application/pdf; name=\"a.pdf\"\nContent-Disposition: attachment; filename=\"a.pdf\"\n"
    "Content-Transfer-Encoding: base64\n\n" + pdf + "--000mix--\n"
)
out, info = apply(msg3)
check("Gmail base64 + PDF: modified", out is not None, info)
if out:
    m, p = parts(out)
    h, t = p["text/html"], p["text/plain"]
    check("Gmail: html sig before gmail_quote", h.find("danke") < h.find("data-mcsig") < h.find("gmail_quote"), h)
    check("Gmail: plain sig before attribution (2-line)", t.find("Max Müller") < t.find("Am Mo.") and t.find("danke") < t.find("Max Müller"), t)
    check("Gmail: PDF bytes identical", crlf(pdf).decode() in out.decode())
    att = [x for x in m.walk() if x.get_filename() == "a.pdf"][0]
    check("Gmail: PDF decodes identical", att.get_content() == base64.decodebytes(pdf.encode()))
    check("Gmail: no MIME defects", not defects(out), defects(out))

# --------------------------------------------------------------------------
apple_html = ('<html><body><div>Ok</div><div><br><blockquote type="cite"><div>Am 01.01.2026 um 10:00 schrieb Bob:</div>'
              '<br class="Apple-interchange-newline"><div>alt</div></blockquote></div></body></html>')
msg4 = crlf("From: max@example.com\nSubject: Re: x\nContent-Type: text/html; charset=us-ascii\n"
            "Content-Transfer-Encoding: 7bit\n\n" + apple_html + "\n")
out, info = apply(msg4)
check("Apple single-part 7bit html: modified", out is not None, info)
if out:
    body = out.decode().split("\r\n\r\n", 1)[1]
    check("Apple: sig before blockquote", body.find("Ok") < body.find("data-mcsig") < body.find("<blockquote"), body)
    check("Apple: stays 7bit ASCII", max(out) < 128)
    check("Apple: top-level headers byte-identical", out.split(b"\r\n\r\n")[0] == msg4.split(b"\r\n\r\n")[0])

# --------------------------------------------------------------------------
sogo_html = ('<html><body><p>Gerne.</p><p>Bob schrieb am 01.01.2026:</p><blockquote type="cite">alt</blockquote></body></html>')
msg5 = crlf("From: max@example.com\nSubject: Re: x\nContent-Type: text/html; charset=utf-8\n"
            "Content-Transfer-Encoding: quoted-printable\n\n" + qp(sogo_html) + "\n")
out, info = apply(msg5)
if out:
    _, p = parts(out)
    h = p["text/html"]
    check("SOGo-style: sig before attribution line", h.find("Gerne") < h.find("data-mcsig") < h.find("Bob schrieb"), h)
else:
    check("SOGo-style: modified", False, info)

# --------------------------------------------------------------------------
tb_plain = "Hallo,\n\nneue Mail.\n"
msg6 = crlf("From: max@example.com\nSubject: Neu\nContent-Type: text/plain; charset=UTF-8; format=flowed\n"
            "Content-Transfer-Encoding: 7bit\n\n" + tb_plain)
out, info = apply(msg6)
check("Thunderbird new plain 7bit: modified", out is not None, info)
if out:
    body = out.decode().split("\r\n\r\n", 1)[1]
    check("Thunderbird: new template, appended", info == "new" and body.find("neue Mail") < body.find("Mit freundlichen"), body)
    check("Thunderbird: transliterated, still 7bit", "Max Mueller" in body and max(out) < 128, body)

# --------------------------------------------------------------------------
msg7 = crlf("From: max@example.com\nSubject: Neu\nContent-Type: multipart/alternative; boundary=x\n\n"
            "--x\nContent-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: 8bit\n\nHallo Grüße\n"
            "--x\nContent-Type: text/html; charset=utf-8\nContent-Transfer-Encoding: 8bit\n\n<html><body><p>Hallo Grüße</p></body></html>\n--x--\n")
out, info = apply(msg7)
if out:
    _, p = parts(out)
    check("8bit new: html sig before </body>", p["text/html"].find("data-mcsig") < p["text/html"].find("</body>"), p["text/html"])
    check("8bit new: plain umlauts raw utf-8", "Max Müller" in p["text/plain"] and "Grüße" in p["text/plain"], p["text/plain"])
else:
    check("8bit new: modified", False, info)

# --------------------------------------------------------------------------
def unchanged(name, msg, expect):
    out, info = apply(msg)
    check(name, out is None and expect in (info or ""), info)

unchanged("S/MIME signed untouched", crlf(
    "From: max@example.com\nContent-Type: multipart/signed; protocol=\"application/pkcs7-signature\"; micalg=sha-256; boundary=s\n\n"
    "--s\nContent-Type: text/plain\n\nsigned\n--s\nContent-Type: application/pkcs7-signature; name=smime.p7s\n\nAAAA\n--s--\n"), "multipart/signed")
unchanged("S/MIME encrypted untouched", crlf(
    "From: max@example.com\nContent-Type: application/pkcs7-mime; smime-type=enveloped-data; name=smime.p7m\n"
    "Content-Transfer-Encoding: base64\n\nAAAA\n"), "pkcs7-mime")
unchanged("PGP/MIME untouched", crlf(
    "From: max@example.com\nContent-Type: multipart/encrypted; protocol=\"application/pgp-encrypted\"; boundary=p\n\n"
    "--p\nContent-Type: application/pgp-encrypted\n\nVersion: 1\n--p\nContent-Type: application/octet-stream\n\n-----BEGIN PGP MESSAGE-----\nx\n--p--\n"), "multipart/encrypted")
unchanged("Inline PGP untouched", crlf(
    "From: max@example.com\nContent-Type: text/plain; charset=utf-8\n\n-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\nhi\n"), "PGP")
unchanged("Calendar invite untouched", crlf(
    "From: max@example.com\nContent-Type: multipart/alternative; boundary=c\n\n--c\nContent-Type: text/plain\n\ninvite\n"
    "--c\nContent-Type: text/calendar; method=REQUEST\n\nBEGIN:VCALENDAR\nEND:VCALENDAR\n--c--\n"), "calendar")
unchanged("Unclosed multipart untouched", crlf(
    "From: max@example.com\nContent-Type: multipart/alternative; boundary=u\n\n--u\nContent-Type: text/plain\n\nx\n"), "malformed")
unchanged("Already signed untouched", crlf(
    "From: max@example.com\nContent-Type: text/html; charset=utf-8\n\n<html><body>Hi" + HIST_SIG + "</body></html>\n"), "already present")
unchanged("DSN untouched", crlf(
    "From: max@example.com\nContent-Type: multipart/report; report-type=delivery-status; boundary=r\n\n"
    "--r\nContent-Type: text/plain\n\nfail\n--r--\n"), "multipart/report")

# --------------------------------------------------------------------------
inner = ("From: bob@ext.de\r\nSubject: inner\r\nContent-Type: multipart/signed; protocol=\"application/pkcs7-signature\"; boundary=in\r\n\r\n"
         "--in\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body>inner html</body></html>\r\n"
         "--in\r\nContent-Type: application/pkcs7-signature\r\n\r\nSIG\r\n--in--\r\n")
msg8 = crlf("From: max@example.com\nSubject: WG: inner\nContent-Type: multipart/mixed; boundary=o\n\n"
            "--o\nContent-Type: text/html; charset=utf-8\n\n<html><body>siehe Anhang</body></html>\n"
            "--o\nContent-Type: message/rfc822\nContent-Disposition: attachment\n\n") + inner.encode() + b"--o--\r\n"
out, info = apply(msg8)
check("Forward as attachment (signed inner): modified outer", out is not None, info)
if out:
    check("Forward as attachment: inner message byte-identical", inner.encode() in out)
    check("Forward as attachment: outer html signed", out.find(b"data-mcsig") < out.find(b"message/rfc822"))

# --------------------------------------------------------------------------
fw_html = ('<html><body><div>FYI</div><div><br></div><div>-------- Weitergeleitete Nachricht --------</div>'
           '<div>Betreff: x</div></body></html>')
msg9 = crlf("From: max@example.com\nSubject: WG: x\nContent-Type: text/html; charset=utf-8\n\n" + fw_html + "\n")
out, info = apply(msg9)
if out:
    b = out.decode()
    check("Text forward separator: sig before separator", b.find("FYI") < b.find("data-mcsig") < b.find("Weitergeleitete"), b)
else:
    check("Text forward separator: modified", False, info)

# --------------------------------------------------------------------------
msg10 = msg1.replace(b"\r\n", b"\n")
out, info = apply(msg10)
check("LF-only message: modified, stays LF", out is not None and b"\r" not in out, info)

# --------------------------------------------------------------------------
codec_ok = True
samples = [b"", b"a", b"ab", b"abc", ("äöü€ " * 50).encode(), bytes(range(256)), os.urandom(5000),
           "Zeile 1 \r\nZeile=2\t\r\n\r\n.Punkt\r\nFrom x\r\n".encode() * 30]
for raw in samples:
    enc = M.b64_encode(raw, b"\r\n")
    codec_ok &= M.b64_decode(enc) == raw
    codec_ok &= base64.b64decode(enc) == raw
    codec_ok &= all(len(l) <= 76 for l in enc.split(b"\r\n"))
    if b"\r" not in raw.replace(b"\r\n", b""):
        q = M.qp_encode(raw, b"\r\n")
        expect = raw.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        codec_ok &= quopri.decodestring(q).replace(b"\r\n", b"\n") == expect.replace(b"\r\n", b"\n")
        codec_ok &= M.qp_decode(q) == expect
        codec_ok &= all(len(l) <= 76 for l in q.split(b"\r\n"))
check("codec roundtrips vs. Python base64/quopri", codec_ok)

failed = [n for n, ok in RESULTS if not ok]
print("\n%d/%d passed" % (len(RESULTS) - len(failed), len(RESULTS)))
sys.exit(1 if failed else 0)
