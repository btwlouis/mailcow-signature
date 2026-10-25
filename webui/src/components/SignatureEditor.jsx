import { useEffect, useRef, useState } from "react";
import { useStore } from "../App.jsx";
import { FIELD_LABELS, FONTS, LAYOUTS, contrast, normalizeDesign } from "../lib/design.js";
import { analyzeCanvas, fileToAsset, imageToCanvas, loadImage, transformAsset } from "../lib/logo.js";
import Preview, { toLocal } from "./Preview.jsx";
import { Card, Icon, Row, Seg } from "./ui.jsx";

// Bearbeitet eine Signatur aus der Bibliothek; Domains/Personen verweisen per config.signatures darauf
export default function SignatureEditor({ id }) {
  const { S, mutate, notify, setNav } = useStore();
  const entry = S.library[id];
  const logoFile = useRef(), darkFile = useRef();
  const [showLib, setShowLib] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!entry) return <div className="card card-body muted">Signatur nicht gefunden.</div>;
  const d = normalizeDesign(entry.design);
  const update = (fn) => mutate((n) => { const dd = normalizeDesign(n.library[id].design); fn(dd); n.library[id].design = dd; }, { library: true });
  const addAsset = (a) => mutate((n) => { n.assets = [a, ...n.assets.filter((x) => x.name !== a.name)]; });
  const usedBy = Object.entries(S.config.signatures || {}).filter(([, v]) => v === id).map(([l]) => (l === "default" ? "Standard" : l));

  const upload = async (file, dark) => {
    if (!file) return;
    setBusy(true);
    try {
      const a = await fileToAsset(file);
      addAsset(a);
      update((dd) => { if (dark) dd.logo.dark = a.url; else { dd.logo.url = a.url; dd.logo.protect = ""; } });
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  };
  const transform = async (kind) => {
    setBusy(true);
    try {
      const { asset, ratio } = await transformAsset(toLocal(S, d.logo.url), kind);
      addAsset(asset);
      update((dd) => { dd.logo.url = asset.url; dd.logo.protect = kind; dd.logo.width = Math.min(300, Math.round(dd.logo.width * ratio)); });
    } catch (e) { notify("Logo konnte nicht bearbeitet werden: " + e.message, true); }
    setBusy(false);
  };
  const deleteAsset = async (name) => {
    if (!confirm("Bild löschen? Bereits verschickte Mails zeigen es dann nicht mehr.")) return;
    try {
      await fetch("/api/assets/" + encodeURIComponent(name), { method: "DELETE", credentials: "same-origin", headers: { "X-Requested-With": "sigui" } });
      mutate((n) => { n.assets = n.assets.filter((a) => a.name !== name); });
    } catch (e) { notify(e.message, true); }
  };

  const cA = contrast(d.accent, "#ffffff"), cAd = contrast(d.accent, "#1f1f1f");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button className="btn btn-sm btn-default" onClick={() => setNav({ page: "signatures" })}>← Signaturen</button>
        <input className="form-control w-72 font-semibold" value={entry.name}
          onChange={(e) => mutate((n) => { n.library[id].name = e.target.value; }, { library: true })} />
        <div className="flex flex-wrap gap-1">
          {usedBy.length ? usedBy.map((u) => <span key={u} className="badge bg-mc-info text-white">{u}</span>)
            : <span className="text-[12px] muted">nicht zugeordnet – unter „Domains“ auswählen</span>}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2 items-start">
  return (
    <div className="space-y-4">
      <Card title="Logo" actions={busy && <span className="font-normal muted text-[12px]">verarbeite …</span>}>
        {d.logo.url && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="relative h-24 rounded border border-mc-border bg-white grid place-items-center">
                <span className="absolute left-2 top-1 text-[10px] font-bold text-gray-400">HELL</span>
                <img src={toLocal(S, d.logo.url)} alt="" className="max-w-[85%] max-h-16" />
              </div>
              <div className="relative h-24 rounded border border-mc-d-border bg-[#1f1f1f] grid place-items-center">
                <span className="absolute left-2 top-1 text-[10px] font-bold text-gray-500">DUNKEL</span>
                <img src={toLocal(S, d.logo.dark || d.logo.url)} alt="" className="max-w-[85%] max-h-16" />
              </div>
            </div>
            <LogoChecks S={S} d={d} />
          </>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => logoFile.current.click()}>{d.logo.url ? "Anderes Logo" : "Logo hochladen"}</button>
          {S.assets.length > 0 && <button className="btn btn-sm btn-default" onClick={() => setShowLib(!showLib)}>Bibliothek ({S.assets.length})</button>}
          {d.logo.url && <button className="btn btn-sm btn-default" onClick={() => update((dd) => { dd.logo.url = ""; dd.logo.dark = ""; })}>Entfernen</button>}
        </div>
        {showLib && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2 mb-3">
            {S.assets.map((a) => (
              <div key={a.name} onClick={() => update((dd) => { dd.logo.url = a.url; dd.logo.protect = ""; })}
                className={"relative h-16 p-1.5 rounded border bg-white grid place-items-center cursor-pointer " + (a.url === d.logo.url ? "border-mc-primary ring-2 ring-mc-primary/30" : "border-[#cfcfcf] hover:border-mc-info")}>
                <img src={"/assets/" + a.name} alt="" className="max-w-full max-h-12" />
                <button title="Löschen" className="absolute right-0.5 top-0.5 w-5 h-5 grid place-items-center rounded bg-white/90 text-mc-danger"
                  onClick={(e) => { e.stopPropagation(); deleteAsset(a.name); }}><Icon name="trash" size={11} /></button>
              </div>
            ))}
          </div>
        )}
        {d.logo.url && (
          <>
            <Row label="Breite">
              <div className="flex items-center gap-3">
                <input type="range" min="40" max="300" step="2" value={d.logo.width} className="w-full accent-mc-primary"
                  onChange={(e) => update((dd) => { dd.logo.width = Number(e.target.value); })} />
                <span className="font-mono text-[12px] w-12">{d.logo.width}px</span>
              </div>
            </Row>
            <Row label="Alt-Text"><input className="form-control" value={d.logo.alt} placeholder="Firmenname" onChange={(e) => update((dd) => { dd.logo.alt = e.target.value; })} /></Row>
            <Row label="Darkmode">
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm btn-default" disabled={busy} onClick={() => transform("outline")} title="Schmale weiße Kontur – wirkt in allen Mailprogrammen">Weiße Kontur</button>
                <button className="btn btn-sm btn-default" disabled={busy} onClick={() => transform("plate")} title="Weiße Fläche ins Bild einbacken – wirkt in allen Mailprogrammen">Weiße Fläche</button>
                <button className="btn btn-sm btn-default" disabled={busy} onClick={() => darkFile.current.click()} title="Nur Apple Mail, Outlook Mac/iOS, Thunderbird">{d.logo.dark ? "DM-Logo ersetzen" : "Darkmode-Logo"}</button>
                {d.logo.dark && <button className="btn btn-sm btn-default" onClick={() => update((dd) => { dd.logo.dark = ""; })}>DM-Logo entfernen</button>}
              </div>
            </Row>
          </>
        )}
        <input ref={logoFile} type="file" hidden accept="image/png,image/jpeg,image/gif,image/svg+xml" onChange={(e) => { upload(e.target.files[0], false); e.target.value = ""; }} />
        <input ref={darkFile} type="file" hidden accept="image/png,image/jpeg,image/gif,image/svg+xml" onChange={(e) => { upload(e.target.files[0], true); e.target.value = ""; }} />
      </Card>

      <Card title="Layout & Farben">
        <Row label="Layout">
          <select className="form-control" value={d.layout} onChange={(e) => update((dd) => { dd.layout = e.target.value; })}>
            {LAYOUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Row>
        {(d.layout === "classic" || d.layout === "stacked") && (
          <Row label="Trennlinie">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-mc-primary" checked={d.divider} onChange={(e) => update((dd) => { dd.divider = e.target.checked; })} /> anzeigen</label>
          </Row>
        )}
        <Row label="Schrift">
          <div className="flex gap-2">
            <select className="form-control" value={d.font} onChange={(e) => update((dd) => { dd.font = e.target.value; })}>
              {FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="form-control w-28" value={d.size} onChange={(e) => update((dd) => { dd.size = Number(e.target.value); })}>
              {[12, 13, 14, 15].map((s) => <option key={s} value={s}>{s} px</option>)}
            </select>
          </div>
        </Row>
        <Row label="Farben">
          <div className="flex flex-wrap gap-4">
            <ColorInput label="Text" value={d.text} onChange={(v) => update((dd) => { dd.text = v; })} />
            <ColorInput label="Akzent" value={d.accent} onChange={(v) => update((dd) => { dd.accent = v; })} />
          </div>
        </Row>
        {cA < 3 && <div className="alert alert-warning">Akzentfarbe auf Weiß schwer lesbar ({cA.toFixed(1)}:1)</div>}
        {cA >= 3 && cAd < 2.2 && <div className="alert alert-warning">Akzentfarbe im Darkmode schwer lesbar ({cAd.toFixed(1)}:1)</div>}
      </Card>

      <Card title="Inhalt">
        <Row label="Grußformel"><input className="form-control" value={d.greeting} placeholder="leer = keine" onChange={(e) => update((dd) => { dd.greeting = e.target.value; })} /></Row>
        <Row label="Felder" top>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {FIELD_LABELS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-mc-primary" checked={!!d.fields[k]} onChange={(e) => update((dd) => { dd.fields[k] = e.target.checked; })} /> {l}
              </label>
            ))}
          </div>
        </Row>
        <Row label="Zusatzzeile"><input className="form-control" value={d.extra} placeholder="optional" onChange={(e) => update((dd) => { dd.extra = e.target.value; })} /></Row>
        <Row label="Antworten">
          <Seg value={d.reply} onChange={(v) => update((dd) => { dd.reply = v; })} options={[["compact", "Kurz"], ["full", "Wie neu"], ["none", "Keine"]]} />
        </Row>
      </Card>
    </div>
  );
        <div className="xl:sticky xl:top-[68px]"><Preview design={d} sigId={id} /></div>
      </div>
    </div>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-8 p-0.5 rounded border border-[#cfcfcf] bg-white cursor-pointer" />
      <span className="text-[12.5px]">{label} <span className="font-mono muted">{value}</span></span>
    </label>
  );
}

// Analyse (transparent/dunkel/Auflösung) und öffentliche Erreichbarkeit
function LogoChecks({ S, d }) {
  const [info, setInfo] = useState(null);
  const [pub, setPub] = useState(null);
  const embed = S.config.logo_mode === "embed";

  useEffect(() => {
    let off = false;
    const local = toLocal(S, d.logo.url);
    (async () => {
      if (!local.startsWith("/assets/")) return setInfo(["", "Externes Logo – keine Prüfung möglich"]);
      try {
        const img = await loadImage(local);
        const a = analyzeCanvas(imageToCanvas(img, 400));
        let r;
        if (d.logo.protect === "outline") r = ["success", "Darkmode-Schutz: weiße Kontur ✓"];
        else if (d.logo.protect === "plate") r = ["success", "Darkmode-Schutz: weiße Fläche ✓"];
        else if (a.transparent && a.lum < 0.35) r = ["warning", "Dunkel + transparent: im Darkmode kaum sichtbar → „Weiße Kontur“"];
        else if (a.transparent && a.lum > 0.8) r = ["warning", "Hell + transparent: auf Weiß kaum sichtbar → dunkle Variante als Darkmode-Logo"];
        else if (!a.transparent) r = ["success", "Eigener Hintergrund ✓"];
        else r = ["info", "Transparent, mittlere Helligkeit – Vorschau „Dunkel“ prüfen"];
        const sharp = img.naturalWidth >= d.logo.width * 2;
        r[1] += ` · ${img.naturalWidth}×${img.naturalHeight}px` + (sharp ? "" : ` · zu klein für scharfe Darstellung (≥ ${d.logo.width * 2}px)`);
        if (!sharp && r[0] === "success") r[0] = "warning";
        if (!off) setInfo(r);
      } catch {
        if (!off) setInfo(["danger", "Logo konnte nicht geladen werden"]);
      }
    })();
    if (embed) setPub(["success", "Wird eingebettet ✓"]);
    else {
      const img = new Image();
      img.onload = () => !off && setPub(["success", "Öffentlich erreichbar ✓"]);
      img.onerror = () => !off && setPub(["danger", "Nicht öffentlich erreichbar: " + d.logo.url]);
      img.src = d.logo.url + (d.logo.url.includes("?") ? "&" : "?") + "check=" + Date.now();
    }
    return () => { off = true; };
  }, [d.logo.url, d.logo.protect, d.logo.width, embed]);

  return (
    <div className="space-y-2 mb-3">
      {info && <div className={"alert alert-" + (info[0] || "info")}>{info[1]}</div>}
      {pub && <div className={"alert alert-" + pub[0]}>{pub[1]}</div>}
    </div>
  );
}
