import { useState } from "react";
import { useStore } from "../App.jsx";
import { PRESETS, genHtml, normalizeDesign } from "../lib/design.js";
import { domainOf, newId } from "../lib/sync.js";
import { render } from "../lib/template.js";
import { demoVars, signatureDoc } from "./Preview.jsx";
import { Icon } from "./ui.jsx";

// Platzhalter-Logo nur für die Vorlagen-Auswahl (wird nicht gespeichert)
const DEMO_LOGO = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" rx="10" fill="#e8eef2"/>' +
  '<circle cx="40" cy="40" r="22" fill="#0F688D"/><text x="74" y="50" font-family="Arial" font-size="28" font-weight="bold" fill="#0F688D">LOGO</text></svg>');

// Kleine Vorschau einer Signatur (skaliert, nicht klickbar)
export function Thumb({ design, height = 150, demoLogo, domain = null }) {
  const { S } = useStore();
  const d = normalizeDesign(design);
  if (demoLogo && !d.logo.url && d.layout !== "minimal") d.logo = { ...d.logo, url: DEMO_LOGO, width: 110 };
  const html = render(genHtml(d, false), demoVars(S, domain), true);
  return (
    <div className="relative overflow-hidden bg-white border-b border-mc-border dark:border-mc-d-border" style={{ height }}>
      <iframe title="Vorschau" sandbox="allow-same-origin" tabIndex={-1} scrolling="no" srcDoc={signatureDoc(S, html, { frame: false })}
        className="absolute left-0 top-0 origin-top-left pointer-events-none" style={{ width: "166%", height: height * 1.66, transform: "scale(0.6)", border: 0 }} />
    </div>
  );
}

export default function SignaturesPage() {
  const { S, mutate, setNav } = useStore();
  const [picking, setPicking] = useState(Object.keys(S.library).length === 0);
  const sigs = S.config.signatures || {};
  const usedBy = (id) => Object.entries(sigs).filter(([, v]) => v === id).map(([l]) => (l === "default" ? "Standard" : l));

  const create = (preset) => {
    const id = newId();
    mutate((n) => {
      n.library[id] = { name: preset.name, design: normalizeDesign(structuredClone(preset.design)) };
      // erste Signatur gilt automatisch als Standard
      if (!n.config.signatures.default && Object.keys(n.library).length === 1) n.config.signatures.default = id;
    }, { library: true, config: true });
    setNav({ page: "sig", id });
  };
  const duplicate = (id) => {
    const nid = newId();
    mutate((n) => { n.library[nid] = { name: n.library[id].name + " (Kopie)", design: structuredClone(n.library[id].design) }; }, { library: true });
  };
  const remove = (id) => {
    const used = usedBy(id);
    if (!confirm(used.length ? `Signatur löschen? Sie wird verwendet von: ${used.join(", ")}. Dort gilt danach die Standard-Signatur.` : "Signatur löschen?")) return;
    mutate((n) => {
      delete n.library[id];
      for (const [l, v] of Object.entries(n.config.signatures)) if (v === id) delete n.config.signatures[l];
    }, { library: true, config: true });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-[20px] font-semibold">Signaturen</h1>
        <div className="flex-1" />
        <button className="btn btn-primary" onClick={() => setPicking(!picking)}><Icon name="plus" /> Neue Signatur</button>
      </div>

      {picking && (
        <div className="card mb-5">
          <div className="card-header">Vorlage wählen</div>
          <div className="card-body grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => create(p)} className="card overflow-hidden text-left hover:border-mc-info hover:ring-2 hover:ring-mc-info/20 transition">
                <Thumb design={p.design} height={140} demoLogo />
                <div className="px-3 py-2 font-semibold">{p.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.keys(S.library).length === 0 ? (
        !picking && <div className="card card-body muted">Noch keine Signaturen.</div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {Object.entries(S.library).map(([id, e]) => {
            const used = usedBy(id);
            return (
              <div key={id} className="card overflow-hidden flex flex-col">
                <button className="text-left" onClick={() => setNav({ page: "sig", id })}><Thumb design={e.design} domain={domainOf(S, id)} /></button>
                <div className="p-3 flex-1">
                  <div className="font-semibold">{e.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {used.length ? used.map((u) => <span key={u} className="badge bg-mc-info text-white">{u}</span>)
                      : <span className="text-[12px] muted">nicht zugeordnet</span>}
                  </div>
                </div>
                <div className="flex gap-2 px-3 py-2 border-t border-mc-border bg-mc-alt dark:bg-mc-d-alt dark:border-mc-d-border">
                  <button className="btn btn-sm btn-primary" onClick={() => setNav({ page: "sig", id })}><Icon name="pen" /> Bearbeiten</button>
                  <button className="btn btn-sm btn-default" onClick={() => duplicate(id)}>Duplizieren</button>
                  <div className="flex-1" />
                  <button className="btn btn-sm btn-default px-2" title="Löschen" onClick={() => remove(id)}><Icon name="trash" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
