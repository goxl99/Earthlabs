"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, DISTRICTS } from "@/components/ui";
import { coverage, summary, whiteSpace, type MapRow } from "@/lib/territory";

const TYPES = [["DLR", "Dealers"], ["DST", "Distributors"]];
const COLOR = { exclusive: "#cfe8d9", shared: "#fdf0c8", open: "#f3f5f7" } as const;
function Inner() {
  const [rows, setRows] = useState<MapRow[]>([]); const [type, setType] = useState("DLR"); const [err, setErr] = useState("");
  const [d, setD] = useState(""); const [res, setRes] = useState<{ available: boolean; exclusive_holder: string | null; other_partners: number } | null>(null);
  useEffect(() => { supabase.rpc("territory_map").then(({ data, error }) => { if (error) setErr(error.message); else setRows((data as MapRow[]) ?? []); }); }, []);
  async function check() { const { data, error } = await supabase.rpc("check_territory", { st: "Gujarat", dist: d, t: type }); if (error) setErr(error.message); else setRes((data as typeof res[])[0] ?? null); }
  const s = summary(rows, type);
  return (<><h1>Territory Explorer</h1><p className="sub">The single geographical source of truth for the network. Applicants appear the moment they register, but never look like authorised partners.</p>{err && <Msg kind="bad">{err}</Msg>}
    <p>{TYPES.map(([c, l]) => <button key={c} className="btn" aria-pressed={type === c} onClick={() => { setType(c); setRes(null); }} style={{ marginRight: 8, opacity: type === c ? 1 : 0.6 }}>{l}</button>)}</p>
    <p>{s.percentCovered}% of Gujarat districts covered · {s.exclusive} exclusive · {s.shared} shared · {s.open} white-space</p>
    <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
      {DISTRICTS.map((x) => { const c = coverage(rows, x, type); return <div key={x} style={{ background: COLOR[c.cover], padding: 8, borderRadius: 6 }}><b>{x}</b><br /><small>{c.cover === "exclusive" ? `Exclusive: ${c.holder}` : c.cover === "shared" ? `${c.partners} partners` : "White-space"}</small></div>; })}
    </div>
    <h2>Check before assigning</h2>
    <div className="card"><select value={d} onChange={(e) => { setD(e.target.value); setRes(null); }}><option value="">Choose district</option>{DISTRICTS.map((x) => <option key={x}>{x}</option>)}</select> <button className="btn" disabled={!d} onClick={check}>Check exclusivity</button>
      {res && <Msg kind={res.available ? "ok" : "bad"}>{res.available ? `${d} has no exclusive ${type} partner. ${res.other_partners} other partner(s) operate there.` : `${d} is exclusive to ${res.exclusive_holder}. It cannot be assigned to another ${type}.`}</Msg>}</div>
    <h2>White-space ({whiteSpace(rows, type).length})</h2><p>{whiteSpace(rows, type).join(", ") || "None"}</p></>);
}
export default function Page() { return <Shell page="territory">{() => <Inner />}</Shell>; }
