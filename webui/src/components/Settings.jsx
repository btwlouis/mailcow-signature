import { useState } from "react";
import { useStore } from "../App.jsx";
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
  const { S, mutate } = useStore();
  const c = S.config;
  const set = (k, v) => mutate((n) => { n.config[k] = v; }, { config: true });
  return (
    <div>
      <h1 className="text-[20px] font-semibold mb-3">Einstellungen</h1>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card title="Allgemein">
          <Switch label="Signaturen aktiv" checked={c.enabled ?? true} onChange={(v) => set("enabled", v)} />
          <Switch label="Testmodus" hint="Nur loggen, nichts einfügen" checked={c.dry_run} onChange={(v) => set("dry_run", v)} />
          {c.dry_run && <div className="pl-12 pt-2"><ListField label="Live-Tester" field="live_senders" placeholder="du@firma.de" /></div>}
          <Switch label="Kalendereinladungen auslassen" checked={c.skip_calendar ?? true} onChange={(v) => set("skip_calendar", v)} />
          <Switch label="Nur angemeldete Absender" checked={c.require_auth ?? true} onChange={(v) => set("require_auth", v)} />
          <Switch label="Interne Mails auslassen" checked={c.skip_internal} onChange={(v) => set("skip_internal", v)} />
          <div className="pt-3">
            <div className="font-semibold mb-1.5">Logo</div>
            <Seg value={c.logo_mode || "link"} onChange={(v) => set("logo_mode", v)} size=""
              options={[["link", "Verlinkt", "Klein; klassisches Outlook fragt bei externen Absendern"], ["embed", "Eingebettet", "Überall sofort sichtbar; Mail hat Büroklammer"]]} />
          </div>
        </Card>
        <Card title="Listen">
          <ListField label="Ausgenommene Absender" field="exclude_senders" placeholder="noreply@firma.de" />
          <ListField label="Interne Domains" field="internal_domains" placeholder="firma.de" />
          <ListField label="Vertrauenswürdige Netze" field="trusted_networks" placeholder="172.22.1.0/24" />
        </Card>
      </div>
    </div>
  );
}
