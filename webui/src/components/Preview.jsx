import { useEffect, useState } from "react";
import { useStore } from "../App.jsx";
import { buildVars, domains, esc, htmlToText, isDomain, render, resolve, usersOf } from "../lib/template.js";
import { Seg } from "./ui.jsx";

// Logos liegen öffentlich unter S.asset_url; in der Vorschau über die UI laden (klappt auch im VPN)
export const toLocal = (S, url) => (S.asset_url && url && url.startsWith(S.asset_url) ? "/assets/" + url.slice(S.asset_url.length) : url);

export default function Preview({ level, initialKind = "new" }) {
  const { S } = useStore();
  const [kind, setKind] = useState(initialKind);
  const [dark, setDark] = useState("light");
  const dom = isDomain(level) ? level : level.includes("@") ? level.split("@")[1] : domains(S)[0] || "example.com";
  const people = level.includes("@") ? [level] : isDomain(level) ? usersOf(S, level) : Object.keys(S.users).sort();
  const [sample, setSample] = useState(people[0] || "max.mustermann@" + dom);
  useEffect(() => { if (!people.includes(sample) && people[0]) setSample(people[0]); }, [people.join(), sample]);
  useEffect(() => setKind(initialKind), [initialKind]);

  const domain = sample.split("@")[1];
  const vars = buildVars(S, sample, domain);
  const r = resolve(S, sample, domain, kind === "text" ? "new" : kind);
  let sigHtml = "", sigTxt = "", none = false;
  if (r) {
    const h = r.html != null && r.html.trim() !== "" ? r.html : null;
    const t = r.txt != null && r.txt.trim() !== "" ? r.txt : null;
    if (!h && !t) none = true;
    sigHtml = h ? render(h, vars, true) : t ? esc(render(t, vars, false)).replace(/\n/g, "<br>\n") : "";
    sigTxt = t ? render(t, vars, false) : h ? htmlToText(render(h, vars, true)) : "";
  }
  if (S.asset_url) sigHtml = sigHtml.split(S.asset_url).join(location.origin + "/assets/");
  // Simulation: Clients rechnen Text- und Hintergrundfarben um, Bilder nie
  if (dark === "media") sigHtml = sigHtml.replace(/@media\s*\(prefers-color-scheme:\s*dark\)/g, "@media all");
  const darkCss = dark === "light" ? "" : "html{filter:invert(1) hue-rotate(180deg);background:#fff}img{filter:invert(1) hue-rotate(180deg)}";
  const reply = kind === "reply";
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${darkCss}
    body{margin:0;font:14px/1.5 -apple-system,"Segoe UI",Calibri,Arial,sans-serif;color:#1f2937;background:#fff}
    .hdr{padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fafafa;font-size:13px;color:#4b5563}
    .hdr b{color:#111827}.subj{font-size:15px;font-weight:600;color:#111827;margin-bottom:4px}
    .body{padding:16px}.quote{color:#6b7280}hr{border:0;border-top:1px solid #d1d5db;margin:16px 0 10px}
    .marker{outline:2px dashed #93c5fd;outline-offset:6px;border-radius:2px}
  </style></head><body>
  <div class="hdr"><div class="subj">${reply ? "AW: Angebot" : "Angebot"}</div>
    <div><b>Von:</b> ${esc(vars.DisplayName)} &lt;${esc(sample)}&gt;</div><div><b>An:</b> Erika Beispiel &lt;erika@kunde.de&gt;</div></div>
  <div class="body">
    <div>Hallo Frau Beispiel,<br><br>vielen Dank für Ihre Nachricht, ich melde mich morgen.</div>
    ${none ? "" : `<div class="marker">${sigHtml}</div>`}
    ${reply ? `<hr><div class="quote"><b>Von:</b> Erika Beispiel &lt;erika@kunde.de&gt;<br><b>Gesendet:</b> Montag, 9:41<br><b>Betreff:</b> Angebot<br><br>Guten Tag,<br>können Sie uns ein Angebot schicken?</div>` : ""}
  </div></body></html>`;
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
      {people.length > 1 && (
        <div className="px-4 py-2 border-b border-mc-border dark:border-mc-d-border">
          <select className="form-control h-[28px] w-auto text-[12.5px]" value={sample} onChange={(e) => setSample(e.target.value)}>
            {people.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      {kind === "text" ? (
        <pre className="m-0 p-4 min-h-[480px] whitespace-pre-wrap font-mono text-[12.5px]">{text}</pre>
      ) : (
        <iframe title="Vorschau" sandbox="allow-same-origin" srcDoc={doc} className="block w-full h-[520px] bg-white rounded-b" />
      )}
      {r && <div className="px-4 py-1.5 text-[11.5px] muted border-t border-mc-border dark:border-mc-d-border">Vorlage: {r.level}{none ? " · keine Signatur bei Antworten" : ""}</div>}
    </div>
  );
}
