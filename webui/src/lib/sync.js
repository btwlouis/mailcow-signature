import { getDesign, sigOf, templatesFor } from "./design.js";

const FILES = ["new.html", "new.txt", "reply.html", "reply.txt", "design.json"];
const pick = (t) => Object.fromEntries(FILES.map((f) => [f, t ? (t[f] ?? null) : null]));
const same = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));

// Welche Vorlagen-Ordner müssen aus den Zuordnungen (config.signatures) neu geschrieben
// oder gelöscht werden? Ergebnis: {put: {ebene: vorlagen}, del: [ebene]}
export function pendingSync(S) {
  const sigs = S.config.signatures || {};
  const put = {}, del = [];
  for (const [level, id] of Object.entries(sigs)) {
    const entry = S.library[id];
    if (!entry) continue;
    const gen = templatesFor(id, entry.design);
    if (!same(gen, S.templates[level])) put[level] = gen;
  }
  for (const level of S._delete || []) if (!S.templates[level]) del.push(level);
  for (const level of Object.keys(S.templates)) {
    const id = sigOf(S.templates[level]);
    if (id && !(sigs[level] && S.library[sigs[level]])) del.push(level);
  }
  return { put, del };
}

// Vorlagen, wie sie nach dem Speichern aussehen (für die Vorschau)
export function effectiveTemplates(S) {
  const { put, del } = pendingSync(S);
  const t = { ...S.templates, ...put };
  del.forEach((l) => delete t[l]);
  return t;
}

// Einmalig: Designer-Signaturen der alten Oberfläche in die Bibliothek übernehmen
export function migrate(S) {
  if (Object.keys(S.library).length) return false;
  let changed = false;
  S.config.signatures ||= {};
  for (const [level, t] of Object.entries(S.templates)) {
    const d = getDesign(t);
    if (!d || sigOf(t)) continue;
    const id = "sig_" + level.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 50);
    S.library[id] = { name: level === "default" ? "Standard" : level, design: d };
    S.config.signatures[level] = id;
    changed = true;
  }
  return changed;
}

export const domainOf = (S, id) =>
  Object.entries(S.config.signatures || {}).find(([l, v]) => v === id && l !== "default" && !l.includes("@"))?.[0] || null;

export const newId = () => "sig_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
