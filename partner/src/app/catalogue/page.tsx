"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Field, Msg } from "@/components/ui";
import { inr } from "@/lib/orders";
import type { Role } from "@/lib/roles";

type Sku = { sku: string; name: string; category: string; mrp: number; pack_size: number; moq: number; slab: number; status: string; restricted: boolean };
type PL = { sku: string; name: string; mrp: number; status: string; type_code: string; margin_pct: number; price: number };
type Slab = { type_code: string; slab: number; margin_pct: number };
type Access = { sku: string; partner_id: string };

function Inner({ role }: { role: Role }) {
  const boss = role === "super_admin";
  const [tab, setTab] = useState<"products" | "prices" | "margins">("products");
  const [skus, setSkus] = useState<Sku[]>([]); const [pl, setPl] = useState<PL[]>([]); const [slabs, setSlabs] = useState<Slab[]>([]); const [access, setAccess] = useState<Access[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [n, setN] = useState({ sku: "", name: "", category: "", mrp: "", pack: "", moq: "5", slab: "1" });
  const [ov, setOv] = useState({ sku: "", type: "DLR", pct: "" }); const [ac, setAc] = useState({ sku: "", pid: "" });
  const say = (t: string, ok = true) => setMsg({ ok, t });
  const load = useCallback(async () => {
    setSkus(((await supabase.from("skus").select("sku,name,category,mrp,pack_size,moq,slab,status,restricted").order("sku").limit(500)).data as Sku[]) ?? []);
    setPl(((await supabase.rpc("price_list")).data as PL[]) ?? []);
    setSlabs(((await supabase.from("margin_slabs").select("type_code,slab,margin_pct").order("type_code")).data as Slab[]) ?? []);
    setAccess(((await supabase.from("sku_access").select("sku,partner_id").limit(1000)).data as Access[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = (error: { message: string } | null, ok: string) => { say(error ? error.message : ok, !error); if (!error) load(); };

  async function add() {
    const { error } = await supabase.from("skus").insert({ sku: n.sku.trim().toUpperCase(), name: n.name.trim(), category: n.category.trim(), mrp: Number(n.mrp), pack_size: Number(n.pack), moq: Number(n.moq), slab: Number(n.slab), status: "draft" });
    done(error, "SKU added as draft. Set margins, then make it active."); if (!error) setN({ ...n, sku: "", name: "", mrp: "" });
  }
  const setStatus = async (s: string, st: "active" | "retired") => done((await supabase.rpc("set_sku_status", { s, st })).error, st === "active" ? "SKU is active" : "SKU retired");
  const toggleRestricted = async (k: Sku) => done((await supabase.from("skus").update({ restricted: !k.restricted }).eq("sku", k.sku)).error, k.restricted ? "Visible to all partners" : "Now visible only to partners you add");
  const saveSlab = async (s: Slab, v: string) => done((await supabase.from("margin_slabs").update({ margin_pct: Number(v) }).eq("type_code", s.type_code).eq("slab", s.slab)).error, "Margin saved");
  const saveOverride = async () => done((await supabase.from("sku_margins").upsert({ sku: ov.sku, type_code: ov.type, margin_pct: Number(ov.pct) })).error, "SKU margin saved");
  const addAccess = async () => done((await supabase.from("sku_access").insert({ sku: ac.sku, partner_id: ac.pid.trim() })).error, "Partner can now see this SKU");
  const rmAccess = async (a: Access) => done((await supabase.from("sku_access").delete().eq("sku", a.sku).eq("partner_id", a.partner_id)).error, "Access removed");

  return (<><h1>Products &amp; pricing</h1>
    <div role="tablist" style={{ display: "flex", gap: 8, margin: "12px 0" }}>{(["products", "prices", "margins"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className="btn" style={{ opacity: tab === t ? 1 : 0.55 }} onClick={() => setTab(t)}>{t === "products" ? "Products" : t === "prices" ? "Price list" : "Margin slabs"}</button>)}</div>
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    {tab === "products" && <>
      <div className="card"><table><thead><tr><th>SKU</th><th>Product</th><th>MRP incl. GST</th><th>Pack</th><th>Min cartons</th><th>Status</th><th>Visibility</th>{boss && <th></th>}</tr></thead><tbody>
        {skus.map((k) => (<tr key={k.sku}><td>{k.sku}</td><td>{k.name}<div style={{ fontSize: 12 }}>{k.category}</div></td><td>{inr(k.mrp)}</td><td>{k.pack_size}</td><td>{k.moq}</td><td>{k.status}</td>
          <td>{k.restricted ? <>Selected partners{access.filter((a) => a.sku === k.sku).map((a) => <div key={a.partner_id} style={{ fontSize: 12 }}>{a.partner_id} {boss && <a href="#" onClick={(e) => { e.preventDefault(); rmAccess(a); }}>remove</a>}</div>)}</> : "All partners"}</td>
          {boss && <td style={{ whiteSpace: "nowrap" }}>
            {k.status !== "active" && <button className="btn" onClick={() => setStatus(k.sku, "active")}>{k.status === "retired" ? "Restore" : "Make active"}</button>}
            {k.status === "active" && <button className="btn" onClick={() => setStatus(k.sku, "retired")}>Retire</button>} <button className="btn" onClick={() => toggleRestricted(k)}>{k.restricted ? "Open to all" : "Restrict"}</button></td>}</tr>))}
        {skus.length === 0 && <tr><td colSpan={8}>No products yet.</td></tr>}</tbody></table></div>
      {boss && <><h2>Add a product</h2><div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <Field label="SKU code"><input value={n.sku} onChange={(e) => setN({ ...n, sku: e.target.value })} /></Field><Field label="Name"><input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></Field>
        <Field label="Category"><input value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })} /></Field><Field label="MRP incl. GST"><input inputMode="decimal" value={n.mrp} onChange={(e) => setN({ ...n, mrp: e.target.value })} /></Field>
        <Field label="Units per carton"><input inputMode="numeric" value={n.pack} onChange={(e) => setN({ ...n, pack: e.target.value })} /></Field><Field label="Minimum cartons"><input inputMode="numeric" value={n.moq} onChange={(e) => setN({ ...n, moq: e.target.value })} /></Field>
        <Field label="Margin group"><select value={n.slab} onChange={(e) => setN({ ...n, slab: e.target.value })} style={{ width: "100%", padding: 10 }}><option value="0">Sachet type</option><option value="1">Bottle type</option></select></Field>
        <div style={{ alignSelf: "end" }}><button className="btn" disabled={!n.sku || !n.name || !n.mrp || !n.pack} onClick={add}>Add as draft</button></div></div>
        <h2>Partner-wise access</h2><div className="card"><p>For a restricted SKU, add the partners who may see and order it.</p>
          <select value={ac.sku} onChange={(e) => setAc({ ...ac, sku: e.target.value })}><option value="">SKU</option>{skus.filter((k) => k.restricted).map((k) => <option key={k.sku} value={k.sku}>{k.sku}</option>)}</select> <input style={{ width: 220 }} placeholder="Partner ID" value={ac.pid} onChange={(e) => setAc({ ...ac, pid: e.target.value })} /> <button className="btn" disabled={!ac.sku || !ac.pid} onClick={addAccess}>Give access</button></div></>}
    </>}
    {tab === "prices" && <><div className="card"><p>Partner price per unit, excluding GST = MRP ÷ 1.18 × (1 − margin). Only margins set for a partner type are shown.</p><table><thead><tr><th>SKU</th><th>Product</th><th>MRP</th><th>Partner type</th><th>Margin</th><th>Unit price</th></tr></thead><tbody>
      {pl.map((r) => <tr key={r.sku + r.type_code}><td>{r.sku}</td><td>{r.name} {r.status !== "active" && <i>({r.status})</i>}</td><td>{inr(r.mrp)}</td><td>{r.type_code}</td><td>{r.margin_pct}%</td><td>{inr(r.price)}</td></tr>)}</tbody></table></div>
      {boss && <><h2>SKU-wise margin override</h2><div className="card"><select value={ov.sku} onChange={(e) => setOv({ ...ov, sku: e.target.value })}><option value="">SKU</option>{skus.map((k) => <option key={k.sku} value={k.sku}>{k.sku}</option>)}</select> <select value={ov.type} onChange={(e) => setOv({ ...ov, type: e.target.value })}>{[...new Set(slabs.map((s) => s.type_code))].map((c) => <option key={c}>{c}</option>)}</select> <input style={{ width: 120 }} placeholder="Margin %" inputMode="decimal" value={ov.pct} onChange={(e) => setOv({ ...ov, pct: e.target.value })} /> <button className="btn" disabled={!ov.sku || !ov.pct} onClick={saveOverride}>Save</button></div></>}</>}
    {tab === "margins" && <div className="card"><p>Default margin by partner type and margin group. A SKU-wise override beats this.</p><table><thead><tr><th>Partner type</th><th>Group</th><th>Margin %</th></tr></thead><tbody>
      {slabs.map((s) => <tr key={s.type_code + s.slab}><td>{s.type_code}</td><td>{s.slab === 0 ? "Sachet type" : "Bottle type"}</td><td>{boss ? <input style={{ width: 90, margin: 0 }} defaultValue={s.margin_pct} onBlur={(e) => Number(e.target.value) !== Number(s.margin_pct) && saveSlab(s, e.target.value)} /> : `${s.margin_pct}%`}</td></tr>)}</tbody></table></div>}
  </>);
}
export default function Page() { return <Shell page="catalogue">{(p) => <Inner role={p.role} />}</Shell>; }
