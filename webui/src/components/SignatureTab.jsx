import { useEffect, useRef, useState } from "react";
import { useStore } from "../App.jsx";
import { DEFAULT_DESIGN, FIELD_LABELS, FONTS, applyDesign, contrast, getDesign } from "../lib/design.js";
import { analyzeCanvas, fileToAsset, imageToCanvas, loadImage, transformAsset } from "../lib/logo.js";
import { hasOwn, htmlToText, isDomain, knownKeys } from "../lib/template.js";
import Preview, { toLocal } from "./Preview.jsx";
import { Card, Icon, Row, Seg } from "./ui.jsx";

export default function SignatureTab({ level }) {
  const { S, mutate } = useStore();
  const [mode, setMode] = useState("design");
  const [kind, setKind] = useState("new");

  if (!hasOwn(S, level)) {
    const createOwn = () => mutate((n) => {
      n.templates[level] = { ...(n.templates.default || { "new.html": "", "new.txt": null, "reply.html": null, "reply.txt": null }) };
    }, { tpl: level });
    return (
      <div className="grid gap-4 xl:grid-cols-2 items-start">
        <Card title="Standard-Signatur aktiv">
          <button className="btn btn-primary" onClick={createOwn}><Icon name="plus" /> Eigene Signatur anlegen</button>
        </Card>
        <Preview level={level} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Seg value={mode} onChange={setMode} size="" options={[["design", "Designer"], ["code", "HTML-Code"]]} />
        <div className="flex-1" />
        {level !== "default" && (
          <button className="btn btn-sm btn-default" onClick={() => {
            if (confirm("Eigene Signatur löschen? Danach gilt wieder die übergeordnete Signatur.")) mutate((n) => { delete n.templates[level]; }, { del: level });
          }}><Icon name="trash" /> Eigene Signatur löschen</button>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-2 items-start">
        {mode === "design" ? <Designer level={level} /> : <CodeEditor level={level} kind={kind} setKind={setKind} />}
        <div className="xl:sticky xl:top-[68px]"><Preview level={level} initialKind={mode === "code" ? kind : "new"} /></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Designer
function Designer({ level }) {
  const { S, mutate, notify } = useStore();
  const d = getDesign(S.templates[level]);
  const logoFile = useRef(), darkFile = useRef();
  const [showLib, setShowLib] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (fn) => mutate((n) => {
    const dd = getDesign(n.templates[level]) || structuredClone(DEFAULT_DESIGN);
    fn(dd);
    applyDesign(n.templates[level], dd);
  }, { tpl: level });
  const addAsset = (a) => mutate((n) => { n.assets = [a, ...n.assets.filter((x) => x.name !== a.name)]; });

  if (!d) {
    return (
      <Card title="Designer">
        <button className="btn btn-primary" onClick={() => {
          if ((S.templates[level]["new.html"] || "").trim() && !confirm("Der Designer ersetzt die aktuelle HTML-Vorlage. Fortfahren?")) return;
          update(() => {});
        }}>Designer starten</button>
      </Card>
    );
  }

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

      <Card title="Aufbau & Farben">
        <Row label="Anordnung"><Seg value={d.layout} onChange={(v) => update((dd) => { dd.layout = v; })} options={[["side", "Logo links"], ["stacked", "Logo oben"]]} /></Row>
        <Row label="Trennlinie">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-mc-primary" checked={d.divider} onChange={(e) => update((dd) => { dd.divider = e.target.checked; })} /> anzeigen</label>
        </Row>
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

// ------------------------------------------------------------------ HTML-Code
function CodeEditor({ level, kind, setKind }) {
  const { S, mutate, notify } = useStore();
  const [fmt, setFmt] = useState("html");
  const ta = useRef();
  const t = S.templates[level];
  const replyMode = t["reply.html"] == null && t["reply.txt"] == null ? "same"
    : (t["reply.html"] || "").trim() === "" && (t["reply.txt"] || "").trim() === "" ? "none" : "own";
  const file = `${kind}.${fmt === "html" ? "html" : "txt"}`;
  const showEditor = kind === "new" || replyMode === "own";
  const auto = fmt === "text" && t[file] == null;
  const keys = knownKeys(S, isDomain(level) ? level : level.includes("@") ? level.split("@")[1] : "");

  const setFile = (f, v) => mutate((n) => {
    if (n.templates[level]["design.json"]) {
      n.templates[level]["design.json"] = null;
      notify("Designer für diese Vorlage aus – HTML wird manuell gepflegt");
    }
    n.templates[level][f] = v;
  }, { tpl: level });
  const setReply = (m) => mutate((n) => {
    const tp = n.templates[level];
    if (m === "same") { tp["reply.html"] = null; tp["reply.txt"] = null; }
    if (m === "none") { tp["reply.html"] = ""; tp["reply.txt"] = ""; }
    if (m === "own") { tp["reply.html"] = tp["new.html"] || ""; tp["reply.txt"] = tp["new.txt"]; }
  }, { tpl: level });
  const insert = (k) => {
    const el = ta.current;
    if (!el || el.disabled) return;
    const s = el.selectionStart, e = el.selectionEnd, sel = el.value.slice(s, e);
    const ins = sel ? `{{#${k}}}${sel}{{/${k}}}` : `{{${k}}}`;
    setFile(file, el.value.slice(0, s) + ins + el.value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + ins.length; });
  };

  return (
    <div className="card">
      <div className="card-header flex-wrap">
        <Seg value={kind} onChange={setKind} options={[["new", "Neue Mail"], ["reply", "Antwort"]]} />
        <div className="ml-auto font-normal">{showEditor && <Seg value={fmt} onChange={setFmt} options={[["html", "HTML"], ["text", "Text"]]} />}</div>
      </div>
      {kind === "reply" && (
        <div className="px-4 py-2.5 border-b border-mc-border dark:border-mc-d-border">
          <Seg value={replyMode} onChange={setReply} options={[["own", "Eigene"], ["same", "Wie neue Mail"], ["none", "Keine"]]} />
        </div>
      )}
      {showEditor ? (
        <>
          <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-mc-border bg-mc-alt dark:bg-mc-d-alt dark:border-mc-d-border">
            {keys.map((k) => <button key={k} type="button" className="chip" onClick={() => insert(k)}>{`{{${k}}}`}</button>)}
          </div>
          {fmt === "text" && (
            <label className="flex items-center gap-2 px-4 py-2 border-b border-mc-border dark:border-mc-d-border text-[13px]">
              <input type="checkbox" className="accent-mc-primary" checked={auto}
                onChange={(e) => setFile(file, e.target.checked ? null : htmlToText(t[kind + ".html"] || ""))} />
              automatisch aus HTML
            </label>
          )}
          <textarea ref={ta} spellCheck={false} disabled={auto}
            className="block w-full min-h-[460px] p-3 font-mono text-[12.5px] leading-relaxed bg-transparent outline-none resize-y rounded-b"
            value={auto ? htmlToText(t[kind + ".html"] || "") : t[file] || ""} onChange={(e) => setFile(file, e.target.value)} />
        </>
      ) : (
        <div className="card-body muted">{replyMode === "same" ? "Antworten bekommen die Signatur der neuen Mail." : "Antworten bekommen keine Signatur."}</div>
      )}
    </div>
  );
}

