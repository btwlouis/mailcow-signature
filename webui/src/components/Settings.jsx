import { useState } from "react";
import { useStore } from "../App.jsx";
import { LANGS } from "../lib/i18n.js";
import { Card, Seg, Switch } from "./ui.jsx";

function ListField({ label, field, placeholder }) {
  const { S, mutate } = useStore();
  const [text, setText] = useState((S.config[field] || []).join("\n"));
  return (
    <div className="mb-3">
      <label className="form-label">{label}</label>
      <textarea className="form-control font-mono text-[12.5px]" rows={3} placeholder={placeholder} value={text}
        onChange={(e) => {
          setText(e.target.value);
          const list = e.target.value.split("\n").map((x) => x.trim().toLowerCase()).filter(Boolean);
          mutate((n) => { n.config[field] = list; }, { config: true });
        }} />
    </div>
  );
}

export default function Settings() {
  const { S, mutate, t, lang, setLang, startOnboarding } = useStore();
  const c = S.config;
  const set = (k, v) => mutate((n) => { n.config[k] = v; }, { config: true });
  return (
    <div>
      <h1 className="text-[20px] font-semibold mb-3">{t("set.title")}</h1>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card title={t("set.general")}>
          <Switch label={t("set.enabled")} checked={c.enabled ?? true} onChange={(v) => set("enabled", v)} />
          <Switch label={t("set.dry")} hint={t("set.dryHint")} checked={c.dry_run} onChange={(v) => set("dry_run", v)} />
          {c.dry_run && <div className="pl-12 pt-2"><ListField label={t("set.live")} field="live_senders" placeholder="you@company.com" /></div>}
          <Switch label={t("set.calendar")} checked={c.skip_calendar ?? true} onChange={(v) => set("skip_calendar", v)} />
          <Switch label={t("set.auth")} checked={c.require_auth ?? true} onChange={(v) => set("require_auth", v)} />
          <Switch label={t("set.internal")} checked={c.skip_internal} onChange={(v) => set("skip_internal", v)} />
          <div className="pt-3">
            <div className="font-semibold mb-1.5">{t("set.logo")}</div>
            <Seg value={c.logo_mode || "link"} onChange={(v) => set("logo_mode", v)} size=""
              options={[["link", t("set.linked"), t("set.linkedTip")], ["embed", t("set.embedded"), t("set.embeddedTip")]]} />
          </div>
        </Card>
        <div className="space-y-4">
          <Card title={t("set.lists")}>
            <ListField label={t("set.exclude")} field="exclude_senders" placeholder="noreply@company.com" />
            <ListField label={t("set.internalDomains")} field="internal_domains" placeholder="company.com" />
            <ListField label={t("set.trusted")} field="trusted_networks" placeholder="172.22.1.0/24" />
          </Card>
          <Card title={t("set.language")}>
            <div className="flex flex-wrap items-center gap-3">
              <Seg value={lang} onChange={setLang} size="" options={LANGS} />
              <button className="btn btn-default" onClick={startOnboarding}>{t("set.onboarding")}</button>
            </div>
          </Card>
          <div className="text-[12px] muted text-right">
            mailcow-signature {S.version ? "v" + S.version : ""} · <a href="https://github.com/btwlouis/mailcow-signature" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </div>
    </div>
  );
}
