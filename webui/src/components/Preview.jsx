import { useEffect, useState } from "react";
import { useStore } from "../App.jsx";
import { templatesFor } from "../lib/design.js";
import { translate } from "../lib/i18n.js";
import { buildVars, domains, esc, htmlToText, isDomain, nonempty, render, resolve, usersOf } from "../lib/template.js";
import { Seg } from "./ui.jsx";

// Logos liegen öffentlich unter S.asset_url; in der Vorschau über die UI laden (klappt auch im VPN)
export const toLocal = (S, url) => (S.asset_url && url && url.startsWith(S.asset_url) ? "/assets/" + url.slice(S.asset_url.length) : url);
export const localizeAssets = (S, html) => (S.asset_url ? html.split(S.asset_url).join(location.origin + "/assets/") : html);

const DEMO = {
  de: {
    DisplayName: "Max Mustermann", Title: "Vertrieb", Phone: "+49 30 1234567-0", Mobile: "+49 170 1234567",
    Company: "Muster GmbH", Street: "Musterstraße 1", City: "12345 Musterstadt", Website: "www.example.com",
    Legal: "Geschäftsführer: Max Mustermann · Amtsgericht Musterstadt HRB 12345",
  },
  en: {
    DisplayName: "Alex Morgan", Title: "Sales", Phone: "+1 555 0100", Mobile: "+1 555 0123",
    Company: "Example Inc.", Street: "1 Main Street", City: "Springfield", Website: "www.example.com",
    Legal: "Example Inc. · Registered in Springfield · Company No. 123456",
  },
};
export const DEMO_ADDR = "max.mustermann@example.com";

// Demo-Werte als Fallback, echte Firmendaten haben Vorrang
export function demoVars(S, domain, lang = "de") {
  const demo = DEMO[lang] || DEMO.de;
  const v = buildVars(S, DEMO_ADDR, domain || "");
  const cv = S.config.vars || {};
  for (const [k, val] of Object.entries(demo)) if (!nonempty(cv["*"]?.[k]) && !nonempty(domain && cv[domain]?.[k])) v[k] = val;
  v.DisplayName = demo.DisplayName;
  v.Email = lang === "en" ? "alex.morgan@example.com" : DEMO_ADDR;
  return v;
}

// Nur das HTML-Dokument (für Galerie-Kacheln und die große Vorschau)
export function signatureDoc(S, sigHtml, { reply = false, dark = "light", vars, from, frame = true, lang = "de" } = {}) {
  const t = (k) => translate(lang, k);
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
  <div class="hdr"><div class="subj">${reply ? t("mail.re") : t("mail.subject")}</div>
    <div><b>${t("mail.from")}</b> ${esc(vars.DisplayName)} &lt;${esc(from)}&gt;</div><div><b>${t("mail.to")}</b> Erika &lt;erika@customer.example&gt;</div></div>
  <div class="body">
    <div>${t("mail.hello")}<br><br>${t("mail.body")}</div>
    ${sigHtml ? `<div class="marker">${sigHtml}</div>` : ""}
    ${reply ? `<hr><div class="quote"><b>${t("mail.from")}</b> Erika &lt;erika@customer.example&gt;<br><b>${t("mail.sent")}</b> ${t("mail.date")}<br><b>${t("mail.subj")}</b> ${t("mail.subject")}<br><br>${t("mail.quote")}</div>` : ""}
  </div></body></html>`;
}

// level: Vorschau wie sie für eine Domain/Person gilt; design: direkt eine Signatur
export default function Preview({ level = "default", design, sigId, domain: designDomain = null }) {
  const { S, T, t, lang } = useStore();
  const [kind, setKind] = useState("new");
  const [dark, setDark] = useState("light");
  const dom = isDomain(level) ? level : level.includes("@") ? level.split("@")[1] : domains(S)[0] || "example.com";
  const people = design ? Object.keys(S.users).sort() : level.includes("@") ? [level] : isDomain(level) ? usersOf(S, level) : Object.keys(S.users).sort();
  const [sample, setSample] = useState(design ? "" : people[0] || "");
  useEffect(() => { if (sample && !people.includes(sample)) setSample(people[0] || ""); }, [people.join(), sample]);

  const domain = sample ? sample.split("@")[1] : dom;
  const vars = sample ? buildVars(S, sample, domain) : demoVars(S, design ? designDomain : isDomain(level) ? level : null, lang);
  const addr = sample || vars.Email;
  let r;
  if (design) {
    const tp = templatesFor(sigId || "preview", design);
    const k = kind === "reply" && (tp["reply.html"] != null || tp["reply.txt"] != null) ? "reply" : "new";
    r = { level: "", html: tp[k + ".html"], txt: tp[k + ".txt"] };
  } else {
    r = resolve({ ...S, templates: T }, addr, domain, kind === "text" ? "new" : kind);
  }
  let sigHtml = "", sigTxt = "", none = false;
  if (r) {
    const h = r.html != null && r.html.trim() !== "" ? r.html : null;
    const tx = r.txt != null && r.txt.trim() !== "" ? r.txt : null;
    if (!h && !tx) none = true;
    sigHtml = h ? render(h, vars, true) : tx ? esc(render(tx, vars, false)).replace(/\n/g, "<br>\n") : "";
    sigTxt = tx ? render(tx, vars, false) : h ? htmlToText(render(h, vars, true)) : "";
  }
  const text = t("mail.hello") + "\n\n" + t("mail.body") + "\n\n" + (none ? "" : sigTxt + "\n");

  return (
    <div className="card">
      <div className="card-header flex-wrap">
        <span>{t("pv.title")}</span>
        <div className="ml-auto flex flex-wrap gap-2 font-normal">
          <Seg value={kind} onChange={setKind} options={[["new", t("pv.new")], ["reply", t("pv.reply")], ["text", t("pv.text")]]} />
          {kind !== "text" && (
            <Seg value={dark} onChange={setDark} options={[["light", t("pv.light")], ["invert", t("pv.dark"), t("pv.darkTip")], ["media", t("pv.darkDm"), t("pv.darkDmTip")]]} />
          )}
        </div>
      </div>
      <div className="px-4 py-2 border-b border-mc-border dark:border-mc-d-border">
        <select className="form-control h-[28px] w-auto text-[12.5px]" value={sample} onChange={(e) => setSample(e.target.value)}>
          <option value="">{t("pv.sample")}</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {kind === "text" ? (
        <pre className="m-0 p-4 min-h-[460px] whitespace-pre-wrap font-mono text-[12.5px]">{text}</pre>
      ) : (
        <iframe title={t("pv.title")} sandbox="allow-same-origin" className="block w-full h-[500px] bg-white rounded-b"
          srcDoc={signatureDoc(S, none ? "" : sigHtml, { reply: kind === "reply", dark, vars, from: addr, lang })} />
      )}
      {!design && (
        <div className="px-4 py-1.5 text-[11.5px] muted border-t border-mc-border dark:border-mc-d-border">
          {r ? t("pv.applies", { x: r.level === "default" ? t("default") : r.level }) : t("pv.none")}{none ? t("pv.noReply") : ""}
        </div>
      )}
    </div>
  );
}
