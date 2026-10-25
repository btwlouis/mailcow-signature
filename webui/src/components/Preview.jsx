import { useEffect, useState } from "react";
import { useStore } from "../App.jsx";
import { templatesFor } from "../lib/design.js";
import { buildVars, domains, esc, htmlToText, isDomain, nonempty, render, resolve, usersOf } from "../lib/template.js";
import { Seg } from "./ui.jsx";

// Logos liegen öffentlich unter S.asset_url; in der Vorschau über die UI laden (klappt auch im VPN)
export const toLocal = (S, url) => (S.asset_url && url && url.startsWith(S.asset_url) ? "/assets/" + url.slice(S.asset_url.length) : url);
export const localizeAssets = (S, html) => (S.asset_url ? html.split(S.asset_url).join(location.origin + "/assets/") : html);

const DEMO = {
  DisplayName: "Max Mustermann", Title: "Vertrieb", Phone: "+49 30 1234567-0", Mobile: "+49 170 1234567",
  Company: "Muster GmbH", Street: "Musterstraße 1", City: "12345 Musterstadt", Website: "www.example.com",
  Legal: "Geschäftsführer: Max Mustermann · Amtsgericht Musterstadt HRB 12345",
};
export const DEMO_ADDR = "max.mustermann@example.com";

// Demo-Werte als Fallback, echte Firmendaten haben Vorrang
export function demoVars(S, domain) {
  const v = buildVars(S, DEMO_ADDR, domain || "example.com");
  for (const [k, val] of Object.entries(DEMO)) if (!nonempty(S.users[DEMO_ADDR]?.[k]) && !nonempty((S.config.vars || {})["*"]?.[k]) && !nonempty((S.config.vars || {})[domain]?.[k])) v[k] = val;
  v.DisplayName = DEMO.DisplayName;
  return v;
}

// Nur das HTML-Dokument (für Galerie-Kacheln und die große Vorschau)
export function signatureDoc(S, sigHtml, { reply = false, dark = "light", vars, from, frame = true } = {}) {
  sigHtml = localizeAssets(S, sigHtml);
  if (dark === "media") sigHtml = sigHtml.replace(/@media\s*\(prefers-color-scheme:\s*dark\)/g, "@media all");
  // Simulation: Clients rechnen Text- und Hintergrundfarben um, Bilder nie
  const darkCss = dark === "light" ? "" : "html{filter:invert(1) hue-rotate(180deg);background:#fff}img{filter:invert(1) hue-rotate(180deg)}";
  const base = `<!doctype html><html><head><meta charset="utf-8"><style>${darkCss}
    body{margin:0;font:14px/1.5 -apple-system,"Segoe UI",Calibri,Arial,sans-serif;color:#1f2937;background:#fff}
    .hdr{padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;font-size:13px;color:#4b5563}
    .hdr b{color:#111827}.subj{font-size:15px;font-weight:600;color:#111827;margin-bottom:4px}
    .body{padding:16px}.quote{color:#6b7280}hr{border:0;border-top:1px solid #d1d5db;margin:16px 0 10px}
    .marker{outline:2px dashed #93c5fd;outline-offset:6px;border-radius:2px}
  </style></head><body>`;
  if (!frame) return base + `<style>html,body{overflow:hidden}</style><div style="padding:4px 18px 18px">${sigHtml}</div></body></html>`;
  return base + `
  <div class="hdr"><div class="subj">${reply ? "AW: Angebot" : "Angebot"}</div>
    <div><b>Von:</b> ${esc(vars.DisplayName)} &lt;${esc(from)}&gt;</div><div><b>An:</b> Erika Beispiel &lt;erika@kunde.de&gt;</div></div>
  <div class="body">
    <div>Hallo Frau Beispiel,<br><br>vielen Dank für Ihre Nachricht, ich melde mich morgen.</div>
    ${sigHtml ? `<div class="marker">${sigHtml}</div>` : ""}
    ${reply ? `<hr><div class="quote"><b>Von:</b> Erika Beispiel &lt;erika@kunde.de&gt;<br><b>Gesendet:</b> Montag, 9:41<br><b>Betreff:</b> Angebot<br><br>Guten Tag,<br>können Sie uns ein Angebot schicken?</div>` : ""}
  </div></body></html>`;
}

// level: Vorschau wie sie für eine Domain/Person gilt; design: direkt eine Signatur
export default function Preview({ level = "default", design, sigId }) {
  const { S, T } = useStore();
  const [kind, setKind] = useState("new");
  const [dark, setDark] = useState("light");
  const dom = isDomain(level) ? level : level.includes("@") ? level.split("@")[1] : domains(S)[0] || "example.com";
  const people = design ? Object.keys(S.users).sort() : level.includes("@") ? [level] : isDomain(level) ? usersOf(S, level) : Object.keys(S.users).sort();
  const [sample, setSample] = useState(design ? "" : people[0] || "");
  useEffect(() => { if (sample && !people.includes(sample)) setSample(people[0] || ""); }, [people.join(), sample]);

  const addr = sample || DEMO_ADDR, domain = sample ? sample.split("@")[1] : dom;
  const vars = sample ? buildVars(S, sample, domain) : demoVars(S, dom);
  let r;
  if (design) {
    const t = templatesFor(sigId || "preview", design);
    const k = kind === "reply" && (t["reply.html"] != null || t["reply.txt"] != null) ? "reply" : "new";
    r = { level: "", html: t[k + ".html"], txt: t[k + ".txt"] };
  } else {
    r = resolve({ ...S, templates: T }, sample || addr, domain, kind === "text" ? "new" : kind);
  }
  let sigHtml = "", sigTxt = "", none = false;
  if (r) {
    const h = r.html != null && r.html.trim() !== "" ? r.html : null;
    const t = r.txt != null && r.txt.trim() !== "" ? r.txt : null;
    if (!h && !t) none = true;
    sigHtml = h ? render(h, vars, true) : t ? esc(render(t, vars, false)).replace(/\n/g, "<br>\n") : "";
    sigTxt = t ? render(t, vars, false) : h ? htmlToText(render(h, vars, true)) : "";
  }
  const text = "Hallo Frau Beispiel,\n\nvielen Dank für Ihre Nachricht, ich melde mich morgen.\n\n" + (none ? "" : sigTxt + "\n");

  return (
    <div className="card">
      <div className="card-header flex-wrap">
        <span>Vorschau</span>
        <div className="ml-auto flex flex-wrap gap-2 font-normal">
          <Seg value={kind} onChange={setKind} options={[["new", "Neu"], ["reply", "Antwort"], ["text", "Text"]]} />
          {kind !== "text" && (
            <Seg value={dark} onChange={setDark} options={[["light", "Hell"], ["invert", "Dunkel", "Outlook, Gmail-App: Farben umgerechnet, Bilder unverändert"], ["media", "Dunkel + DM-Logo", "Apple Mail, Outlook Mac/iOS: Darkmode-Logo aktiv"]]} />
          )}
        </div>
      </div>
      <div className="px-4 py-2 border-b border-mc-border dark:border-mc-d-border">
        <select className="form-control h-[28px] w-auto text-[12.5px]" value={sample} onChange={(e) => setSample(e.target.value)}>
          <option value="">Beispielperson</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {kind === "text" ? (
        <pre className="m-0 p-4 min-h-[460px] whitespace-pre-wrap font-mono text-[12.5px]">{text}</pre>
      ) : (
        <iframe title="Vorschau" sandbox="allow-same-origin" className="block w-full h-[500px] bg-white rounded-b"
          srcDoc={signatureDoc(S, none ? "" : sigHtml, { reply: kind === "reply", dark, vars, from: addr })} />
      )}
      {!design && (
        <div className="px-4 py-1.5 text-[11.5px] muted border-t border-mc-border dark:border-mc-d-border">
          {r ? (r.level === "default" ? "gilt: Standard" : "gilt: " + r.level) : "keine Signatur"}{none ? " · keine Signatur bei Antworten" : ""}
        </div>
      )}
    </div>
  );
}
