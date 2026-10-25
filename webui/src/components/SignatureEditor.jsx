import { useEffect, useRef, useState } from "react";
import { useStore } from "../App.jsx";
import { FIELD_IDS, FONTS, LAYOUT_IDS, contrast, normalizeDesign } from "../lib/design.js";
import { LANGS } from "../lib/i18n.js";
import { analyzeCanvas, fileToAsset, imageToCanvas, loadImage, transformAsset } from "../lib/logo.js";
import { domainOf } from "../lib/sync.js";
import Preview, { toLocal } from "./Preview.jsx";
import { Card, Icon, Row, Seg } from "./ui.jsx";

// Logo hochladen/auswählen inkl. Darkmode-Werkzeugen; auch im Onboarding verwendet
export function LogoEditor({ logo, onChange, compact }) {
  const { S, mutate, notify, t } = useStore();
  const logoFile = useRef(), darkFile = useRef();
  const [showLib, setShowLib] = useState(false);
  const [busy, setBusy] = useState(false);
  const addAsset = (a) => mutate((n) => { n.assets = [a, ...n.assets.filter((x) => x.name !== a.name)]; });

  const upload = async (file, dark) => {
    if (!file) return;
    setBusy(true);
    try {
      const a = await fileToAsset(file);
      addAsset(a);
      onChange((l) => { if (dark) l.dark = a.url; else { l.url = a.url; l.protect = ""; } });
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  };
  const transform = async (kind) => {
    setBusy(true);
    try {
      const { asset, ratio } = await transformAsset(toLocal(S, logo.url), kind);
      addAsset(asset);
      onChange((l) => { l.url = asset.url; l.protect = kind; l.width = Math.min(300, Math.round(l.width * ratio)); });
    } catch (e) { notify(t("logo.err") + e.message, true); }
    setBusy(false);
  };
  const deleteAsset = async (name) => {
    if (!confirm(t("logo.deleteConfirm"))) return;
    try {
      await fetch("/api/assets/" + encodeURIComponent(name), { method: "DELETE", credentials: "same-origin", headers: { "X-Requested-With": "sigui" } });
      mutate((n) => { n.assets = n.assets.filter((a) => a.name !== name); });
    } catch (e) { notify(e.message, true); }
  };

  return (
    <div>
      {logo.url && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="relative h-24 rounded border border-mc-border bg-white grid place-items-center">
              <span className="absolute left-2 top-1 text-[10px] font-bold text-gray-400">{t("logo.light")}</span>
              <img src={toLocal(S, logo.url)} alt="" className="max-w-[85%] max-h-16" />
            </div>
            <div className="relative h-24 rounded border border-mc-d-border bg-[#1f1f1f] grid place-items-center">
              <span className="absolute left-2 top-1 text-[10px] font-bold text-gray-500">{t("logo.darkLbl")}</span>
              <img src={toLocal(S, logo.dark || logo.url)} alt="" className="max-w-[85%] max-h-16" />
            </div>
          </div>
          <LogoChecks logo={logo} />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => logoFile.current.click()}>{logo.url ? t("logo.other") : t("logo.upload")}</button>
        {S.assets.length > 0 && <button className="btn btn-sm btn-default" onClick={() => setShowLib(!showLib)}>{t("logo.library", { n: S.assets.length })}</button>}
        {logo.url && <button className="btn btn-sm btn-default" onClick={() => onChange((l) => { l.url = ""; l.dark = ""; })}>{t("remove")}</button>}
        {busy && <span className="muted text-[12px]">{t("processing")}</span>}
      </div>
      {showLib && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2 mb-3">
          {S.assets.map((a) => (
            <div key={a.name} onClick={() => onChange((l) => { l.url = a.url; l.protect = ""; })}
              className={"relative h-16 p-1.5 rounded border bg-white grid place-items-center cursor-pointer " + (a.url === logo.url ? "border-mc-primary ring-2 ring-mc-primary/30" : "border-[#cfcfcf] hover:border-mc-info")}>
              <img src={"/assets/" + a.name} alt="" className="max-w-full max-h-12" />
              <button title={t("delete")} className="absolute right-0.5 top-0.5 w-5 h-5 grid place-items-center rounded bg-white/90 text-mc-danger"
                onClick={(e) => { e.stopPropagation(); deleteAsset(a.name); }}><Icon name="trash" size={11} /></button>
            </div>
          ))}
        </div>
      )}
      {logo.url && (
        <>
          <Row label={t("logo.width")}>
            <div className="flex items-center gap-3">
              <input type="range" min="40" max="300" step="2" value={logo.width} className="w-full accent-mc-primary"
                onChange={(e) => onChange((l) => { l.width = Number(e.target.value); })} />
              <span className="font-mono text-[12px] w-12">{logo.width}px</span>
            </div>
          </Row>
          {!compact && <Row label={t("logo.alt")}><input className="form-control" value={logo.alt} placeholder={t("logo.altPh")} onChange={(e) => onChange((l) => { l.alt = e.target.value; })} /></Row>}
          <Row label={t("logo.dark")}>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-sm btn-default" disabled={busy} onClick={() => transform("outline")} title={t("logo.outlineTip")}>{t("logo.outline")}</button>
              <button className="btn btn-sm btn-default" disabled={busy} onClick={() => transform("plate")} title={t("logo.plateTip")}>{t("logo.plate")}</button>
              {!compact && <button className="btn btn-sm btn-default" disabled={busy} onClick={() => darkFile.current.click()} title={t("logo.dmTip")}>{logo.dark ? t("logo.dmReplace") : t("logo.dm")}</button>}
              {!compact && logo.dark && <button className="btn btn-sm btn-default" onClick={() => onChange((l) => { l.dark = ""; })}>{t("logo.dmRemove")}</button>}
            </div>
          </Row>
        </>
      )}
      <input ref={logoFile} type="file" hidden accept="image/png,image/jpeg,image/gif,image/svg+xml" onChange={(e) => { upload(e.target.files[0], false); e.target.value = ""; }} />
      <input ref={darkFile} type="file" hidden accept="image/png,image/jpeg,image/gif,image/svg+xml" onChange={(e) => { upload(e.target.files[0], true); e.target.value = ""; }} />
    </div>
  );
}

// Bearbeitet eine Signatur aus der Bibliothek; Domains/Personen verweisen per config.signatures darauf
export default function SignatureEditor({ id }) {
  const { S, mutate, setNav, t } = useStore();
  const entry = S.library[id];
  if (!entry) return <div className="card card-body muted">{t("ed.notFound")}</div>;
  const d = normalizeDesign(entry.design);
  const update = (fn) => mutate((n) => { const dd = normalizeDesign(n.library[id].design); fn(dd); n.library[id].design = dd; }, { library: true });
  const usedBy = Object.entries(S.config.signatures || {}).filter(([, v]) => v === id).map(([l]) => (l === "default" ? t("default") : l));
  const cA = contrast(d.accent, "#ffffff"), cAd = contrast(d.accent, "#1f1f1f");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button className="btn btn-sm btn-default" onClick={() => setNav({ page: "signatures" })}>{t("ed.back")}</button>
        <input className="form-control w-72 font-semibold" value={entry.name}
          onChange={(e) => mutate((n) => { n.library[id].name = e.target.value; }, { library: true })} />
        <div className="flex flex-wrap gap-1">
          {usedBy.length ? usedBy.map((u) => <span key={u} className="badge bg-mc-info text-white">{u}</span>)
            : <span className="text-[12px] muted">{t("ed.unassigned")}</span>}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2 items-start">
        <div className="space-y-4">
          <Card title={t("logo.title")}>
            <LogoEditor logo={d.logo} onChange={(fn) => update((dd) => fn(dd.logo))} />
          </Card>

          <Card title={t("ed.layoutColors")}>
            <Row label={t("f.layout")}>
              <select className="form-control" value={d.layout} onChange={(e) => update((dd) => { dd.layout = e.target.value; })}>
                {LAYOUT_IDS.map((v) => <option key={v} value={v}>{t("layout." + v)}</option>)}
              </select>
            </Row>
            {(d.layout === "classic" || d.layout === "stacked") && (
              <Row label={t("f.divider")}>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-mc-primary" checked={d.divider} onChange={(e) => update((dd) => { dd.divider = e.target.checked; })} /> {t("show")}</label>
              </Row>
            )}
            <Row label={t("f.font")}>
              <div className="flex gap-2">
                <select className="form-control" value={d.font} onChange={(e) => update((dd) => { dd.font = e.target.value; })}>
                  {FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select className="form-control w-28" value={d.size} onChange={(e) => update((dd) => { dd.size = Number(e.target.value); })}>
                  {[12, 13, 14, 15].map((s) => <option key={s} value={s}>{s} px</option>)}
                </select>
              </div>
            </Row>
            <Row label={t("f.colors")}>
              <div className="flex flex-wrap gap-4">
                <ColorInput label={t("f.text")} value={d.text} onChange={(v) => update((dd) => { dd.text = v; })} />
                <ColorInput label={t("f.accent")} value={d.accent} onChange={(v) => update((dd) => { dd.accent = v; })} />
              </div>
            </Row>
            {cA < 3 && <div className="alert alert-warning">{t("warn.accentWhite", { c: cA.toFixed(1) })}</div>}
            {cA >= 3 && cAd < 2.2 && <div className="alert alert-warning">{t("warn.accentDark", { c: cAd.toFixed(1) })}</div>}
          </Card>

          <Card title={t("ed.content")}>
            <Row label={t("f.lang")}>
              <Seg value={d.lang} onChange={(v) => update((dd) => { dd.lang = v; })} options={LANGS} />
            </Row>
            <Row label={t("f.greeting")}><input className="form-control" value={d.greeting} placeholder={t("f.greetingPh")} onChange={(e) => update((dd) => { dd.greeting = e.target.value; })} /></Row>
            <Row label={t("f.fields")} top>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {FIELD_IDS.map((k) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-mc-primary" checked={!!d.fields[k]} onChange={(e) => update((dd) => { dd.fields[k] = e.target.checked; })} /> {t("field." + k)}
                  </label>
                ))}
              </div>
            </Row>
            <Row label={t("f.extra")}><input className="form-control" value={d.extra} placeholder={t("optional")} onChange={(e) => update((dd) => { dd.extra = e.target.value; })} /></Row>
            <Row label={t("f.replies")}>
              <Seg value={d.reply} onChange={(v) => update((dd) => { dd.reply = v; })} options={[["compact", t("reply.compact")], ["full", t("reply.full")], ["none", t("reply.none")]]} />
            </Row>
          </Card>
        </div>
        <div className="xl:sticky xl:top-[68px]"><Preview design={d} sigId={id} domain={domainOf(S, id)} /></div>
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
function LogoChecks({ logo }) {
  const { S, t } = useStore();
  const [info, setInfo] = useState(null);
  const [pub, setPub] = useState(null);
  const embed = S.config.logo_mode === "embed";

  useEffect(() => {
    let off = false;
    const local = toLocal(S, logo.url);
    (async () => {
      if (!local.startsWith("/assets/")) return setInfo(["", t("chk.external")]);
      try {
        const img = await loadImage(local);
        const a = analyzeCanvas(imageToCanvas(img, 400));
        let r;
        if (logo.protect === "outline") r = ["success", t("chk.outline")];
        else if (logo.protect === "plate") r = ["success", t("chk.plate")];
        else if (a.transparent && a.lum < 0.35) r = ["warning", t("chk.darkTransparent")];
        else if (a.transparent && a.lum > 0.8) r = ["warning", t("chk.lightTransparent")];
        else if (!a.transparent) r = ["success", t("chk.ownBg")];
        else r = ["info", t("chk.mid")];
        const sharp = img.naturalWidth >= logo.width * 2;
        r[1] += ` · ${img.naturalWidth}×${img.naturalHeight}px` + (sharp ? "" : " · " + t("chk.small", { px: logo.width * 2 }));
        if (!sharp && r[0] === "success") r[0] = "warning";
        if (!off) setInfo(r);
      } catch {
        if (!off) setInfo(["danger", t("chk.loadErr")]);
      }
    })();
    if (embed) setPub(["success", t("chk.embedded")]);
    else {
      const img = new Image();
      img.onload = () => !off && setPub(["success", t("chk.public")]);
      img.onerror = () => !off && setPub(["danger", t("chk.notPublic") + logo.url]);
      img.src = logo.url + (logo.url.includes("?") ? "&" : "?") + "check=" + Date.now();
    }
    return () => { off = true; };
  }, [logo.url, logo.protect, logo.width, embed, t]);

  return (
    <div className="space-y-2 mb-3">
      {info && <div className={"alert alert-" + (info[0] || "info")}>{info[1]}</div>}
      {pub && <div className={"alert alert-" + pub[0]}>{pub[1]}</div>}
    </div>
  );
}
