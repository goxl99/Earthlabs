"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";

type W = { id: string; application_id: string; ref_no: string; business_name: string; email: string; partner_id: string | null; kind: string; file_name: string; file_path: string | null; status: string; note: string | null; not_applicable: boolean; is_current: boolean; uploaded_at: string };
function Inner({ staff }: { staff: boolean }) {
  const [q, setQ] = useState(""); const [rows, setRows] = useState<W[]>([]); const [msg, setMsg] = useState(""); const [all, setAll] = useState(true);
  const load = useCallback(async () => { const { data, error } = await supabase.rpc("wallet_documents", { q }); if (error) setMsg(error.message); else setRows((data as W[]) ?? []); }, [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  async function view(d: W) { if (!d.file_path) return; const { data, error } = await supabase.storage.from("application-docs").createSignedUrl(d.file_path, 120); if (error || !data) return setMsg(error?.message ?? "Could not open"); window.open(data.signedUrl, "_blank"); }
  const shown = rows.filter((d) => all || d.is_current);
  return (<><h1>Document wallet</h1>
    <p>Every document a vendor or partner has ever uploaded is kept here, including files that were rejected or replaced, and “Not applicable” declarations. Staff can reuse a stored document on a new application from the application's Review panel.</p>
    {msg && <Msg>{msg}</Msg>}
    <div className="card"><input placeholder="Search business, e-mail, Partner ID, reference or document" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", maxWidth: 460 }} /> <label style={{ marginLeft: 12 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include replaced / older versions</label></div>
    <div className="card"><table><thead><tr><th>Business</th><th>Document</th><th>Status</th><th>Uploaded</th><th></th></tr></thead><tbody>
      {shown.map((d) => <tr key={d.id} style={d.is_current ? undefined : { opacity: 0.65 }}><td><b>{d.business_name}</b><div style={{ fontSize: 12 }}>{d.partner_id ?? d.ref_no}{staff ? ` · ${d.email}` : ""}</div></td>
        <td>{d.kind}<div style={{ fontSize: 12 }}>{d.not_applicable ? `Not applicable: ${d.note ?? ""}` : d.file_name}</div>{!d.not_applicable && d.note && <div style={{ fontSize: 12, color: "#9b3b2c" }}>{d.note}</div>}</td>
        <td>{d.not_applicable ? "Not applicable" : d.status}{!d.is_current && <div style={{ fontSize: 12 }}>older version</div>}</td><td>{when(d.uploaded_at)}</td>
        <td>{d.file_path && <button className="btn out" onClick={() => view(d)}>View</button>}</td></tr>)}
      {shown.length === 0 && <tr><td colSpan={5}>No documents found.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="wallet">{(p) => <Inner staff={["super_admin", "sales", "accounts", "warehouse"].includes(p.role)} />}</Shell>; }
