"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Field, Msg, when } from "@/components/ui";
import type { Role } from "@/lib/roles";
import SubTabs from "@/components/SubTabs";
import { PRICING_TABS } from "@/lib/pricingTabs";

type S = { id: string; name: string; kind: string; value: number; buy: number | null; get: number | null; min_cartons: number; min_value: number; first_order_only: boolean; stackable: boolean; skus: string[] | null; audience_mode: string; audience_types: string[]; audience_partners: string[]; valid_from: string; valid_to: string; budget: number; active: boolean; disclosed: boolean };
const benefit = (s: S) => s.kind === "pct" ? `${s.value}% off` : s.kind === "flat" ? `₹${s.value} off the order` : s.kind === "free" ? `${s.get} free carton per ${s.buy} bought` : "Free brand kit";
const empty = { id: "", name: "", kind: "pct", value: "", buy: "", get: "", min_cartons: "0", min_value: "0", first: false, stack: true, skus: "", aud: "all", types: "", partners: "", from: "", to: "", budget: "0" };

function Inner({ role }: { role: Role }) {
  const boss = role === "super_admin"; const [list, setList] = useState<S[]>([]); const [used, setUsed] = useState<Record<string, number>>({});
  const [canDisclose, setCan] = useState(boss); const [f, setF] = useState(empty); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    setList(((await supabase.from("schemes").select("*").order("valid_to", { ascending: false }).limit(200)).data as S[]) ?? []);
    const u: Record<string, number> = {};
    ((await supabase.from("scheme_usage").select("scheme_id,amount").limit(5000)).data ?? []).forEach((r: { scheme_id: string; amount: number }) => { u[r.scheme_id] = (u[r.scheme_id] ?? 0) + Number(r.amount); });
    setUsed(u);
    const { data } = await supabase.from("settings").select("value").eq("key", "scheme_disclosers").maybeSingle();
    setCan(boss || ((data?.value as string[] | undefined) ?? []).includes(role));
  }, [boss, role]);
  useEffect(() => { load(); }, [load]);
  const say = (t: string, ok = true) => setMsg({ ok, t });
  const arr = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  async function save() {
    const row = {
      id: f.id.trim().toUpperCase(), name: f.name.trim(), kind: f.kind, value: Number(f.value || 0), buy: f.kind === "free" ? Number(f.buy) : null, get: f.kind === "free" ? Number(f.get) : null,
      min_cartons: Number(f.min_cartons), min_value: Number(f.min_value), first_order_only: f.first, stackable: f.stack,
      skus: arr(f.skus).length ? arr(f.skus).map((x) => x.toUpperCase()) : null,
      audience_mode: f.aud, audience_types: f.aud === "types" ? arr(f.types).map((x) => x.toUpperCase()) : [], audience_partners: f.aud === "partners" ? arr(f.partners) : [],
      valid_from: f.from, valid_to: f.to, budget: Number(f.budget), active: false, disclosed: false,
    };
    const { error } = await supabase.from("schemes").insert(row);
    say(error ? error.message : "Scheme saved as inactive and hidden. Activate it, then disclose it.", !error);
    if (!error) { setF(empty); load(); }
  }
  const flip = async (s: S, patch: Partial<S>, ok: string) => { const { error } = await supabase.from("schemes").update(patch).eq("id", s.id); say(error ? error.message : ok, !error); load(); };
  const disclose = async (s: S, show: boolean) => { const { error } = await supabase.rpc("disclose_scheme", { sid: s.id, show }); say(error ? error.message : show ? "Partners can now see this scheme" : "Scheme hidden from partners", !error); load(); };
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  return (<><h1>Schemes</h1><p>Schemes stay hidden from partners until disclosed. Only Super Admin creates and activates schemes{canDisclose && !boss ? "; you may disclose them" : ""}.</p><SubTabs current="/schemes/" items={PRICING_TABS} />
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card"><table><thead><tr><th>Scheme</th><th>Benefit</th><th>Who</th><th>Valid</th><th>Budget used</th><th>State</th><th></th></tr></thead><tbody>
      {list.map((s) => (<tr key={s.id}><td><b>{s.name}</b><div style={{ fontSize: 12 }}>{s.id} · {s.stackable ? "stacks" : "does not stack"}{s.first_order_only ? " · first order only" : ""}{s.min_cartons ? ` · min ${s.min_cartons} cartons` : ""}{s.min_value ? ` · min ₹${s.min_value}` : ""}</div></td>
        <td>{benefit(s)}<div style={{ fontSize: 12 }}>{s.skus ? s.skus.join(", ") : "all products"}</div></td>
        <td>{s.audience_mode === "all" ? "All partners" : s.audience_mode === "types" ? s.audience_types.join(", ") : s.audience_partners.join(", ")}</td><td>{when(s.valid_from)} to {when(s.valid_to)}</td>
        <td>₹{(used[s.id] ?? 0).toLocaleString("en-IN")}{s.budget > 0 ? ` of ₹${Number(s.budget).toLocaleString("en-IN")}` : " (no cap)"}</td>
        <td>{!s.active ? "Inactive" : s.disclosed ? "Live, disclosed" : "Active, hidden"}</td>
        <td style={{ whiteSpace: "nowrap" }}>{boss && <button className="btn" onClick={() => flip(s, s.active ? { active: false, disclosed: false } : { active: true }, s.active ? "Scheme paused" : "Scheme active (still hidden)")}>{s.active ? "Pause" : "Activate"}</button>} {canDisclose && s.active && <button className="btn" onClick={() => disclose(s, !s.disclosed)}>{s.disclosed ? "Hide" : "Disclose"}</button>}</td></tr>))}
      {list.length === 0 && <tr><td colSpan={7}>No schemes yet.</td></tr>}</tbody></table></div>
    {boss && <><h2>New scheme</h2><div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
      <Field label="Code"><input value={f.id} onChange={set("id")} /></Field><Field label="Name"><input value={f.name} onChange={set("name")} /></Field>
      <Field label="Type"><select value={f.kind} onChange={set("kind")} style={{ width: "100%", padding: 10 }}><option value="pct">Percent off</option><option value="flat">Flat amount off</option><option value="free">Free cartons</option><option value="kit">Free kit</option></select></Field>
      {(f.kind === "pct" || f.kind === "flat") && <Field label={f.kind === "pct" ? "Percent (max 25)" : "Amount (₹)"}><input inputMode="decimal" value={f.value} onChange={set("value")} /></Field>}
      {f.kind === "free" && <><Field label="Buy cartons"><input inputMode="numeric" value={f.buy} onChange={set("buy")} /></Field><Field label="Free cartons"><input inputMode="numeric" value={f.get} onChange={set("get")} /></Field></>}
      <Field label="Minimum cartons"><input inputMode="numeric" value={f.min_cartons} onChange={set("min_cartons")} /></Field><Field label="Minimum order value incl. GST (₹)"><input inputMode="decimal" value={f.min_value} onChange={set("min_value")} /></Field>
      <Field label="SKUs (comma separated, blank = all)"><input value={f.skus} onChange={set("skus")} /></Field>
      <Field label="Audience"><select value={f.aud} onChange={set("aud")} style={{ width: "100%", padding: 10 }}><option value="all">All partners</option><option value="types">Partner types</option><option value="partners">Selected partners</option></select></Field>
      {f.aud === "types" && <Field label="Types (DLR, DST)"><input value={f.types} onChange={set("types")} /></Field>}{f.aud === "partners" && <Field label="Partner IDs"><input value={f.partners} onChange={set("partners")} /></Field>}
      <Field label="Valid from"><input type="date" value={f.from} onChange={set("from")} /></Field><Field label="Valid to"><input type="date" value={f.to} onChange={set("to")} /></Field>
      <Field label="Budget cap (₹, 0 = none)"><input inputMode="decimal" value={f.budget} onChange={set("budget")} /></Field>
      <label><input type="checkbox" checked={f.first} onChange={set("first")} style={{ width: "auto" }} /> First order only</label><label><input type="checkbox" checked={f.stack} onChange={set("stack")} style={{ width: "auto" }} /> Can stack with other schemes</label>
      <div style={{ alignSelf: "end" }}><button className="btn" disabled={!f.id || !f.name || !f.from || !f.to} onClick={save}>Save scheme</button></div></div></>}</>);
}
export default function Page() { return <Shell page="schemes">{(p) => <Inner role={p.role} />}</Shell>; }
