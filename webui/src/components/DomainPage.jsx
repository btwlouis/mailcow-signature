import { useState } from "react";
import { useStore } from "../App.jsx";
import { api } from "../lib/api.js";
import { sigOf } from "../lib/design.js";
import { domains, isDomain, usersOf } from "../lib/template.js";
import Preview from "./Preview.jsx";
import UsersTab from "./UsersTab.jsx";
import VarsTab from "./VarsTab.jsx";
import { Card, Icon, Tabs } from "./ui.jsx";

// Auswahl, welche Signatur für eine Ebene (default, Domain, Person) gilt
export function SignatureSelect({ level, compact }) {
  const { S, mutate } = useStore();
  const current = (S.config.signatures || {})[level] || "";
  const manual = !current && S.templates[level] && !sigOf(S.templates[level]) &&
    (S.templates[level]["new.html"] != null || S.templates[level]["new.txt"] != null);
  const inherit = level === "default" ? "Keine" : level.includes("@") ? "wie Domain" : "Standard verwenden";
  return (
    <select className={"form-control " + (compact ? "h-[30px] min-w-[140px]" : "max-w-sm")} value={manual ? "__manual" : current}
      onChange={(e) => mutate((n) => {
        if (e.target.value === "__manual") return;
        if (e.target.value) n.config.signatures[level] = e.target.value; else delete n.config.signatures[level];
        // manuelles HTML verwerfen, wenn wieder geerbt werden soll
        if (!e.target.value && manual) { delete n.templates[level]; n._delete = [...(n._delete || []), level]; }
      }, { config: true })}>
      {manual && <option value="__manual">Eigenes HTML (manuell)</option>}
      <option value="">{inherit}</option>
      {Object.entries(S.library).map(([id, e]) => <option key={id} value={id}>{e.name}</option>)}
    </select>
  );
}

export default function DomainPage() {
  const { S, mutate, nav, setNav, notify, load, isDirty } = useStore();
  const [newDomain, setNewDomain] = useState("");
  const lvl = nav.level && !nav.level.includes("@") ? nav.level : "default";
  const dom = isDomain(lvl);
  const go = (level) => setNav({ page: "domains", level, tab: nav.tab || "sig" });

  const add = (e) => {
    e.preventDefault();
    const d = newDomain.trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return notify("Ungültige Domain", true);
    mutate((n) => { n.config.domains = [...new Set([...(n.config.domains || []), d])].sort(); }, { config: true });
    setNewDomain(""); go(d);
  };
  const sync = async () => {
    if (isDirty) return notify("Bitte erst speichern", true);
    try {
      const r = await api("POST", "/api/sync");
      notify(`${r.mailboxes} Postfächer · ${r.added} neu · ${(r.domains_added || []).length} neue Domains`);
      await load();
    } catch (e) { notify(e.message, true); }
  };
  const remove = () => {
    if (!confirm(`Domain ${lvl} entfernen?`)) return;
    mutate((n) => {
      n.config.domains = (n.config.domains || []).filter((d) => d !== lvl);
      if (n.config.vars) delete n.config.vars[lvl];
      delete n.config.signatures[lvl];
    }, { config: true });
    go("default");
  };

  const sigName = (level) => S.library[(S.config.signatures || {})[level]]?.name;
  const Item = ({ level, icon, label }) => {
    const active = level === lvl;
    const meta = sigName(level) || (level === "default" ? "–" : "");
    return (
      <button className={"mc-item " + (active ? "mc-item-active" : "")} onClick={() => go(level)}>
        <Icon name={icon} /> <span className="truncate">{label}</span>
        {meta && <span className={"ml-auto text-[11px] truncate max-w-[45%] " + (active ? "text-white/80" : "muted")}>{meta}</span>}
      </button>
    );
  };

  const tabs = [["sig", "Signatur"], ["vars", "Platzhalter"]];
  if (dom) tabs.push(["users", `Personen (${usersOf(S, lvl).length})`]);
  const tab = tabs.find((t) => t[0] === nav.tab) ? nav.tab : "sig";

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="card overflow-hidden">
          <div className="card-header">Domains</div>
          <Item level="default" icon="star" label="Standard" />
          {domains(S).map((d) => <Item key={d} level={d} icon="globe" label={d} />)}
          <form onSubmit={add} className="flex gap-2 p-2 border-t border-mc-border dark:border-mc-d-border">
            <input className="form-control h-[28px]" placeholder="domain.de" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
            <button className="btn btn-sm btn-default" title="Domain hinzufügen"><Icon name="plus" /></button>
          </form>
        </div>
        {S.sync_available && <button className="btn btn-default w-full" onClick={sync}><Icon name="sync" /> Aus mailcow übernehmen</button>}
      </aside>

      <main className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-[20px] font-semibold">{lvl === "default" ? "Standard" : lvl}</h1>
          <div className="flex-1" />
          {dom && <button className="btn btn-sm btn-danger" onClick={remove}><Icon name="trash" /> Entfernen</button>}
        </div>
        <Tabs value={tab} tabs={tabs} onChange={(t) => setNav({ ...nav, page: "domains", level: lvl, tab: t })} />
        {tab === "sig" && (
          <div className="grid gap-4 xl:grid-cols-2 items-start">
            <Card title="Signatur">
              <div className="flex flex-wrap items-center gap-2">
                <SignatureSelect level={lvl} />
                {sigName(lvl) && <button className="btn btn-sm btn-default" onClick={() => setNav({ page: "sig", id: S.config.signatures[lvl] })}><Icon name="pen" /> Bearbeiten</button>}
              </div>
              {Object.keys(S.library).length === 0 && (
                <div className="mt-3"><button className="btn btn-sm btn-primary" onClick={() => setNav({ page: "signatures" })}><Icon name="plus" /> Signatur erstellen</button></div>
              )}
            </Card>
            <Preview level={lvl} />
          </div>
        )}
        {tab === "vars" && <VarsTab key={lvl} level={lvl} />}
        {tab === "users" && <UsersTab domain={lvl} />}
      </main>
    </div>
  );
}
