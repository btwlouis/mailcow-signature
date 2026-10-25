import { useStore } from "../App.jsx";
import { isDomain, usersOf } from "../lib/template.js";
import { Icon, Tabs } from "./ui.jsx";
import SignatureTab from "./SignatureTab.jsx";
import VarsTab from "./VarsTab.jsx";
import UsersTab from "./UsersTab.jsx";

export default function LevelPage() {
  const { S, mutate, nav, setNav } = useStore();
  const lvl = nav.level, person = lvl.includes("@"), dom = isDomain(lvl);
  const tabs = person ? [["sig", "Signatur"]] : [["sig", "Signatur"], ["vars", "Firmendaten"]];
  if (dom) tabs.push(["users", `Personen (${usersOf(S, lvl).length})`]);
  const tab = tabs.find((t) => t[0] === nav.tab) ? nav.tab : "sig";

  const removeDomain = () => {
    if (!confirm(`Domain ${lvl} entfernen? Signatur und Firmendaten dieser Domain werden gelöscht.`)) return;
    mutate((n) => {
      n.config.domains = (n.config.domains || []).filter((d) => d !== lvl);
      if (n.config.vars) delete n.config.vars[lvl];
    }, { config: true });
    if (S.templates[lvl]) mutate((n) => { delete n.templates[lvl]; }, { del: lvl });
    setNav({ page: "level", level: "default", tab: "sig" });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-[20px] font-semibold">{lvl === "default" ? "Standard-Signatur" : person ? lvl : lvl}</h1>
        {person && <button className="btn btn-sm btn-default" onClick={() => setNav({ page: "level", level: lvl.split("@")[1], tab: "users" })}>← {lvl.split("@")[1]}</button>}
        <div className="flex-1" />
        {dom && <button className="btn btn-sm btn-danger" onClick={removeDomain}><Icon name="trash" /> Domain entfernen</button>}
      </div>
      <Tabs value={tab} tabs={tabs} onChange={(t) => setNav({ ...nav, tab: t })} />
      {tab === "sig" && <SignatureTab level={lvl} />}
      {tab === "vars" && <VarsTab level={lvl} />}
      {tab === "users" && <UsersTab domain={lvl} />}
    </div>
  );
}
