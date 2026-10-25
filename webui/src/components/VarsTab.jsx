import { useState } from "react";
import { useStore } from "../App.jsx";
import { Card, Icon } from "./ui.jsx";

const rowsToObj = (rows) => Object.fromEntries(rows.filter(([k]) => /^\w+$/.test(k.trim())).map(([k, v]) => [k.trim(), v]));

// Schlüssel/Wert-Editor. Die Zeilen leben lokal, damit halb getippte Feldnamen nicht verschwinden;
// gültige Zeilen werden bei jeder Änderung als Objekt gemeldet.
export function KvEditor({ initial, onChange }) {
  const { t } = useStore();
  const [rows, setRows] = useState(() => Object.entries(initial || {}));
  const update = (r) => { setRows(r); onChange(rowsToObj(r)); };
  const set = (i, k, v) => update(rows.map((r, j) => (j === i ? [k, v] : r)));
  return (
    <div className="space-y-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,200px)_minmax(0,1fr)_34px] gap-2">
          <input className="form-control font-mono" value={k} placeholder={t("kv.field")} onChange={(e) => set(i, e.target.value, v)} />
          <input className="form-control" value={v} placeholder={t("kv.value")} onChange={(e) => set(i, k, e.target.value)} />
          <button className="btn btn-default px-0" title={t("remove")} onClick={() => update(rows.filter((_, j) => j !== i))}><Icon name="trash" /></button>
        </div>
      ))}
      <button className="btn btn-sm btn-default" onClick={() => setRows([...rows, ["", ""]])}><Icon name="plus" /> {t("kv.add")}</button>
    </div>
  );
}

export default function VarsTab({ level }) {
  const { S, mutate, t } = useStore();
  const key = level === "default" ? "*" : level;
  const inherited = level !== "default" ? Object.entries((S.config.vars || {})["*"] || {}) : [];
  return (
    <Card title={level === "default" ? t("vars.all") : t("vars.domain", { d: level })} className="max-w-3xl">
      <KvEditor key={key} initial={(S.config.vars || {})[key]}
        onChange={(obj) => mutate((n) => { n.config.vars ||= {}; n.config.vars[key] = obj; }, { config: true })} />
      {inherited.length > 0 && (
        <div className="mt-3 text-[12px] muted">{t("global")}: {inherited.map(([k, v]) => <span key={k} className="mr-2"><code>{k}</code>={v}</span>)}</div>
      )}
    </Card>
  );
}
