"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";

type P = { id: string; name: string; type_code: string; district: string; status: string };
function Inner() {
  const [rows, setRows] = useState<P[]>([]); const [q, setQ] = useState(""); const [page, setPage] = useState(0); const [total, setTotal] = useState(0);
  useEffect(() => {
    let r = supabase.from("partners").select("id,name,type_code,district,status", { count: "exact" }).order("id").range(page * 50, page * 50 + 49);
    if (q.trim()) r = r.or(`name.ilike.%${q.trim().replace(/[%,]/g, "")}%,id.ilike.%${q.trim().replace(/[%,]/g, "")}%,district.ilike.%${q.trim().replace(/[%,]/g, "")}%`);
    r.then(({ data, count }) => { setRows((data as P[]) ?? []); setTotal(count ?? 0); });
  }, [q, page]);
  return (<><h1>Partners</h1><input placeholder="Search name, ID or district" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ maxWidth: 360 }} />
    <div className="card"><table><thead><tr><th>Partner ID</th><th>Name</th><th>Type</th><th>District</th><th>Status</th></tr></thead><tbody>{rows.map((p) => <tr key={p.id}><td><Link href={`/partners/view/?id=${p.id}`}>{p.id}</Link></td><td>{p.name}</td><td>{p.type_code}</td><td>{p.district}</td><td>{p.status}</td></tr>)}</tbody></table>
      <p>{total} partners · page {page + 1} <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button> <button className="btn" disabled={(page + 1) * 50 >= total} onClick={() => setPage(page + 1)}>Next</button></p></div></>);
}
export default function Page() { return <Shell page="partners">{() => <Inner />}</Shell>; }
