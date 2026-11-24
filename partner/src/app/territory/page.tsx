"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Badge, Kpi, Msg } from "@/components/ui";
import { askForm, notify } from "@/lib/dialog";
import { GJ, CATS, MST_LABEL, dist, drillSet, fitTo, potential, pos, distFill, exclConflict, type Lvl, type VB, type ColorMode } from "@/lib/geo";

type P = { id: string; name: string; type_code: string; status: string; district: string; exclusive: boolean; contact_name: string | null; phone: string | null; email: string | null };
type A = { id: string; business_name: string; type_code: string; status: string; district: string; partner_id: string | null; contact_name: string; phone: string; email: string };
type V = { id: string; name: string; district: string; status: string };
type Item = { k: string; kind: "p" | "a" | "v"; st: string; x: number; y: number; cat: string; name: string };
const stBadge = (s: string) => <Badge kind={["Active", "Approved", "Executed"].includes(s) ? "good" : s === "Suspended" || s === "Rejected" ? "crit" : s === "Agreement Pending" ? "warn" : "info"}>{s}</Badge>;
const CatChip = ({ c }: { c: string }) => <span className="chip" style={{ background: CATS[c]?.col }}>{(CATS[c]?.s ?? c).toUpperCase()}</span>;

function Inner({ canAssign }: { canAssign: boolean }) {
  const [ps, setPs] = useState<P[]>([]); const [apps, setApps] = useState<A[]>([]); const [vs, setVs] = useState<V[]>([]); const [err, setErr] = useState(""); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [lvl, setLvl] = useState<Lvl>({}); const [town, setTown] = useState(""); const [cat, setCat] = useState("all"); const [st, setSt] = useState("all"); const [color, setColor] = useState<ColorMode>("status"); const [vend, setVend] = useState(false);
  const [vb, setVb] = useState<VB>(() => fitTo(null)); const [pick, setPick] = useState<string | null>(null); const [hier, setHier] = useState(false);
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("partners").select("id,name,type_code,status,district,exclusive,contact_name,phone,email").limit(2000),
      supabase.from("applications").select("id,business_name,type_code,status,district,partner_id,contact_name,phone,email").is("partner_id", null).limit(2000),
      supabase.from("vendors").select("id,name,district,status").limit(500)]);
    if (a.error) setErr(a.error.message); else setPs((a.data as P[]) ?? []);
    setApps((b.data as A[]) ?? []); setVs((c.data as V[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const info = useCallback((n: string) => {
    const act = ps.filter((p) => p.district === n && p.status === "Active"), all = ps.filter((p) => p.district === n && p.status !== "Terminated");
    const ap = apps.filter((a) => a.district === n && a.status !== "Rejected");
    return { act, all, apps: ap, vacant: act.length === 0 };
  }, [ps, apps]);
  const ds = drillSet(lvl);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    ps.forEach((p) => { if (cat !== "all" && p.type_code !== cat) return; const s = p.status === "Active" ? "active" : p.status === "Suspended" ? "suspended" : "approved"; if (st !== "all" && st !== s) return; if (!dist(p.district)) return;
      const [x, y] = pos(p.id, p.district, town && lvl.d === p.district ? town : p.district); out.push({ k: "p:" + p.id, kind: "p", st: s, x, y, cat: p.type_code, name: p.name }); });
    apps.forEach((a) => { if (cat !== "all" && a.type_code !== cat) return; const s = a.status === "Rejected" ? "rejected" : a.status === "Field verification" ? "verified" : "applicant";
      if (st !== "all" && !(st === "applicant" && (s === "applicant" || s === "verified")) && st !== s) return; if (!dist(a.district)) return;
      const [x, y] = pos(a.id, a.district, a.district); out.push({ k: "a:" + a.id, kind: "a", st: s, x, y, cat: a.type_code, name: a.business_name }); });
    if (vend) vs.forEach((v) => { if (!dist(v.district)) return; const [x, y] = pos(v.id, v.district, v.district); out.push({ k: "v:" + v.id, kind: "v", st: v.status === "Active" ? "vendor" : "vendor-pending", x, y, cat: "VND", name: v.name }); });
    return out;
  }, [ps, apps, vs, cat, st, vend, town, lvl.d]);

  const mcs = Object.keys(GJ.masters), cis = Object.keys(GJ.circles).filter((c) => !lvl.mc || GJ.masters[lvl.mc].includes(+c)), cls = Object.keys(GJ.clusters).filter((k) => !lvl.ci || GJ.circles[lvl.ci].includes(+k));
  const dds = (lvl.cl ? GJ.clusters[lvl.cl] : lvl.ci || lvl.mc ? ds! : GJ.gd.map((d) => d.n)); const tws = lvl.d ? GJ.towns.filter((t) => t.d === lvl.d) : [];
  function drill(k: "mc" | "ci" | "cl" | "d", v: string) {
    const L: Lvl = k === "mc" ? { mc: v || null } : k === "ci" ? { mc: lvl.mc, ci: v || null } : k === "cl" ? { mc: lvl.mc, ci: lvl.ci, cl: v || null } : { ...lvl, d: v || null };
    setLvl(L); setTown(""); setPick(k === "d" && v ? "d:" + v : null); setVb(fitTo(drillSet(L)));
  }
  const reset = () => { setLvl({}); setTown(""); setPick(null); setVb(fitTo(null)); };
  function zoom(f: number) { const [x, y, w, h] = vb, cx = x + w / 2, cy = y + h / 2, nw = Math.max(60, Math.min(1160, w * f)), nh = (nw * h) / w; setVb([cx - nw / 2, cy - nh / 2, nw, nh]); }
  function pickTown(d: string, n: string) { const dd = dist(d)!; setLvl({ mc: String(dd.mc), ci: String(dd.ci), cl: String(dd.cl), d }); setTown(n); const t = GJ.towns.find((x) => x.n === n && x.d === d)!; setVb([t.x - 60, t.y - 46, 120, 92]); }
  const k = vb[2] / 800;

  async function allocate() {
    const cand = ps.filter((p) => p.status !== "Suspended" && p.status !== "Terminated");
    const f = await askForm("Territory allocation", [
      { name: "pid", label: "Partner", type: "select", options: cand.map((p) => `${p.name} (${p.id})`), required: true },
      { name: "d", label: "District", type: "select", options: GJ.gd.map((d) => d.n), required: true },
      { name: "ex", label: "Exclusive rights", type: "select", options: ["Non-exclusive", "Exclusive"] }], { ok: "Allocate", intro: "Exclusive allocations are checked against every existing agreement before they are saved." });
    if (!f) return;
    const pid = /\((ELP-[A-Z]+-\d+)\)$/.exec(f.pid)?.[1] ?? ""; const p = ps.find((x) => x.id === pid); if (!p) return;
    const clash = exclConflict(ps, p.type_code, f.d, p.id, f.ex === "Exclusive");
    if (clash) { await notify("Allocation blocked", `${clash}.`); return; }
    const { error } = await supabase.from("territory_claims").insert({ partner_id: p.id, state: "Gujarat", district: f.d, exclusive: f.ex === "Exclusive" });
    if (error) { await notify("Allocation blocked", error.message); return; }
    setMsg({ ok: true, t: `${p.name} allocated to ${f.d}` }); load();
  }

  const vac = GJ.gd.filter((d) => info(d.n).vacant).sort((a, b) => potential(b.n) - potential(a.n));
  const overlap = GJ.gd.filter((d) => info(d.n).apps.length > 1).map((d) => `${d.n} (${info(d.n).apps.length} applicants)`);
  const sel = pick?.[0] === "p" ? ps.find((p) => p.id === pick.slice(2)) : null, selA = pick?.[0] === "a" ? apps.find((a) => a.id === pick.slice(2)) : null, selV = pick?.[0] === "v" ? vs.find((v) => v.id === pick.slice(2)) : null;
  const dn = pick?.startsWith("d:") ? pick.slice(2) : null;

  const panel = sel ? (<><h2>{sel.name}</h2><div className="row" style={{ margin: "6px 0" }}><CatChip c={sel.type_code} />{stBadge(sel.status)}{sel.exclusive && <Badge kind="gold">Exclusive</Badge>}</div>
      <div className="mini">Partner ID <b>{sel.id}</b> · {sel.contact_name}</div>
      <table className="t"><tbody><tr><td>Contact</td><td>{sel.phone} · {sel.email}</td></tr><tr><td>Territory</td><td>{sel.district} · Cluster {dist(sel.district)?.cl} · Circle {dist(sel.district)?.ci}</td></tr></tbody></table>
      <div className="row" style={{ marginTop: 10 }}><Link className="btn pri sm" href={`/partners/view/?id=${sel.id}`}>Open partner profile</Link></div></>)
    : selA ? (<><h2>{selA.business_name}</h2><div className="row" style={{ margin: "6px 0" }}><CatChip c={selA.type_code} />{stBadge(selA.status)}<Badge kind="mute">Not an authorised partner</Badge></div>
      <div className="mini">Application · {selA.contact_name}</div>
      <table className="t"><tbody><tr><td>Contact</td><td>{selA.phone} · {selA.email}</td></tr><tr><td>Preferred territory</td><td>{selA.district}</td></tr></tbody></table>
      <div className="row" style={{ marginTop: 10 }}><Link className="btn pri sm" href="/applications/">Review application</Link></div></>)
    : selV ? (<><h2>{selV.name}</h2><div className="row"><CatChip c="VND" />{stBadge(selV.status)}</div><div className="mini">{selV.id} · {selV.district} · vendors stay in a separate layer and are not channel partners</div><Link className="btn sm" href="/vendors/">Open vendors</Link></>)
    : dn ? (() => { const d = dist(dn)!, i = info(dn), inds = GJ.ind.filter((x) => x.d === dn), tw = GJ.towns.filter((x) => x.d === dn);
      return (<><h2>{dn}</h2><div className="row" style={{ margin: "6px 0" }}><span className="chip" style={{ background: "#13595a" }}>CLUSTER {d.cl}</span><span className="chip" style={{ background: "#7b543b" }}>CIRCLE {d.ci}</span><span className="chip" style={{ background: "#314452" }}>MASTER CIRCLE {d.mc}</span></div>
        {i.vacant && <div className="note">No active partner in {dn} yet{i.apps.length ? ` · ${i.apps.length} applicant(s)` : ""}. Market potential score {potential(dn)}.</div>}
        <h3>Partners ({i.all.length})</h3>{i.all.map((p) => <div className="check" key={p.id}><div style={{ flex: 1 }}><button className="lk" onClick={() => setPick("p:" + p.id)}>{p.name}</button><div className="mini">{CATS[p.type_code]?.s} · {p.id}</div></div>{stBadge(p.status)}</div>)}{i.all.length === 0 && <p className="mini">None</p>}
        <h3 style={{ marginTop: 10 }}>Applicants ({i.apps.length})</h3>{i.apps.map((a) => <div className="check" key={a.id}><div style={{ flex: 1 }}><button className="lk" onClick={() => setPick("a:" + a.id)}>{a.business_name}</button><div className="mini">{CATS[a.type_code]?.s}</div></div>{stBadge(a.status)}</div>)}{i.apps.length === 0 && <p className="mini">None</p>}
        <h3 style={{ marginTop: 10 }}>Local markets</h3><div className="mini">{tw.slice(0, 18).map((t, j) => <span key={t.n}>{j > 0 && " · "}<button className="lk" onClick={() => pickTown(dn, t.n)}>{t.n}</button></span>)}</div>
        {inds.length > 0 && <><h3 style={{ marginTop: 10 }}>Industrial areas</h3><div className="mini">{inds.map((x) => `${x.n} (${({ H: "high-volume", M: "medium", E: "emerging" })[x.p]})`).join(" · ")}</div></>}</>); })()
    : (<><h2>Network coverage</h2><div className="grid g2" style={{ margin: "8px 0" }}><Kpi label="Districts covered" value={`${GJ.gd.length - vac.length} / ${GJ.gd.length}`} note="with an active partner" /><Kpi label="Open applicants" value={apps.filter((a) => a.status !== "Rejected").length} note="on the map now" /></div>
      <div className="note ai"><b>✦ AI territory intelligence</b><div className="mini">Vacant districts ranked by market potential (industrial areas and towns). Recommendations only.</div></div>
      {vac.slice(0, 6).map((d) => { const i = info(d.n); return <div className="check" key={d.n}><div style={{ flex: 1 }}><button className="lk" onClick={() => setPick("d:" + d.n)}>{d.n}</button><div className="mini">Cluster {d.cl} · potential {potential(d.n)}</div></div>{i.apps.length ? <Badge kind="gold">{i.apps.length} applicant</Badge> : <Badge kind="mute">recruit</Badge>}</div>; })}
      <p className="mini" style={{ marginTop: 8 }}>Overlap check: {overlap.length ? `competing applicants in ${overlap.join(", ")}` : "no competing applicants"}.</p><p className="mini">Click any marker or district for details.</p></>);

  return (<>
    <div className="row"><h1>EarthLabs Territory Explorer</h1><div className="sp" />{canAssign && <button className="btn" onClick={allocate}>Territory allocation tool</button>}<button className="btn" onClick={() => setHier(true)}>Clusters &amp; hierarchy</button></div>
    <p className="sub">The single geographical source of truth for the network. Applicants appear the moment they register, but never look like authorised partners. Click a marker or a district.</p>
    {err && <Msg kind="bad">{err}</Msg>}{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card flat" style={{ marginBottom: 10 }}>
      <div className="row"><span className="mini"><b>Drill down:</b></span><button className="btn sm" onClick={reset}>India</button><span>›</span><button className="btn sm" onClick={reset}>Gujarat</button><span>›</span>
        <select aria-label="Master circle" value={lvl.mc ?? ""} onChange={(e) => drill("mc", e.target.value)}><option value="">Region (master circle)</option>{mcs.map((m) => <option key={m} value={m}>Master circle {m} · {GJ.mname[m]}</option>)}</select>
        <select aria-label="Circle" value={lvl.ci ?? ""} onChange={(e) => drill("ci", e.target.value)}><option value="">Circle</option>{cis.map((c) => <option key={c} value={c}>Circle {c} · {GJ.cname[c]}</option>)}</select>
        <select aria-label="Cluster" value={lvl.cl ?? ""} onChange={(e) => drill("cl", e.target.value)}><option value="">Cluster</option>{cls.map((c) => <option key={c} value={c}>Cluster {c} · {GJ.clusters[c].join(", ")}</option>)}</select>
        <select aria-label="District" value={lvl.d ?? ""} onChange={(e) => drill("d", e.target.value)}><option value="">District</option>{dds.map((n) => <option key={n}>{n}</option>)}</select>
        <select aria-label="Local market" value={town} onChange={(e) => { const v = e.target.value; setTown(v); if (v && lvl.d) pickTown(lvl.d, v); }}><option value="">Local market</option>{tws.map((t) => <option key={t.n} value={t.n}>{t.n}{t.k === "C" ? " (city)" : ""}</option>)}</select></div>
      <div className="row" style={{ marginTop: 8 }}><span className="mini"><b>Show:</b></span>
        <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>{[["all", "All categories"], ["DLR", "Dealers"], ["DST", "Distributors"], ["STK", "Stockists"], ["INS", "Institutional"]].map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
        <select aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)}>{[["all", "All statuses"], ["applicant", "Applicants (incl. verified)"], ["approved", "Approved, agreement pending"], ["active", "Active"], ["suspended", "Suspended"], ["rejected", "Rejected"]].map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
        <select aria-label="Colour by" value={color} onChange={(e) => setColor(e.target.value as ColorMode)}>{[["status", "Colour: coverage"], ["cluster", "Colour: cluster"], ["circle", "Colour: circle"], ["master", "Colour: master circle"], ["potential", "Colour: market potential"]].map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
        <label className="row mini" style={{ gap: 5, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}><input type="checkbox" checked={vend} onChange={(e) => setVend(e.target.checked)} /> Vendors layer</label></div></div>
    <div className="grid g21" style={{ alignItems: "start" }}><div>
      <div className="mapwrap"><div style={{ position: "absolute", right: 10, top: 10, display: "flex", flexDirection: "column", gap: 6, zIndex: 2 }}><button className="btn" aria-label="Zoom in" onClick={() => zoom(0.7)}>+</button><button className="btn" aria-label="Zoom out" onClick={() => zoom(1 / 0.7)}>−</button><button className="btn sm" onClick={reset}>Reset</button></div>
        <svg className="gm" viewBox={vb.join(" ")} role="img" aria-label="Map of Gujarat districts with partner and applicant markers">
          {GJ.gd.map((d) => { const dim = ds && !ds.includes(d.n), i = info(d.n), on = lvl.d === d.n || pick === "d:" + d.n;
            return <path key={d.n} d={GJ.paths[d.n]} fill={distFill(d.n, color, i.act.length > 0, i.apps.length > 0)} stroke={on ? "#c89739" : "#fff"} strokeWidth={(pick === "d:" + d.n ? 3 : 1.2) * k} opacity={dim ? 0.28 : 1} style={{ cursor: "pointer" }} onClick={() => setPick("d:" + d.n)}><title>{`${d.n} · Cluster ${d.cl} · Circle ${d.ci}`}</title></path>; })}
          {GJ.gd.map((d) => { const dim = ds && !ds.includes(d.n); return <text key={"t" + d.n} x={d.x} y={d.y} fontSize={11 * k} fill="#314452" textAnchor="middle" opacity={dim ? 0.25 : 0.8} pointerEvents="none" style={{ paintOrder: "stroke", stroke: "#fffcf2", strokeWidth: 2.5 * k }}>{d.n}</text>; })}
          {lvl.d && GJ.towns.filter((t) => t.d === lvl.d).map((t) => <g key={t.n}><circle cx={t.x} cy={t.y} r={3 * k} fill="#314452" opacity=".7" /><text x={t.x + 5 * k} y={t.y + 3 * k} fontSize={10 * k} fill="#314452" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 2 * k }}>{t.n}</text></g>)}
          {items.map((m) => { const r = 8 * k, on = pick === m.k, cc = CATS[m.cat]?.col ?? "#8a8a8a"; const dm = `M0,${-r * 1.2}L${r * 1.2},0L0,${r * 1.2}L${-r * 1.2},0Z`; const x = `M${-r * 0.5},${-r * 0.5}L${r * 0.5},${r * 0.5}M${r * 0.5},${-r * 0.5}L${-r * 0.5},${r * 0.5}`;
            let s;
            if (m.kind === "p") s = m.st === "active" ? <circle r={r} fill={cc} stroke="#fff" strokeWidth={2 * k} /> : m.st === "suspended" ? <><circle r={r} fill="#fff" stroke="#b3372f" strokeWidth={3 * k} /><path d={x} stroke="#b3372f" strokeWidth={2 * k} /></> : <circle r={r} fill={cc} fillOpacity=".45" stroke={cc} strokeWidth={2.5 * k} strokeDasharray={`${3 * k} ${2 * k}`} />;
            else if (m.kind === "a") s = m.st === "verified" ? <path d={dm} fill="#c89739" stroke="#fff" strokeWidth={2 * k} /> : m.st === "rejected" ? <><path d={dm} fill="#bbb" stroke="#888" strokeWidth={1.5 * k} /><path d={x} stroke="#555" strokeWidth={1.6 * k} /></> : <path d={dm} fill="#fff" stroke="#c89739" strokeWidth={2.5 * k} />;
            else s = <rect x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} fill={m.st === "vendor" ? "#7b543b" : "#fff"} stroke="#7b543b" strokeWidth={2 * k} rx={2 * k} />;
            return <g key={m.k} transform={`translate(${m.x},${m.y})`} style={{ cursor: "pointer" }} onClick={() => setPick(m.k)}>{on && <circle r={r * 1.9} fill="none" stroke="#c89739" strokeWidth={2.5 * k} />}{s}<title>{`${m.name} · ${MST_LABEL[m.st]}`}</title></g>; })}
        </svg></div>
      <div className="legend">
        <span><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#13595a" /></svg> Active partner (colour = category)</span>
        <span><svg width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#13595a" fillOpacity=".4" stroke="#13595a" strokeDasharray="3 2" /></svg> Approved, agreement pending</span>
        <span><svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#fff" stroke="#b3372f" strokeWidth="2" /></svg> Suspended</span>
        <span><svg width="14" height="14"><path d="M7 1L13 7L7 13L1 7Z" fill="#fff" stroke="#c89739" strokeWidth="2" /></svg> Applicant</span>
        <span><svg width="14" height="14"><path d="M7 1L13 7L7 13L1 7Z" fill="#c89739" /></svg> Verified applicant</span>
        <span><svg width="14" height="14"><path d="M7 1L13 7L7 13L1 7Z" fill="#bbb" stroke="#888" /></svg> Rejected</span>
        <span className="mini">Category colours: {["DLR", "DST", "STK", "INS"].map((c) => <span key={c} style={{ marginRight: 8 }}><i style={{ display: "inline-block", width: 10, height: 10, background: CATS[c].col, marginRight: 3 }} />{CATS[c].s}</span>)}</span></div></div>
      <aside className="card" style={{ position: "sticky", top: 70, maxHeight: "calc(100vh - 90px)", overflow: "auto" }}>{panel}</aside></div>
    {hier && <div className="mod-bg" role="dialog" aria-modal="true" aria-label="Clusters and hierarchy" onClick={() => setHier(false)}><div className="modal wide" onClick={(e) => e.stopPropagation()}>
      <header><h3 style={{ margin: 0, flex: 1 }}>Clusters and hierarchy</h3><button className="x" aria-label="Close" onClick={() => setHier(false)}>×</button></header>
      <div className="body"><p className="mini">District → cluster (2–3 districts) → circle (3 clusters) → master circle (2–3 circles).</p>
        <div className="tw"><table className="t"><thead><tr><th>Cluster</th><th>Districts</th><th>Circle</th><th>Master circle</th><th className="n">Active partners</th></tr></thead><tbody>
          {Object.keys(GJ.clusters).map((c) => { const ci = Object.keys(GJ.circles).find((x) => GJ.circles[x].includes(+c))!; return <tr key={c}><td>Cluster {c}</td><td>{GJ.clusters[c].join(", ")}</td><td>Circle {ci} · {GJ.cname[ci]}</td><td>Master {GJ.mcof[ci]}</td><td className="n">{ps.filter((p) => p.status === "Active" && GJ.clusters[c].includes(p.district)).length}</td></tr>; })}</tbody></table></div></div>
      <footer><button className="btn" onClick={() => setHier(false)}>Close</button></footer></div></div>}
  </>);
}
export default function Page() { return <Shell page="territory">{(p) => <Inner canAssign={p.role === "super_admin"} />}</Shell>; }
