"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { saveCsv } from "@/lib/download";
import Coverage from "@/components/Coverage";
import { cleanTerm, emptyFilter, activeFilters, type PartnerFilter } from "@/lib/partnerFilter";

type P = { id: string; name: string; type_code: string; district: string; status: string };
const STATUSES = ["Agreement Pending", "Active", "Suspended", "Terminated"];
function Inner() {
  const [rows, setRows] = useState<P[]>([]); const [f, setF] = useState<PartnerFilter>(emptyFilter); const [page, setPage] = useState(0); const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<{ code: string; name: string }[]>([]); const [err, setErr] = useState("");
  useEffect(() => { supabase.from("partner_types").select("code,name").order("code").then(({ data }) => setTypes((data as typeof types) ?? [])); }, []);
  const build = useCallback((from: number, to: number) => {
    let r = supabase.from("partners").select("id,name,type_code,district,status", { count: "exact" }).order("id").range(from, to);
    const t = cleanTerm(f.q);
    if (t) r = r.or(`name.ilike.%${t}%,id.ilike.%${t}%,district.ilike.%${t}%`);
    if (f.type) r = r.eq("type_code", f.type);
    if (f.status) r = r.eq("status", f.status);
    if (cleanTerm(f.district)) r = r.ilike("district", `%${cleanTerm(f.district)}%`);
    return r;
  }, [f]);
  useEffect(() => { build(page * 50, page * 50 + 49).then(({ data, count, error }) => { setErr(error?.message ?? ""); setRows((data as P[]) ?? []); setTotal(count ?? 0); }); }, [build, page]);
  const set = (k: keyof PartnerFilter, v: string) => { setF((o) => ({ ...o, [k]: v })); setPage(0); };
  async function exportAll() {
    const out: P[] = [];
    for (let from = 0; from < 20000; from += 1000) { const { data, error } = await build(from, from + 999); if (error) { setErr(error.message); return; } out.push(...((data as P[]) ?? [])); if ((data?.length ?? 0) < 1000) break; }
    saveCsv(`partners-${new Date().toISOString().slice(0, 10)}.csv`, out.map((p) => ({ "Partner ID": p.id, Name: p.name, Type: p.type_code, District: p.district, Status: p.status })));
  }
  return (<><h1>Partners</h1><p className="sub">Every approved partner keeps one Partner ID for life. Open a row for the full profile.</p>
    <Coverage refresh={total} />
    {err && <div className="note bad">{err}</div>}
    <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
      <input aria-label="Search partners" placeholder="Search name, ID or district" value={f.q} onChange={(e) => set("q", e.target.value)} style={{ maxWidth: 300 }} />
      <select aria-label="Type" value={f.type} onChange={(e) => set("type", e.target.value)}><option value="">All types</option>{types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>
      <select aria-label="Status" value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      <input aria-label="District" placeholder="District" value={f.district} onChange={(e) => set("district", e.target.value)} style={{ maxWidth: 160 }} />
      {activeFilters(f) > 0 && <button className="btn" onClick={() => { setF(emptyFilter); setPage(0); }}>Clear filters</button>}
      <div className="sp" /><button className="btn" onClick={exportAll} disabled={total === 0}>Export CSV</button></div>
    <div className="card"><table><thead><tr><th>Partner ID</th><th>Name</th><th>Type</th><th>District</th><th>Status</th></tr></thead><tbody>{rows.map((p) => <tr key={p.id}><td><Link href={`/partners/view/?id=${p.id}`}>{p.id}</Link></td><td>{p.name}</td><td>{p.type_code}</td><td>{p.district}</td><td>{p.status}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={5}>No partners match.</td></tr>}</tbody></table>
      <p>{total} partners · page {page + 1} <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button> <button className="btn" disabled={(page + 1) * 50 >= total} onClick={() => setPage(page + 1)}>Next</button></p></div></>);
}
export default function Page() { return <Shell page="partners">{() => <Inner />}</Shell>; }
