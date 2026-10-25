// Rendering wie im rspamd-Plugin (mailcow_signature.lua), damit die Vorschau stimmt.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const nonempty = (v) => v !== undefined && v !== null && String(v) !== "";

function lookup(vars, k) {
  if (k in vars) return vars[k];
  const lk = k.toLowerCase();
  for (const x in vars) if (x.toLowerCase() === lk) return vars[x];
  return undefined;
}

export function render(tpl, vars, html) {
  tpl = tpl.replace(/{{#(\w+)}}([\s\S]*?){{\/\1}}/g, (m, k, i) => (nonempty(lookup(vars, k)) ? i : ""));
  tpl = tpl.replace(/{{\^(\w+)}}([\s\S]*?){{\/\1}}/g, (m, k, i) => (nonempty(lookup(vars, k)) ? "" : i));
  const sub = (m, k) => {
    const v = lookup(vars, k);
    return nonempty(v) ? (html ? esc(v) : String(v)) : "";
  };
  return tpl.replace(/{{(\w+)}}/g, sub).replace(/%%(\w+)%%/g, sub);
}

export function htmlToText(h) {
  h = h.replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/[\n\t ]+/g, " ");
  h = h.replace(/<br[^>]*>/gi, "\n").replace(/<\/(p|div|tr)>/gi, "\n").replace(/<[^>]*>/g, "");
  h = h.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return h.replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildVars(S, addr, domain) {
  const cv = S.config.vars || {};
  const v = Object.assign({}, cv["*"] || {}, cv[domain] || {}, S.users[addr] || {});
  if (!nonempty(v.DisplayName)) v.DisplayName = addr.split("@")[0];
  if (!nonempty(v.FirstName)) v.FirstName = (String(v.DisplayName).match(/^(\S+)/) || [])[1];
  if (!nonempty(v.LastName)) v.LastName = (String(v.DisplayName).match(/\s(\S+)$/) || [])[1];
  if (nonempty(v.Website)) v.Website = String(v.Website).replace(/^https?:[/][/]/i, "").replace(/[/]$/, "");
  v.Email = v.Email || addr;
  v.Domain = domain;
  v.Year = String(new Date().getFullYear());
  return v;
}

// gleiche Suchreihenfolge wie das Plugin: Adresse > Domain > default
export function resolve(S, addr, domain, kind) {
  for (const level of [addr, domain, "default"]) {
    const t = S.templates[level];
    if (!t || (t["new.html"] == null && t["new.txt"] == null)) continue;
    if (kind === "reply" && (t["reply.html"] != null || t["reply.txt"] != null))
      return { level, html: t["reply.html"], txt: t["reply.txt"] };
    return { level, html: t["new.html"], txt: t["new.txt"] };
  }
  return null;
}

export const isDomain = (l) => l !== "default" && !l.includes("@");
export const hasOwn = (S, l) => {
  const t = S.templates[l];
  return !!t && (t["new.html"] != null || t["new.txt"] != null);
};
export const usersOf = (S, d) => Object.keys(S.users).filter((a) => a.endsWith("@" + d)).sort();

export function domains(S) {
  const set = new Set(S.config.domains || []);
  Object.keys(S.templates).filter(isDomain).forEach((d) => set.add(d));
  Object.keys(S.config.vars || {}).filter((k) => k !== "*").forEach((d) => set.add(d));
  return [...set].sort();
}

export const STD_FIELDS = ["DisplayName", "Title", "Department", "Phone", "Mobile"];
const AUTO_VARS = ["DisplayName", "FirstName", "LastName", "Email", "Domain", "Year"];

export function knownKeys(S, domain) {
  const set = new Set([...AUTO_VARS, ...STD_FIELDS]);
  const cv = S.config.vars || {};
  [cv["*"], cv[domain]].forEach((o) => o && Object.keys(o).forEach((k) => set.add(k)));
  Object.entries(S.users).forEach(([a, f]) => (!domain || a.endsWith("@" + domain)) && Object.keys(f).forEach((k) => set.add(k)));
  set.delete("DisplayNameLocked");
  return [...set];
}
