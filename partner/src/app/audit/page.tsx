"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { when } from "@/components/ui";
import { changedFields } from "@/lib/audit";

type Row = { id: number; at: string; actor_role: string | null; action: string; table_name: string; row_key: string | null; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null };
const PAGE = 50;

function Inner() {
  const [rows, setRows] = useState<Row[]>([]); const [table, setTable] = useState(""); const [key, setKey] = useState(""); const [page, setPage] = useState(0); const [open, setOpen] = useState<number | null>(null); const [more, setMore] = useState(false);
  const load = useCallback(async () => {
    let q = supabase.from("audit_log").select("id,at,actor_role,action,table_name,row_key,old_row,new_row").order("id", { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
    if (table) q = q.eq("table_name", table); if (key) q = q.eq("row_key", key);
    const d = ((await q).data as Row[]) ?? []; setMore(d.length > PAGE); setRows(d.slice(0, PAGE));
  }, [table, key, page]);
  useEffect(() => { load(); }, [load]);
  return (<><h1>Audit trail</h1><p className="sub">Every important change is recorded with who, when, what and the detail. Entries cannot be edited.</p><p>Every change to partners, orders, payments, prices and settings. Entries cannot be edited or deleted.</p>
    <p><input aria-label="Table" placeholder="Table, e.g. orders" value={table} onChange={(e) => { setTable(e.target.value.trim()); setPage(0); }} style={{ maxWidth: 220, marginRight: 8 }} />
      <input aria-label="Record" placeholder="Record, e.g. ORD-000001" value={key} onChange={(e) => { setKey(e.target.value.trim()); setPage(0); }} style={{ maxWidth: 220 }} /></p>
    <div className="card"><table><thead><tr><th>When</th><th>By</th><th>Action</th><th>Table</th><th>Record</th><th>Changed</th></tr></thead><tbody>
      {rows.map((r) => (<><tr key={r.id}><td>{when(r.at)}</td><td>{r.actor_role ?? "system"}</td><td>{r.action}</td><td>{r.table_name}</td><td><a href="#" onClick={(e) => { e.preventDefault(); setOpen(open === r.id ? null : r.id); }}>{r.row_key}</a></td><td>{r.action === "UPDATE" ? changedFields(r.old_row, r.new_row).join(", ") : ""}</td></tr>
        {open === r.id && <tr key={r.id + "d"}><td colSpan={6}><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>{JSON.stringify({ before: r.old_row, after: r.new_row }, null, 2)}</pre></td></tr>}</>))}
      {rows.length === 0 && <tr><td colSpan={6}>Nothing found.</td></tr>}</tbody></table>
      <p><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button> <button className="btn" disabled={!more} onClick={() => setPage(page + 1)}>Older</button></p></div></>);
}
export default function Page() { return <Shell page="audit">{() => <Inner />}</Shell>; }
