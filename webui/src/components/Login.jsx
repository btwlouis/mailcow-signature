import { useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "./ui.jsx";

export default function Login({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      await api("POST", "/api/login", { password: pw });
      onLogin();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <div className="card-header">
          <span className="w-6 h-6 rounded bg-mc-cow text-[#5a4300] grid place-items-center"><Icon name="envelope" size={12} /></span>
          mailcow Signaturen
        </div>
        <div className="card-body space-y-3">
          <div>
            <label className="form-label" htmlFor="pw">Passwort</label>
            <input id="pw" type="password" autoFocus className="form-control" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </div>
          {err && <div className="alert alert-danger">{err}</div>}
          <button className="btn btn-primary w-full">Anmelden</button>
        </div>
      </form>
    </div>
  );
}
