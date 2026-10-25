import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, AuthError } from "./lib/api.js";
import { domains, hasOwn } from "./lib/template.js";
import { Icon, Toast } from "./components/ui.jsx";
import Login from "./components/Login.jsx";
import LevelPage from "./components/LevelPage.jsx";
import Settings from "./components/Settings.jsx";

const Store = createContext(null);
export const useStore = () => useContext(Store);

const CLEAN = { config: false, users: false, tpl: [], del: [] };

export default function App() {
  const [auth, setAuth] = useState(null);
  const [S, setS] = useState(null);
  const [dirty, setDirty] = useState(CLEAN);
  const [nav, setNav] = useState({ page: "level", level: "default", tab: "sig" });
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef();

  const notify = useCallback((msg, err) => {
    setToast({ msg, err });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const s = await api("GET", "/api/state");
      s.config ||= {}; s.users ||= {}; s.templates ||= {}; s.assets ||= [];
      setS(s); setDirty(CLEAN); setAuth(true);
    } catch (e) {
      if (e instanceof AuthError) setAuth(false); else notify(e.message, true);
    }
  }, [notify]);

  useEffect(() => {
    fetch("/api/session").then((r) => r.json()).then((s) => (s.authenticated ? load() : setAuth(false))).catch(() => setAuth(false));
  }, [load]);

  // mutate(fn, {config|users: true} | {tpl: level} | {del: level})
  const mutate = useCallback((fn, mark = {}) => {
    setS((prev) => { const next = structuredClone(prev); fn(next); return next; });
    setDirty((d) => ({
      config: d.config || !!mark.config,
      users: d.users || !!mark.users,
      tpl: mark.tpl && !d.tpl.includes(mark.tpl) ? [...d.tpl, mark.tpl] : mark.del ? d.tpl.filter((l) => l !== mark.del) : d.tpl,
      del: mark.del && !d.del.includes(mark.del) ? [...d.del, mark.del] : mark.tpl ? d.del.filter((l) => l !== mark.tpl) : d.del,
    }));
  }, []);

  const isDirty = dirty.config || dirty.users || dirty.tpl.length > 0 || dirty.del.length > 0;

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (dirty.config) await api("PUT", "/api/config", S.config);
      if (dirty.users) await api("PUT", "/api/users", S.users);
      for (const l of dirty.del) await api("DELETE", "/api/templates/" + encodeURIComponent(l));
      for (const l of dirty.tpl) if (S.templates[l]) await api("PUT", "/api/templates/" + encodeURIComponent(l), S.templates[l]);
      setDirty(CLEAN);
      notify("Gespeichert – aktiv in spätestens 60 Sekunden");
    } catch (e) {
      notify("Fehler: " + e.message, true);
    }
    setSaving(false);
  }, [S, dirty, notify]);

  useEffect(() => {
    const key = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (isDirty) save(); } };
    const leave = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("beforeunload", leave); };
  }, [isDirty, save]);

  if (auth === null) return null;
  if (!auth) return <Login onLogin={load} />;
  if (!S) return null;

  const store = { S, mutate, notify, nav, setNav, load, isDirty };
  return (
    <Store.Provider value={store}>
      <Navbar isDirty={isDirty} saving={saving} onSave={save} onLogout={async () => { await api("POST", "/api/logout").catch(() => {}); setAuth(false); }} />
      <div className="max-w-[1440px] mx-auto px-4 py-4 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <DomainList />
        <main className="min-w-0">{nav.page === "settings" ? <Settings /> : <LevelPage key={nav.level} />}</main>
      </div>
      <Toast toast={toast} />
    </Store.Provider>
  );
}

function Navbar({ isDirty, saving, onSave, onLogout }) {
  const { S, nav, setNav } = useStore();
  const c = S.config;
  const status = c.enabled === false ? ["Deaktiviert", "bg-mc-danger"]
    : c.dry_run ? [(c.live_senders || []).length ? `Testmodus · ${c.live_senders.length} Live-Tester` : "Testmodus", "bg-mc-warning"]
    : ["Aktiv", "bg-mc-success"];
  return (
    <nav className="sticky top-0 z-20 bg-[#f6f6f6] border-b border-mc-border dark:bg-mc-d-surface dark:border-mc-d-border">
      <div className="max-w-[1440px] mx-auto px-4 h-[52px] flex items-center gap-3">
        <button className="flex items-center gap-2 font-bold text-[15px]" onClick={() => setNav({ page: "level", level: "default", tab: "sig" })}>
          <span className="w-7 h-7 rounded bg-mc-cow text-[#5a4300] grid place-items-center"><Icon name="envelope" /></span>
          <span>mailcow <span className="font-normal muted">Signaturen</span></span>
        </button>
        <span className={`badge text-white ${status[1]}`}>{status[0]}</span>
        <div className="flex-1" />
        <button className={"btn btn-sm " + (nav.page === "settings" ? "btn-active" : "btn-default")} onClick={() => setNav({ ...nav, page: "settings" })}>
          <Icon name="gear" /> <span className="hidden sm:inline">Einstellungen</span>
        </button>
        <button className="btn btn-sm btn-success" disabled={!isDirty || saving} onClick={onSave} title="Strg+S">
          <Icon name="save" /> {saving ? "Speichert …" : "Speichern"}{isDirty && !saving ? " •" : ""}
        </button>
        <button className="btn btn-sm btn-default" onClick={onLogout} title="Abmelden"><Icon name="power" /></button>
      </div>
    </nav>
  );
}

function DomainList() {
  const { S, mutate, nav, setNav, notify, load, isDirty } = useStore();
  const [newDomain, setNewDomain] = useState("");
  const go = (level) => setNav({ page: "level", level, tab: "sig" });
  const active = (l) => nav.page === "level" && nav.level === l;
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
  const Item = ({ level, icon, label, meta }) => (
    <button className={"mc-item " + (active(level) ? "mc-item-active" : "")} onClick={() => go(level)}>
      <Icon name={icon} /> <span className="truncate">{label}</span>
      {meta && <span className={"ml-auto text-[11px] " + (active(level) ? "text-white/80" : "muted")}>{meta}</span>}
    </button>
  );
  return (
    <aside className="space-y-4">
      <div className="card overflow-hidden">
        <div className="card-header">Signaturen</div>
        <Item level="default" icon="star" label="Standard" meta="alle" />
        {domains(S).map((d) => <Item key={d} level={d} icon="globe" label={d} meta={hasOwn(S, d) ? "eigene" : ""} />)}
        <form onSubmit={add} className="flex gap-2 p-2 border-t border-mc-border dark:border-mc-d-border">
          <input className="form-control h-[28px]" placeholder="domain.de" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
          <button className="btn btn-sm btn-default" title="Domain hinzufügen"><Icon name="plus" /></button>
        </form>
      </div>
      {S.sync_available && (
        <button className="btn btn-default w-full" onClick={sync}><Icon name="sync" /> Aus mailcow übernehmen</button>
      )}
    </aside>
  );
}
