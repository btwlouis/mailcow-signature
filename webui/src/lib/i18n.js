// Oberflächen-Texte Deutsch/Englisch. t("key", {var}) ersetzt {var}.

const de = {
  brand: "Signaturen", "nav.signatures": "Signaturen", "nav.domains": "Domains", "nav.settings": "Einstellungen",
  "status.disabled": "Deaktiviert", "status.dry": "Testmodus", "status.dryLive": "Testmodus · {n} Live-Tester", "status.active": "Aktiv",
  save: "Speichern", saving: "Speichert …", logout: "Abmelden", "toast.saved": "Gespeichert – aktiv in spätestens 60 Sekunden", "toast.error": "Fehler: ",
  "login.title": "mailcow Signaturen", "login.password": "Passwort", "login.submit": "Anmelden",
  default: "Standard", edit: "Bearbeiten", duplicate: "Duplizieren", delete: "Löschen", remove: "Entfernen", show: "anzeigen", optional: "optional",

  "sig.title": "Signaturen", "sig.new": "Neue Signatur", "sig.pick": "Vorlage wählen", "sig.none": "Noch keine Signaturen.",
  "sig.unassigned": "nicht zugeordnet", "sig.copy": " (Kopie)", "sig.confirmDelete": "Signatur löschen?",
  "sig.confirmDeleteUsed": "Signatur löschen? Sie wird verwendet von: {list}. Dort gilt danach die Standard-Signatur.",
  "layout.classic": "Klassisch", "layout.stacked": "Logo oben", "layout.modern": "Modern", "layout.compact": "Kompakt", "layout.minimal": "Minimal",

  "ed.back": "← Signaturen", "ed.unassigned": "nicht zugeordnet – unter „Domains“ auswählen", "ed.notFound": "Signatur nicht gefunden.",
  "logo.title": "Logo", processing: "verarbeite …", "logo.other": "Anderes Logo", "logo.upload": "Logo hochladen", "logo.library": "Bibliothek ({n})",
  "logo.width": "Breite", "logo.alt": "Alt-Text", "logo.altPh": "Firmenname", "logo.dark": "Darkmode",
  "logo.outline": "Weiße Kontur", "logo.outlineTip": "Schmale weiße Kontur – wirkt in allen Mailprogrammen",
  "logo.plate": "Weiße Fläche", "logo.plateTip": "Weiße Fläche ins Bild einbacken – wirkt in allen Mailprogrammen",
  "logo.dm": "Darkmode-Logo", "logo.dmReplace": "DM-Logo ersetzen", "logo.dmRemove": "DM-Logo entfernen", "logo.dmTip": "Nur Apple Mail, Outlook Mac/iOS, Thunderbird",
  "logo.light": "HELL", "logo.darkLbl": "DUNKEL", "logo.deleteConfirm": "Bild löschen? Bereits verschickte Mails zeigen es dann nicht mehr.",
  "logo.err": "Logo konnte nicht bearbeitet werden: ", "logo.tooBig": "Datei zu groß (max. 8 MB)",
  "chk.external": "Externes Logo – keine Prüfung möglich", "chk.outline": "Darkmode-Schutz: weiße Kontur ✓", "chk.plate": "Darkmode-Schutz: weiße Fläche ✓",
  "chk.darkTransparent": "Dunkel + transparent: im Darkmode kaum sichtbar → „Weiße Kontur“",
  "chk.lightTransparent": "Hell + transparent: auf Weiß kaum sichtbar → dunkle Variante als Darkmode-Logo",
  "chk.ownBg": "Eigener Hintergrund ✓", "chk.mid": "Transparent, mittlere Helligkeit – Vorschau „Dunkel“ prüfen",
  "chk.small": "zu klein für scharfe Darstellung (≥ {px}px)", "chk.loadErr": "Logo konnte nicht geladen werden",
  "chk.embedded": "Wird eingebettet ✓", "chk.public": "Öffentlich erreichbar ✓", "chk.notPublic": "Nicht öffentlich erreichbar: ",

  "ed.layoutColors": "Layout & Farben", "f.layout": "Layout", "f.divider": "Trennlinie", "f.font": "Schrift", "f.colors": "Farben", "f.text": "Text",
  "f.accent": "Akzent", "warn.accentWhite": "Akzentfarbe auf Weiß schwer lesbar ({c}:1)", "warn.accentDark": "Akzentfarbe im Darkmode schwer lesbar ({c}:1)",
  "ed.content": "Inhalt", "f.lang": "Sprache", "f.greeting": "Grußformel", "f.greetingPh": "leer = keine", "f.fields": "Felder", "f.extra": "Zusatzzeile",
  "f.replies": "Antworten", "reply.compact": "Kurz", "reply.full": "Wie neu", "reply.none": "Keine",
  "field.title": "Position", "field.department": "Abteilung", "field.company": "Firma", "field.address": "Adresse", "field.phone": "Telefon",
  "field.mobile": "Mobil", "field.email": "E-Mail", "field.website": "Website", "field.legal": "Pflichtangaben",

  "pv.title": "Vorschau", "pv.new": "Neu", "pv.reply": "Antwort", "pv.text": "Text", "pv.light": "Hell", "pv.dark": "Dunkel", "pv.darkDm": "Dunkel + DM-Logo",
  "pv.darkTip": "Outlook, Gmail-App: Farben umgerechnet, Bilder unverändert", "pv.darkDmTip": "Apple Mail, Outlook Mac/iOS: Darkmode-Logo aktiv",
  "pv.sample": "Beispielperson", "pv.applies": "gilt: {x}", "pv.none": "keine Signatur", "pv.noReply": " · keine Signatur bei Antworten",
  "mail.subject": "Angebot", "mail.re": "AW: Angebot", "mail.from": "Von:", "mail.to": "An:", "mail.sent": "Gesendet:", "mail.subj": "Betreff:",
  "mail.hello": "Hallo Frau Beispiel,", "mail.body": "vielen Dank für Ihre Nachricht, ich melde mich morgen.", "mail.date": "Montag, 9:41",
  "mail.quote": "Guten Tag,<br>können Sie uns ein Angebot schicken?",

  "dom.title": "Domains", "dom.add": "Domain hinzufügen", "dom.invalid": "Ungültige Domain", "dom.confirmRemove": "Domain {d} entfernen?",
  "dom.create": "Signatur erstellen", sync: "Aus mailcow übernehmen", "sync.saveFirst": "Bitte erst speichern",
  "sync.result": "{m} Postfächer · {a} neu · {d} neue Domains",
  "tab.sig": "Signatur", "tab.vars": "Platzhalter", "tab.users": "Personen ({n})",
  "sel.manual": "Eigenes HTML (manuell)", "sel.none": "Keine", "sel.domain": "wie Domain", "sel.default": "Standard verwenden",
  "vars.all": "Firmendaten (alle Domains)", "vars.domain": "Firmendaten {d}", "kv.field": "Feldname", "kv.value": "Wert", "kv.add": "Feld", global: "Global",
  "u.ph": "vorname.nachname", "u.add": "Person", "u.invalid": "Nur den Teil vor dem @ eingeben",
  "u.none": "Keine Personen – ohne Eintrag wird der Name aus der Mail verwendet.", "u.address": "Adresse", "u.name": "Name", "u.signature": "Signatur",
  "u.more": "Weitere Felder", "u.confirmRemove": "{a} entfernen?", "u.lock": "Namen nicht aus mailcow überschreiben",

  "set.title": "Einstellungen", "set.general": "Allgemein", "set.enabled": "Signaturen aktiv", "set.dry": "Testmodus", "set.dryHint": "Nur loggen, nichts einfügen",
  "set.live": "Live-Tester", "set.calendar": "Kalendereinladungen auslassen", "set.auth": "Nur angemeldete Absender", "set.internal": "Interne Mails auslassen",
  "set.logo": "Logo", "set.linked": "Verlinkt", "set.linkedTip": "Klein; klassisches Outlook fragt bei externen Absendern",
  "set.embedded": "Eingebettet", "set.embeddedTip": "Überall sofort sichtbar; Mail hat Büroklammer", "set.lists": "Listen",
  "set.exclude": "Ausgenommene Absender", "set.internalDomains": "Interne Domains", "set.trusted": "Vertrauenswürdige Netze",
  "set.language": "Sprache der Oberfläche", "set.onboarding": "Einrichtung erneut starten",

  "ob.welcome": "Willkommen bei mailcow-signature", "ob.intro": "In wenigen Schritten zur ersten Signatur – direkt über dem zitierten Verlauf.",
  "ob.step": "Schritt {n} von {m}", "ob.lang": "Sprache", "ob.company": "Firmendaten", "ob.companyHint": "Gilt für alle Domains, pro Domain später änderbar.",
  "ob.f.company": "Firma", "ob.f.street": "Straße", "ob.f.city": "PLZ Ort", "ob.f.phone": "Telefon", "ob.f.website": "Website", "ob.f.legal": "Pflichtangaben (Impressum)",
  "ob.logo": "Logo", "ob.logoHint": "Optional. Ideal: PNG mit transparentem Hintergrund.", "ob.layout": "Layout wählen",
  "ob.done": "Fertig!", "ob.doneText": "Die Signatur gilt als Standard für alle Domains. Der Testmodus ist an: Mails werden noch nicht verändert.",
  "ob.liveHint": "Trag dich als Live-Tester ein, dann bekommst zuerst nur du die echte Signatur:",
  "ob.next": "Weiter", "ob.back": "Zurück", "ob.skip": "Überspringen", "ob.finish": "Speichern & loslegen", "ob.sigName": "Standard",
};

const en = {
  brand: "Signatures", "nav.signatures": "Signatures", "nav.domains": "Domains", "nav.settings": "Settings",
  "status.disabled": "Disabled", "status.dry": "Dry run", "status.dryLive": "Dry run · {n} live testers", "status.active": "Active",
  save: "Save", saving: "Saving …", logout: "Log out", "toast.saved": "Saved – live within 60 seconds", "toast.error": "Error: ",
  "login.title": "mailcow signatures", "login.password": "Password", "login.submit": "Sign in",
  default: "Default", edit: "Edit", duplicate: "Duplicate", delete: "Delete", remove: "Remove", show: "show", optional: "optional",

  "sig.title": "Signatures", "sig.new": "New signature", "sig.pick": "Choose a layout", "sig.none": "No signatures yet.",
  "sig.unassigned": "not assigned", "sig.copy": " (copy)", "sig.confirmDelete": "Delete signature?",
  "sig.confirmDeleteUsed": "Delete signature? It is used by: {list}. They will fall back to the default signature.",
  "layout.classic": "Classic", "layout.stacked": "Logo on top", "layout.modern": "Modern", "layout.compact": "Compact", "layout.minimal": "Minimal",

  "ed.back": "← Signatures", "ed.unassigned": "not assigned – pick it under “Domains”", "ed.notFound": "Signature not found.",
  "logo.title": "Logo", processing: "processing …", "logo.other": "Other logo", "logo.upload": "Upload logo", "logo.library": "Library ({n})",
  "logo.width": "Width", "logo.alt": "Alt text", "logo.altPh": "Company name", "logo.dark": "Dark mode",
  "logo.outline": "White outline", "logo.outlineTip": "Thin white contour – works in every mail client",
  "logo.plate": "White plate", "logo.plateTip": "Bakes a white area into the image – works in every mail client",
  "logo.dm": "Dark mode logo", "logo.dmReplace": "Replace DM logo", "logo.dmRemove": "Remove DM logo", "logo.dmTip": "Only Apple Mail, Outlook Mac/iOS, Thunderbird",
  "logo.light": "LIGHT", "logo.darkLbl": "DARK", "logo.deleteConfirm": "Delete image? Mails already sent will no longer show it.",
  "logo.err": "Could not process logo: ", "logo.tooBig": "File too large (max. 8 MB)",
  "chk.external": "External logo – can't be checked", "chk.outline": "Dark mode protection: white outline ✓", "chk.plate": "Dark mode protection: white plate ✓",
  "chk.darkTransparent": "Dark + transparent: barely visible in dark mode → “White outline”",
  "chk.lightTransparent": "Light + transparent: barely visible on white → use a dark version as dark mode logo",
  "chk.ownBg": "Has its own background ✓", "chk.mid": "Transparent, medium brightness – check the “Dark” preview",
  "chk.small": "too small for sharp display (≥ {px}px)", "chk.loadErr": "Logo could not be loaded",
  "chk.embedded": "Embedded ✓", "chk.public": "Publicly reachable ✓", "chk.notPublic": "Not publicly reachable: ",

  "ed.layoutColors": "Layout & colors", "f.layout": "Layout", "f.divider": "Divider", "f.font": "Font", "f.colors": "Colors", "f.text": "Text",
  "f.accent": "Accent", "warn.accentWhite": "Accent color hard to read on white ({c}:1)", "warn.accentDark": "Accent color hard to read in dark mode ({c}:1)",
  "ed.content": "Content", "f.lang": "Language", "f.greeting": "Greeting", "f.greetingPh": "empty = none", "f.fields": "Fields", "f.extra": "Extra line",
  "f.replies": "Replies", "reply.compact": "Short", "reply.full": "Same as new", "reply.none": "None",
  "field.title": "Job title", "field.department": "Department", "field.company": "Company", "field.address": "Address", "field.phone": "Phone",
  "field.mobile": "Mobile", "field.email": "Email", "field.website": "Website", "field.legal": "Legal notice",

  "pv.title": "Preview", "pv.new": "New", "pv.reply": "Reply", "pv.text": "Text", "pv.light": "Light", "pv.dark": "Dark", "pv.darkDm": "Dark + DM logo",
  "pv.darkTip": "Outlook, Gmail app: colors recolored, images unchanged", "pv.darkDmTip": "Apple Mail, Outlook Mac/iOS: dark mode logo active",
  "pv.sample": "Sample person", "pv.applies": "applies: {x}", "pv.none": "no signature", "pv.noReply": " · no signature on replies",
  "mail.subject": "Quote", "mail.re": "RE: Quote", "mail.from": "From:", "mail.to": "To:", "mail.sent": "Sent:", "mail.subj": "Subject:",
  "mail.hello": "Hi Erika,", "mail.body": "thanks for your message, I'll get back to you tomorrow.", "mail.date": "Monday, 9:41",
  "mail.quote": "Hello,<br>could you send us a quote?",

  "dom.title": "Domains", "dom.add": "Add domain", "dom.invalid": "Invalid domain", "dom.confirmRemove": "Remove domain {d}?",
  "dom.create": "Create signature", sync: "Import from mailcow", "sync.saveFirst": "Please save first",
  "sync.result": "{m} mailboxes · {a} new · {d} new domains",
  "tab.sig": "Signature", "tab.vars": "Placeholders", "tab.users": "People ({n})",
  "sel.manual": "Custom HTML (manual)", "sel.none": "None", "sel.domain": "same as domain", "sel.default": "Use default",
  "vars.all": "Company data (all domains)", "vars.domain": "Company data {d}", "kv.field": "Field name", "kv.value": "Value", "kv.add": "Field", global: "Global",
  "u.ph": "first.last", "u.add": "Person", "u.invalid": "Only enter the part before the @",
  "u.none": "No people – without an entry the name from the email is used.", "u.address": "Address", "u.name": "Name", "u.signature": "Signature",
  "u.more": "More fields", "u.confirmRemove": "Remove {a}?", "u.lock": "Don't overwrite the name from mailcow",

  "set.title": "Settings", "set.general": "General", "set.enabled": "Signatures enabled", "set.dry": "Dry run", "set.dryHint": "Only log, don't insert",
  "set.live": "Live testers", "set.calendar": "Skip calendar invites", "set.auth": "Authenticated senders only", "set.internal": "Skip internal mails",
  "set.logo": "Logo", "set.linked": "Linked", "set.linkedTip": "Small; classic Outlook asks for external senders",
  "set.embedded": "Embedded", "set.embeddedTip": "Shown immediately everywhere; mail gets a paperclip", "set.lists": "Lists",
  "set.exclude": "Excluded senders", "set.internalDomains": "Internal domains", "set.trusted": "Trusted networks",
  "set.language": "Interface language", "set.onboarding": "Run setup again",

  "ob.welcome": "Welcome to mailcow-signature", "ob.intro": "Your first signature in a few steps – placed right above the quoted thread.",
  "ob.step": "Step {n} of {m}", "ob.lang": "Language", "ob.company": "Company details", "ob.companyHint": "Used for all domains, can be changed per domain later.",
  "ob.f.company": "Company", "ob.f.street": "Street", "ob.f.city": "City", "ob.f.phone": "Phone", "ob.f.website": "Website", "ob.f.legal": "Legal notice",
  "ob.logo": "Logo", "ob.logoHint": "Optional. Best: a PNG with transparent background.", "ob.layout": "Choose a layout",
  "ob.done": "All set!", "ob.doneText": "The signature is the default for all domains. Dry run is on: mails are not changed yet.",
  "ob.liveHint": "Add yourself as a live tester to get the real signature first:",
  "ob.next": "Next", "ob.back": "Back", "ob.skip": "Skip", "ob.finish": "Save & start", "ob.sigName": "Default",
};

export const DICT = { de, en };
export const LANGS = [["de", "Deutsch"], ["en", "English"]];

export function detectLang() {
  try {
    const saved = localStorage.getItem("sigui_lang");
    if (saved === "de" || saved === "en") return saved;
  } catch { /* privater Modus */ }
  return (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
}

export function storeLang(lang) {
  try { localStorage.setItem("sigui_lang", lang); } catch { /* ignorieren */ }
}

export function translate(lang, key, vars) {
  let s = (DICT[lang] && DICT[lang][key]) ?? DICT.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split("{" + k + "}").join(String(v));
  return s;
}
