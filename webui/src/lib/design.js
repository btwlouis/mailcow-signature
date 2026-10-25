import { esc } from "./template.js";

// E-Mail-taugliches HTML: Tabellen, Inline-Styles, keine Hintergrundfarben (damit Clients im
// Darkmode nur die Schrift umrechnen), Logo mit fester Breite.

export const DEFAULT_DESIGN = {
  layout: "side", font: "Arial, Helvetica, sans-serif", size: 13, text: "#333333", accent: "#0F688D",
  greeting: "Mit freundlichen Grüßen", divider: true, extra: "", reply: "compact",
  logo: { url: "", width: 120, alt: "", dark: "", protect: "" },
  fields: { title: true, department: false, company: true, address: true, phone: true, mobile: true, email: true, website: true, legal: true },
};

export const FIELD_LABELS = [["title", "Position"], ["department", "Abteilung"], ["company", "Firma"], ["address", "Adresse"],
  ["phone", "Telefon"], ["mobile", "Mobil"], ["email", "E-Mail"], ["website", "Website"], ["legal", "Pflichtangaben"]];

export const FONTS = [["Arial, Helvetica, sans-serif", "Arial"], ["Verdana, Geneva, sans-serif", "Verdana"], ["Tahoma, Geneva, sans-serif", "Tahoma"],
  ["'Segoe UI', Arial, sans-serif", "Segoe UI"], ["'Trebuchet MS', Arial, sans-serif", "Trebuchet MS"], ["Georgia, 'Times New Roman', serif", "Georgia"]];

export function getDesign(t) {
  const raw = t && t["design.json"];
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    const base = structuredClone(DEFAULT_DESIGN);
    return { ...base, ...d, logo: { ...base.logo, ...d.logo }, fields: { ...base.fields, ...d.fields } };
  } catch {
    return null;
  }
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

function logoHtml(d) {
  if (!d.logo.url) return "";
  const w = Math.round(+d.logo.width || 120), alt = esc(d.logo.alt) || "{{Company}}";
  const st = `border:0;outline:none;text-decoration:none;width:${w}px;max-width:${w}px;height:auto;`;
  if (!d.logo.dark) return `<img src="${esc(d.logo.url)}" width="${w}" alt="${alt}" style="display:block;${st}">`;
  return `<style>@media (prefers-color-scheme: dark){.mcsig-logo-light{display:none!important;}.mcsig-logo-dark{display:block!important;}}</style>` +
    `<img class="mcsig-logo-light" src="${esc(d.logo.url)}" width="${w}" alt="${alt}" style="display:block;${st}">` +
    `<!--[if !mso]><!--><img class="mcsig-logo-dark" src="${esc(d.logo.dark)}" width="${w}" alt="${alt}" style="display:none;${st}"><!--<![endif]-->`;
}

export function genHtml(d, compact) {
  const A = d.accent, T = d.text, M = "#666666", S0 = +d.size || 13, F = d.font.replace(/"/g, "'");
  const font = `font-family:${F};font-size:${S0}px;line-height:1.45;color:${T};`;
  const tbl = (inner) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:16px;${font}">\n${inner}\n</table>`;
  const f = d.fields;
  if (compact) {
    return tbl(`  <tr><td style="${font}">
    <strong style="color:${T};">{{DisplayName}}</strong>${f.title ? `{{#Title}} &middot; <span style="color:${M};">{{Title}}</span>{{/Title}}` : ""}<br>
    <span style="font-size:${S0 - 1}px;color:${M};">${f.company ? "{{#Company}}{{Company}}{{/Company}}" : ""}${f.phone ? "{{#Phone}} &middot; Tel. {{Phone}}{{/Phone}}" : ""}</span>
  </td></tr>`);
  }
  const link = (href, label) => `<a href="${href}" style="color:${A};text-decoration:none;">${label}</a>`;
  const rows = [];
  rows.push(`<strong style="font-size:${S0 + 2}px;color:${T};">{{DisplayName}}</strong>` +
    (f.title ? `{{#Title}}<br><span style="color:${M};">{{Title}}</span>{{/Title}}` : "") +
    (f.department ? `{{#Department}}<br><span style="color:${M};">{{Department}}</span>{{/Department}}` : ""));
  const g2 = (f.company ? `{{#Company}}<strong style="color:${A};">{{Company}}</strong><br>{{/Company}}` : "") +
    (f.address ? "{{#Street}}{{Street}}<br>{{/Street}}{{#City}}{{City}}<br>{{/City}}" : "");
  if (g2) rows.push(g2);
  const g3 = (f.phone ? "{{#Phone}}Tel. {{Phone}}<br>{{/Phone}}" : "") + (f.mobile ? "{{#Mobile}}Mobil {{Mobile}}<br>{{/Mobile}}" : "") +
    (f.email ? `{{#Email}}${link("mailto:{{Email}}", "{{Email}}")}<br>{{/Email}}` : "") +
    (f.website ? `{{#Website}}${link("https://{{Website}}", "{{Website}}")}{{/Website}}` : "");
  if (g3) rows.push(g3);
  const inner = rows.map((r, i) => `      <tr><td style="${font}${i ? "padding-top:8px;" : ""}">${r}</td></tr>`).join("\n");
  const textCell = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">\n${inner}\n    </table>`;
  const logo = logoHtml(d);
  const lines = [];
  if (d.greeting) lines.push(`  <tr><td colspan="2" style="${font}padding-bottom:12px;">${esc(d.greeting)}</td></tr>`);
  const bar = d.divider ? `border-left:2px solid ${A};padding-left:16px;` : "";
  if (logo && d.layout === "side") {
    lines.push(`  <tr>\n    <td valign="top" style="vertical-align:top;padding-right:16px;">${logo}</td>\n    <td valign="top" style="vertical-align:top;${bar}">${textCell}</td>\n  </tr>`);
  } else {
    if (logo) lines.push(`  <tr><td colspan="2" style="padding-bottom:12px;">${logo}</td></tr>`);
    lines.push(`  <tr><td colspan="2" valign="top" style="vertical-align:top;${d.divider && !logo ? bar : ""}">${textCell}</td></tr>`);
  }
  const small = `font-family:${F};font-size:${Math.max(10, S0 - 3)}px;line-height:1.4;color:#888888;padding-top:12px;`;
  if (f.legal) lines.push(`  {{#Legal}}<tr><td colspan="2" style="${small}">{{Legal}}</td></tr>{{/Legal}}`);
  if (d.extra) lines.push(`  <tr><td colspan="2" style="${small}">${esc(d.extra)}</td></tr>`);
  return tbl(lines.join("\n"));
}

export function genText(d, compact) {
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

// Schreibt Design + erzeugte Vorlagen in das Vorlagen-Objekt einer Ebene
export function applyDesign(t, d) {
  t["design.json"] = JSON.stringify(d, null, 2);
  t["new.html"] = genHtml(d, false);
  t["new.txt"] = genText(d, false);
  if (d.reply === "none") { t["reply.html"] = ""; t["reply.txt"] = ""; }
  else if (d.reply === "full") { t["reply.html"] = null; t["reply.txt"] = null; }
  else { t["reply.html"] = genHtml(d, true); t["reply.txt"] = genText(d, true); }
}
