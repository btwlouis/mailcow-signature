import { useState } from "react";
import { useStore } from "../App.jsx";
import { normalizeDesign, presetList } from "../lib/design.js";
import { LANGS } from "../lib/i18n.js";
import { newId } from "../lib/sync.js";
import { LogoEditor } from "./SignatureEditor.jsx";
import { PresetPicker, Thumb } from "./SignaturesPage.jsx";
import { Icon, Seg } from "./ui.jsx";

const COMPANY_FIELDS = [["Company", "ob.f.company"], ["Street", "ob.f.street"], ["City", "ob.f.city"], ["Phone", "ob.f.phone"], ["Website", "ob.f.website"], ["Legal", "ob.f.legal"]];

// Ersteinrichtung: Sprache → Firmendaten → Logo → Layout → fertig (Testmodus an, optional Live-Tester)
export default function Onboarding({ onClose }) {
  const { S, mutate, save, t, lang, setLang } = useStore();
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState(() => ({ ...((S.config.vars || {})["*"] || {}) }));
  const [logo, setLogo] = useState({ url: "", width: 140, alt: "", dark: "", protect: "" });
  const [preset, setPreset] = useState("classic");
  const [tester, setTester] = useState("");
  const [busy, setBusy] = useState(false);
  const steps = 5;

  const design = () => {
    const p = presetList(lang).find((x) => x.id === preset);
    const d = normalizeDesign(structuredClone(p.design));
    if (logo.url) d.logo = { ...d.logo, ...logo, alt: logo.alt || company.Company || "" };
    return d;
  };

  // Alles in einem Rutsch speichern; ohne Signatur nur "onboarded" merken
  const finish = async (create) => {
    setBusy(true);
    const next = structuredClone(S);
    next.config.onboarded = true;
    next.config.ui_language = lang;
    if (create) {
      const id = newId();
      next.config.vars ||= {};
      next.config.vars["*"] = { ...(next.config.vars["*"] || {}), ...Object.fromEntries(Object.entries(company).filter(([, v]) => v !== "")) };
      next.library[id] = { name: t("ob.sigName"), design: design() };
      next.config.signatures = { ...(next.config.signatures || {}), default: id };
      if (!("dry_run" in next.config)) next.config.dry_run = true;
      const addr = tester.trim().toLowerCase();
      if (addr && /^[^@\s]+@[^@\s]+$/.test(addr)) next.config.live_senders = [...new Set([...(next.config.live_senders || []), addr])];
    }
    mutate((n) => Object.assign(n, next));
    const ok = await save(next);
    setBusy(false);
    if (ok) onClose();
  };

  const Field = ([key, label]) => (
    <label key={key} className={key === "Legal" ? "sm:col-span-2" : ""}>
      <span className="form-label">{t(label)}</span>
      <input className="form-control" value={company[key] || ""} onChange={(e) => setCompany({ ...company, [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/50 grid place-items-center p-4 overflow-auto">
      <div className="card w-full max-w-3xl shadow-2xl">
        <div className="card-header">
          <span className="w-6 h-6 rounded bg-mc-cow text-[#5a4300] grid place-items-center"><Icon name="envelope" size={12} /></span>
          {t("ob.welcome")}
          <span className="ml-auto font-normal text-[12px] muted">{t("ob.step", { n: step + 1, m: steps })}</span>
        </div>
        <div className="h-1 bg-mc-alt dark:bg-mc-d-alt"><div className="h-1 bg-mc-primary transition-all" style={{ width: `${((step + 1) / steps) * 100}%` }} /></div>

        <div className="card-body min-h-[320px]">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-[15px]">{t("ob.intro")}</p>
              <div>
                <div className="form-label">{t("ob.lang")}</div>
                <Seg value={lang} onChange={setLang} size="" options={LANGS} />
              </div>
            </div>
          )}
          {step === 1 && (
            <div>
              <h2 className="text-[16px] font-semibold">{t("ob.company")}</h2>
              <p className="muted text-[13px] mb-3">{t("ob.companyHint")}</p>
              <div className="grid sm:grid-cols-2 gap-3">{COMPANY_FIELDS.map(Field)}</div>
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 className="text-[16px] font-semibold">{t("ob.logo")}</h2>
              <p className="muted text-[13px] mb-3">{t("ob.logoHint")}</p>
              <LogoEditor compact logo={logo} onChange={(fn) => setLogo((l) => { const n = { ...l }; fn(n); return n; })} />
            </div>
          )}
          {step === 3 && (
            <div>
              <h2 className="text-[16px] font-semibold mb-3">{t("ob.layout")}</h2>
              <PresetPicker selected={preset} logoUrl={logo.url} onPick={(p) => setPreset(p.id)} />
            </div>
          )}
          {step === 4 && (
            <div className="grid md:grid-cols-2 gap-5 items-start">
              <div className="space-y-3">
                <h2 className="text-[18px] font-semibold">🎉 {t("ob.done")}</h2>
                <p className="text-[13.5px]">{t("ob.doneText")}</p>
                <label className="block">
                  <span className="form-label">{t("ob.liveHint")}</span>
                  <input className="form-control" placeholder="you@company.com" value={tester} onChange={(e) => setTester(e.target.value)} />
                </label>
              </div>
              <div className="card overflow-hidden"><Thumb design={design()} height={190} /></div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-mc-border bg-mc-alt dark:bg-mc-d-alt dark:border-mc-d-border rounded-b">
          <button className="btn btn-default" disabled={busy} onClick={() => finish(false)}>{t("ob.skip")}</button>
          <div className="flex-1" />
          {step > 0 && <button className="btn btn-default" onClick={() => setStep(step - 1)}>{t("ob.back")}</button>}
          {step < steps - 1
            ? <button className="btn btn-primary" onClick={() => {
                // Firmendaten sofort übernehmen, damit die Layout-Vorschauen sie zeigen
                if (step === 1) mutate((n) => {
                  n.config.vars ||= {};
                  n.config.vars["*"] = { ...(n.config.vars["*"] || {}), ...Object.fromEntries(Object.entries(company).filter(([, v]) => v !== "")) };
                }, { config: true });
                setStep(step + 1);
              }}>{t("ob.next")}</button>
            : <button className="btn btn-success" disabled={busy} onClick={() => finish(true)}>{busy ? t("saving") : t("ob.finish")}</button>}
        </div>
      </div>
    </div>
  );
}
