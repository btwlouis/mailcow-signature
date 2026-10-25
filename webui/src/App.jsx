import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, AuthError } from "./lib/api.js";
import { effectiveTemplates, migrate, pendingSync } from "./lib/sync.js";
import { Icon, Toast } from "./components/ui.jsx";
import Login from "./components/Login.jsx";
import DomainPage from "./components/DomainPage.jsx";
import SignaturesPage from "./components/SignaturesPage.jsx";
import SignatureEditor from "./components/SignatureEditor.jsx";
import Settings from "./components/Settings.jsx";

const Store = createContext(null);
export const useStore = () => useContext(Store);

const CLEAN = { config: false, users: false, library: false };

export default function App() {
  const [auth, setAuth] = useState(null);
  const [S, setS] = useState(null);
  const [dirty, setDirty] = useState(CLEAN);
  const [nav, setNav] = useState({ page: "signatures" });
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
      s.config ||= {}; s.users ||= {}; s.templates ||= {}; s.assets ||= []; s.library ||= {};
      s.config.signatures ||= {};
      const migrated = migrate(s);
      setS(s);
      setDirty(migrated ? { ...CLEAN, config: true, library: true } : CLEAN);
      setAuth(true);
    } catch (e) {
      if (e instanceof AuthError) setAuth(false); else notify(e.message, true);
    }
  }, [notify]);

  useEffect(() => {
    fetch("/api/session").then((r) => r.json()).then((s) => (s.authenticated ? load() : setAuth(false))).catch(() => setAuth(false));
  }, [load]);

  // mutate(fn, {config, users, library})
  const mutate = useCallback((fn, mark = {}) => {
    setS((prev) => { const next = structuredClone(prev); fn(next); return next; });
    setDirty((d) => ({ config: d.config || !!mark.config, users: d.users || !!mark.users, library: d.library || !!mark.library }));
  }, []);

  const sync = useMemo(() => (S ? pendingSync(S) : { put: {}, del: [] }), [S]);
  const T = useMemo(() => (S ? effectiveTemplates(S) : {}), [S]);
  const isDirty = dirty.config || dirty.users || dirty.library || Object.keys(sync.put).length > 0 || sync.del.length > 0;

  const save = useCallback(async () => {
    setSaving(true);
    try {
      if (dirty.library) await api("PUT", "/api/library", S.library);
      if (dirty.config) await api("PUT", "/api/config", S.config);
      if (dirty.users) await api("PUT", "/api/users", S.users);
      for (const l of sync.del) await api("DELETE", "/api/templates/" + encodeURIComponent(l));
      for (const [l, t] of Object.entries(sync.put)) await api("PUT", "/api/templates/" + encodeURIComponent(l), t);
      setS((prev) => ({ ...prev, templates: effectiveTemplates(prev), _delete: [] }));
      setDirty(CLEAN);
      notify("Gespeichert – aktiv in spätestens 60 Sekunden");
    } catch (e) {
      notify("Fehler: " + e.message, true);
    }
    setSaving(false);
  }, [S, dirty, sync, notify]);

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

  const store = { S, T, mutate, notify, nav, setNav, load, isDirty };
  return (
    <Store.Provider value={store}>
      <Navbar isDirty={isDirty} saving={saving} onSave={save} onLogout={async () => { await api("POST", "/api/logout").catch(() => {}); setAuth(false); }} />
      <div className="max-w-[1440px] mx-auto px-4 py-4">
        {nav.page === "signatures" && <SignaturesPage />}
        {nav.page === "sig" && <SignatureEditor key={nav.id} id={nav.id} />}
        {nav.page === "domains" && <DomainPage />}
        {nav.page === "settings" && <Settings />}
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
  const Tab = ({ page, icon, label, match = [page] }) => (
    <button className={"btn btn-sm " + (match.includes(nav.page) ? "btn-active" : "btn-default")} onClick={() => setNav({ page, level: nav.level || "default", tab: "sig" })}>
      <Icon name={icon} /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
  return (
    <nav className="sticky top-0 z-20 bg-[#f6f6f6] border-b border-mc-border dark:bg-mc-d-surface dark:border-mc-d-border">
      <div className="max-w-[1440px] mx-auto px-4 h-[52px] flex items-center gap-2">
        <div className="flex items-center gap-2 font-bold text-[15px] mr-2">
          <span className="w-7 h-7 rounded bg-mc-cow text-[#5a4300] grid place-items-center"><Icon name="envelope" /></span>
          <span className="hidden md:inline">mailcow <span className="font-normal muted">Signaturen</span></span>
        </div>
        <Tab page="signatures" icon="pen" label="Signaturen" match={["signatures", "sig"]} />
        <Tab page="domains" icon="globe" label="Domains" />
        <Tab page="settings" icon="gear" label="Einstellungen" />
        <span className={`badge text-white ml-1 ${status[1]}`}>{status[0]}</span>
        <div className="flex-1" />
        <button className="btn btn-sm btn-success" disabled={!isDirty || saving} onClick={onSave} title="Strg+S">
          <Icon name="save" /> {saving ? "Speichert …" : "Speichern"}{isDirty && !saving ? " •" : ""}
        </button>
        <button className="btn btn-sm btn-default" onClick={onLogout} title="Abmelden"><Icon name="power" /></button>
      </div>
    </nav>
  );
}
