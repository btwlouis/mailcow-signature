import { esc } from "./template.js";

// E-Mail-taugliches HTML: Tabellen, Inline-Styles, keine Hintergrundfarben (damit Clients im
// Darkmode nur die Schrift umrechnen), Logo mit fester Breite.

export const DEFAULT_DESIGN = {
  layout: "classic", font: "Arial, Helvetica, sans-serif", size: 13, text: "#333333", accent: "#0F688D",
  greeting: "Mit freundlichen Grüßen", divider: true, extra: "", reply: "compact",
  logo: { url: "", width: 120, alt: "", dark: "", protect: "" },
  fields: { title: true, department: false, company: true, address: true, phone: true, mobile: true, email: true, website: true, legal: true },
};

export const LAYOUTS = [["classic", "Klassisch"], ["stacked", "Logo oben"], ["modern", "Modern"], ["compact", "Kompakt"], ["minimal", "Minimal"]];

// 0815-Vorlagen für „Neue Signatur“
export const PRESETS = [
  { name: "Klassisch", design: { layout: "classic", accent: "#0F688D" } },
  { name: "Logo oben", design: { layout: "stacked", accent: "#2a6f97", divider: false } },
  { name: "Modern", design: { layout: "modern", accent: "#c0392b", font: "'Segoe UI', Arial, sans-serif" } },
  { name: "Kompakt", design: { layout: "compact", accent: "#2f855a", greeting: "Viele Grüße" } },
  { name: "Minimal", design: { layout: "minimal", accent: "#333333", divider: false, font: "Georgia, 'Times New Roman', serif" } },
];

export const FIELD_LABELS = [["title", "Position"], ["department", "Abteilung"], ["company", "Firma"], ["address", "Adresse"],
  ["phone", "Telefon"], ["mobile", "Mobil"], ["email", "E-Mail"], ["website", "Website"], ["legal", "Pflichtangaben"]];

export const FONTS = [["Arial, Helvetica, sans-serif", "Arial"], ["Verdana, Geneva, sans-serif", "Verdana"], ["Tahoma, Geneva, sans-serif", "Tahoma"],
  ["'Segoe UI', Arial, sans-serif", "Segoe UI"], ["'Trebuchet MS', Arial, sans-serif", "Trebuchet MS"], ["Georgia, 'Times New Roman', serif", "Georgia"]];

export function normalizeDesign(d) {
  const base = structuredClone(DEFAULT_DESIGN);
  const out = { ...base, ...d, logo: { ...base.logo, ...(d && d.logo) }, fields: { ...base.fields, ...(d && d.fields) } };
  if (out.layout === "side") out.layout = "classic";
  return out;
}

export function getDesign(t) {
  const raw = t && t["design.json"];
  if (!raw) return null;
  try { return normalizeDesign(JSON.parse(raw)); } catch { return null; }
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function logoHtml(d, width) {
  if (!d.logo.url) return "";
  const w = Math.round(width || +d.logo.width || 120), alt = esc(d.logo.alt) || "{{Company}}";
  const st = `border:0;outline:none;text-decoration:none;width:${w}px;max-width:${w}px;height:auto;`;
  if (!d.logo.dark) return `<img src="${esc(d.logo.url)}" width="${w}" alt="${alt}" style="display:block;${st}">`;
  return `<style>@media (prefers-color-scheme: dark){.mcsig-logo-light{display:none!important;}.mcsig-logo-dark{display:block!important;}}</style>` +
    `<img class="mcsig-logo-light" src="${esc(d.logo.url)}" width="${w}" alt="${alt}" style="display:block;${st}">` +
    `<!--[if !mso]><!--><img class="mcsig-logo-dark" src="${esc(d.logo.dark)}" width="${w}" alt="${alt}" style="display:none;${st}"><!--<![endif]-->`;
}

// Bausteine; Abschnitte {{#Feld}}…{{/Feld}} verschwinden, wenn das Feld leer ist
function parts(d) {
  const A = d.accent, T = d.text, M = "#666666", S0 = +d.size || 13, F = d.font.replace(/"/g, "'"), f = d.fields;
  const font = `font-family:${F};font-size:${S0}px;line-height:1.45;color:${T};`;
  const small = `font-family:${F};font-size:${Math.max(10, S0 - 3)}px;line-height:1.4;color:#888888;`;
  const link = (href, label, color = A) => `<a href="${href}" style="color:${color};text-decoration:none;">${label}</a>`;
  return {
    A, T, M, S0, F, f, font, small, link,
    tbl: (inner, extra = "") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:16px;${font}${extra}">\n${inner}\n</table>`,
    title: f.title ? `{{#Title}}<br><span style="color:${M};">{{Title}}</span>{{/Title}}` : "",
    dept: f.department ? `{{#Department}}<br><span style="color:${M};">{{Department}}</span>{{/Department}}` : "",
    greeting: d.greeting ? `  <tr><td colspan="2" style="${font}padding-bottom:12px;">${esc(d.greeting)}</td></tr>` : "",
    legal: f.legal ? `  {{#Legal}}<tr><td colspan="2" style="${small}padding-top:12px;">{{Legal}}</td></tr>{{/Legal}}` : "",
    extra: d.extra ? `  <tr><td colspan="2" style="${small}padding-top:12px;">${esc(d.extra)}</td></tr>` : "",
  };
}

function inner(rows, font) {
  const html = rows.filter(Boolean).map((r, i) => `      <tr><td style="${font}${i ? "padding-top:8px;" : ""}">${r}</td></tr>`).join("\n");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">\n${html}\n    </table>`;
}

function contactLines(p, sepMode) {
  const { f, link } = p;
  if (sepMode) {
    // eine Zeile, Trenner hinter jedem optionalen Eintrag; E-Mail steht als letztes
    const sep = ` &nbsp;|&nbsp; `;
    return (f.phone ? `{{#Phone}}T {{Phone}}${sep}{{/Phone}}` : "") + (f.mobile ? `{{#Mobile}}M {{Mobile}}${sep}{{/Mobile}}` : "") +
      (f.website ? `{{#Website}}${link("https://{{Website}}", "{{Website}}")}${f.email ? sep : ""}{{/Website}}` : "") +
      (f.email ? link("mailto:{{Email}}", "{{Email}}") : "");
  }
  return (f.phone ? "{{#Phone}}Tel. {{Phone}}<br>{{/Phone}}" : "") + (f.mobile ? "{{#Mobile}}Mobil {{Mobile}}<br>{{/Mobile}}" : "") +
    (f.email ? `{{#Email}}${link("mailto:{{Email}}", "{{Email}}")}<br>{{/Email}}` : "") +
    (f.website ? `{{#Website}}${link("https://{{Website}}", "{{Website}}")}{{/Website}}` : "");
}

export function genHtml(d, compact) {
  d = normalizeDesign(d);
  const p = parts(d);
  const { A, T, M, S0, f, font, tbl, link } = p;

  if (compact) {
    return tbl(`  <tr><td style="${font}">
    <strong style="color:${T};">{{DisplayName}}</strong>${f.title ? `{{#Title}} &middot; <span style="color:${M};">{{Title}}</span>{{/Title}}` : ""}<br>
    <span style="font-size:${S0 - 1}px;color:${M};">${f.company ? "{{#Company}}{{Company}}{{/Company}}" : ""}${f.phone ? "{{#Phone}} &middot; Tel. {{Phone}}{{/Phone}}" : ""}</span>
  </td></tr>`);
  }

  const name = `<strong style="font-size:${S0 + 2}px;color:${T};">{{DisplayName}}</strong>`;
  const company = f.company ? `{{#Company}}<strong style="color:${A};">{{Company}}</strong><br>{{/Company}}` : "";
  const address = f.address ? "{{#Street}}{{Street}}<br>{{/Street}}{{#City}}{{City}}<br>{{/City}}" : "";
  const lines = [p.greeting];

  if (d.layout === "modern") {
    const logo = logoHtml(d);
    const addrInline = f.address ? `{{#Street}} &middot; {{Street}}{{/Street}}{{#City}} &middot; {{City}}{{/City}}` : "";
    const left = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr><td style="${font}padding-bottom:6px;"><span style="font-size:${S0 + 5}px;font-weight:bold;color:${A};">{{DisplayName}}</span>${p.title}${p.dept}</td></tr>
      <tr><td style="${font}border-top:2px solid ${A};padding-top:8px;">${f.company ? `{{#Company}}<strong>{{Company}}</strong>{{/Company}}` : ""}${addrInline}</td></tr>
      <tr><td style="${font}padding-top:4px;font-size:${S0 - 1}px;color:${M};">${contactLines(p, true)}</td></tr>
    </table>`;
    lines.push(logo
      ? `  <tr>\n    <td valign="top" style="vertical-align:top;">${left}</td>\n    <td valign="top" style="vertical-align:top;padding-left:24px;">${logo}</td>\n  </tr>`
      : `  <tr><td colspan="2" valign="top">${left}</td></tr>`);
  } else if (d.layout === "compact") {
    const logo = logoHtml(d, Math.min(+d.logo.width || 120, 64));
    const text = `<strong style="color:${T};">{{DisplayName}}</strong>${f.title ? `{{#Title}} &middot; {{Title}}{{/Title}}` : ""}` +
      `${f.company ? `{{#Company}} &middot; <span style="color:${A};">{{Company}}</span>{{/Company}}` : ""}<br>` +
      `<span style="font-size:${S0 - 1}px;color:${M};">${contactLines(p, true)}</span>`;
    lines.push(logo
      ? `  <tr>\n    <td valign="middle" style="vertical-align:middle;padding-right:12px;">${logo}</td>\n    <td valign="middle" style="${font}vertical-align:middle;">${text}</td>\n  </tr>`
      : `  <tr><td colspan="2" style="${font}">${text}</td></tr>`);
  } else if (d.layout === "minimal") {
    const plain = (href, label) => link(href, label, T);
    const contacts = (f.phone ? "{{#Phone}}{{Phone}}<br>{{/Phone}}" : "") + (f.mobile ? "{{#Mobile}}{{Mobile}}<br>{{/Mobile}}" : "") +
      (f.email ? `{{#Email}}${plain("mailto:{{Email}}", "{{Email}}")}<br>{{/Email}}` : "") +
      (f.website ? `{{#Website}}${plain("https://{{Website}}", "{{Website}}")}{{/Website}}` : "");
    const rows = [`<strong style="color:${T};">{{DisplayName}}</strong>${p.title}${p.dept}`,
      (f.company ? "{{#Company}}{{Company}}<br>{{/Company}}" : "") + address, contacts];
    lines.push(`  <tr><td colspan="2" valign="top">${inner(rows, font)}</td></tr>`);
  } else {
    // classic (Logo links) und stacked (Logo oben)
    const logo = logoHtml(d);
    const bar = d.divider ? `border-left:2px solid ${A};padding-left:16px;` : "";
    const textCell = inner([name + p.title + p.dept, company + address, contactLines(p, false)], font);
    if (logo && d.layout !== "stacked") {
      lines.push(`  <tr>\n    <td valign="top" style="vertical-align:top;padding-right:16px;">${logo}</td>\n    <td valign="top" style="vertical-align:top;${bar}">${textCell}</td>\n  </tr>`);
    } else {
      if (logo) lines.push(`  <tr><td colspan="2" style="padding-bottom:12px;">${logo}</td></tr>`);
      lines.push(`  <tr><td colspan="2" valign="top" style="vertical-align:top;${d.divider && !logo ? bar : ""}">${textCell}</td></tr>`);
    }
  }
  lines.push(p.legal, p.extra);
  return tbl(lines.filter(Boolean).join("\n"));
}

export function genText(d, compact) {
  d = normalizeDesign(d);
  const f = d.fields;
  if (compact)
    return "{{DisplayName}}" + (f.title ? "{{#Title}} · {{Title}}{{/Title}}" : "") + "\n" +
      (f.company ? "{{#Company}}{{Company}}{{/Company}}" : "") + (f.phone ? "{{#Phone}} · Tel. {{Phone}}{{/Phone}}" : "") + "\n";
  let t = d.greeting ? d.greeting + "\n" : "";
  t += "{{DisplayName}}\n" + (f.title ? "{{#Title}}{{Title}}\n{{/Title}}" : "") + (f.department ? "{{#Department}}{{Department}}\n{{/Department}}" : "") + "\n";
  t += (f.company ? "{{#Company}}{{Company}}\n{{/Company}}" : "") + (f.address ? "{{#Street}}{{Street}}\n{{/Street}}{{#City}}{{City}}\n{{/City}}" : "");
  t += (f.phone ? "{{#Phone}}Tel. {{Phone}}\n{{/Phone}}" : "") + (f.mobile ? "{{#Mobile}}Mobil {{Mobile}}\n{{/Mobile}}" : "") +
    (f.email ? "{{#Email}}{{Email}}\n{{/Email}}" : "") + (f.website ? "{{#Website}}{{Website}}\n{{/Website}}" : "");
  if (f.legal) t += "{{#Legal}}\n{{Legal}}\n{{/Legal}}";
  if (d.extra) t += "\n" + d.extra + "\n";
  return t;
}

// Vorlagen-Dateien einer Ebene aus einer Bibliotheks-Signatur (_sig markiert die Herkunft)
export function templatesFor(sigId, design) {
  const d = normalizeDesign(design);
  const t = { "design.json": JSON.stringify({ ...d, _sig: sigId }, null, 2), "new.html": genHtml(d, false), "new.txt": genText(d, false) };
  if (d.reply === "none") { t["reply.html"] = ""; t["reply.txt"] = ""; }
  else if (d.reply === "full") { t["reply.html"] = null; t["reply.txt"] = null; }
  else { t["reply.html"] = genHtml(d, true); t["reply.txt"] = genText(d, true); }
  return t;
}

export const sigOf = (t) => {
  try { return JSON.parse((t && t["design.json"]) || "null")?._sig || null; } catch { return null; }
};
