import { Fragment, useState } from "react";
import { useStore } from "../App.jsx";
import { STD_FIELDS, usersOf } from "../lib/template.js";
import { Card, Icon } from "./ui.jsx";
import { KvEditor } from "./VarsTab.jsx";
import { SignatureSelect } from "./DomainPage.jsx";

const LABELS = { DisplayName: "Name", Title: "Position", Department: "Abteilung", Phone: "Telefon", Mobile: "Mobil" };

export default function UsersTab({ domain }) {
  const { S, mutate, notify } = useStore();
  const [local, setLocal] = useState("");
  const [open, setOpen] = useState("");
  const list = usersOf(S, domain);

  const add = (e) => {
    e.preventDefault();
    const l = local.trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+$/.test(l)) return notify("Nur den Teil vor dem @ eingeben", true);
    mutate((n) => { n.users[l + "@" + domain] ||= {}; }, { users: true });
    setLocal("");
  };
  const setField = (a, f, v) => mutate((n) => {
    n.users[a] ||= {};
    if (v === "") delete n.users[a][f]; else n.users[a][f] = v;
  }, { users: true });

  return (
    <Card bodyClass="" title={
      <form onSubmit={add} className="flex items-center gap-2 font-normal">
        <input className="form-control h-[28px] w-44" placeholder="vorname.nachname" value={local} onChange={(e) => setLocal(e.target.value)} />
        <span className="muted">@{domain}</span>
        <button className="btn btn-sm btn-primary"><Icon name="plus" /> Person</button>
      </form>
    }>
      {list.length === 0 ? (
        <div className="card-body muted">Keine Personen – ohne Eintrag wird der Name aus der Mail verwendet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-mc">
            <thead><tr><th>Adresse</th>{STD_FIELDS.map((f) => <th key={f}>{LABELS[f]}</th>)}<th>Signatur</th><th /></tr></thead>
            <tbody>
              {list.map((a) => {
                const u = S.users[a] || {};
                const extra = Object.fromEntries(Object.entries(u).filter(([k]) => !STD_FIELDS.includes(k) && k !== "DisplayNameLocked"));
                return (
                  <Fragment key={a}>
                    <tr>
                      <td className="font-mono text-[12.5px]">{a.split("@")[0]}</td>
                      {STD_FIELDS.map((f) => (
                        <td key={f}><input className="form-control h-[30px] min-w-[110px]" value={u[f] || ""} onChange={(e) => setField(a, f, e.target.value)} /></td>
                      ))}
                      <td><SignatureSelect level={a} compact /></td>
                      <td className="whitespace-nowrap">
                        <button className="btn btn-sm btn-default px-2" title="Weitere Felder" onClick={() => setOpen(open === a ? "" : a)}><Icon name="more" /></button>{" "}
                        <button className="btn btn-sm btn-default px-2" title="Entfernen" onClick={() => {
                          if (confirm(`${a} entfernen?`)) mutate((n) => { delete n.users[a]; }, { users: true });
                        }}><Icon name="trash" /></button>
                      </td>
                    </tr>
                    {open === a && (
                      <tr className="bg-mc-alt dark:bg-mc-d-alt">
                        <td colSpan={STD_FIELDS.length + 3}>
                          <div className="max-w-3xl py-2 space-y-3">
                            <KvEditor key={a} initial={extra} onChange={(obj) => mutate((n) => {
                              const keep = Object.fromEntries(Object.entries(n.users[a] || {}).filter(([k]) => STD_FIELDS.includes(k) || k === "DisplayNameLocked"));
                              n.users[a] = { ...keep, ...obj };
                            }, { users: true })} />
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-2 text-[13px]">
                                <input type="checkbox" className="accent-mc-primary" checked={!!u.DisplayNameLocked}
                                  onChange={(e) => setField(a, "DisplayNameLocked", e.target.checked ? true : "")} />
                                Namen nicht aus mailcow überschreiben
                              </label>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
