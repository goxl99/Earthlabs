"use client";
import { useEffect, useState } from "react";
import { subscribe, checkFields, type DialogReq } from "@/lib/dialog";

/** Mounted once in the layout. Shows one dialog at a time in the prototype's modal style. */
export default function DialogHost() {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  useEffect(() => subscribe((r) => setQueue((q) => [...q, r])), []);
  const cur = queue[0];
  useEffect(() => {
    if (cur?.kind === "form") { const v: Record<string, string> = {}; cur.fields.forEach((f) => (v[f.name] = f.value != null ? String(f.value) : f.type === "select" ? f.options?.[0] ?? "" : "")); setVals(v); setErr(""); }
  }, [cur]);
  if (!cur) return null;
  const close = () => setQueue((q) => q.slice(1));
  const cancel = () => { if (cur.kind === "form") cur.resolve(null); else cur.resolve(); close(); };
  const submit = () => {
    if (cur.kind !== "form") { cur.resolve(); close(); return; }
    const e = checkFields(cur.fields, vals); if (e) { setErr(e); return; }
    cur.resolve(vals); close();
  };
  return (
    <div className="mod-bg" role="dialog" aria-modal="true" aria-label={cur.title} onKeyDown={(e) => e.key === "Escape" && cancel()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <header><h3 style={{ margin: 0, flex: 1 }}>{cur.title}</h3><button className="btn sm" aria-label="Close" onClick={cancel}>×</button></header>
        <div className="body">
          {cur.kind === "notice" ? <p>{cur.text}</p> : <>
            {cur.intro && <p>{cur.intro}</p>}
            {cur.fields.map((f, i) => (
              <div className="field" key={f.name}><label htmlFor={`dlg-${f.name}`}>{f.label}{f.required ? " *" : ""}</label>
                {f.type === "textarea" ? <textarea id={`dlg-${f.name}`} rows={3} autoFocus={i === 0} value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
                  : f.type === "select" ? <select id={`dlg-${f.name}`} value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
                  : <input id={`dlg-${f.name}`} autoFocus={i === 0} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={f.min} max={f.max} step="any" value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />}
                {f.hint && <small>{f.hint}</small>}</div>))}
            {err && <div className="note bad" role="alert">{err}</div>}
          </>}
        </div>
        <footer>{cur.kind === "form" && <button className="btn" onClick={cancel}>Cancel</button>}
          <button className={`btn ${cur.kind === "form" && cur.danger ? "red" : "pri"}`} onClick={submit}>{cur.kind === "form" ? cur.ok : "OK"}</button></footer>
      </div>
    </div>);
}
