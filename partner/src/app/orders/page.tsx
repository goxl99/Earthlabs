"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { actionsFor, inr, STATUS_HELP, type OrderAction, type OrderStatus, type Quote } from "@/lib/orders";
import { isStaff, type Role } from "@/lib/roles";

type Order = { id: string; partner_id: string; status: OrderStatus; total: number; discount: number; lead_days: number | null; eta_from: string | null; eta_to: string | null; hold_reason: string | null; cancel_reason: string | null; created_at: string; applied: { name: string; amt: number }[] };
type Line = { order_id: string; sku: string; cartons: number; unit_price: number; amount: number; short_cartons: number };
type Ev = { at: string; status: string; note: string | null };
type Item = { sku: string; name: string; pack_size: number; moq: number; mrp: number; price: number };

function Place({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<Item[]>([]); const [cart, setCart] = useState<Record<string, number>>({}); const [q, setQ] = useState<Quote | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.rpc("my_price_list").then(({ data }) => setItems((data as Item[]) ?? [])); }, []);
  const lines = Object.entries(cart).filter(([, c]) => c > 0).map(([sku, cartons]) => ({ sku, cartons }));
  useEffect(() => {
    if (!lines.length) { setQ(null); setErr(""); return; }
    const t = setTimeout(async () => { const { data, error } = await supabase.rpc("quote_order", { items: lines }); if (error) { setErr(error.message); setQ(null); } else { setErr(""); setQ(data as Quote); } }, 300);
    return () => clearTimeout(t);
  }, [JSON.stringify(lines)]); // eslint-disable-line react-hooks/exhaustive-deps
  async function place() { setBusy(true); const { data, error } = await supabase.rpc("place_order", { items: lines }); setBusy(false); if (error) setErr(error.message); else { setCart({}); setQ(null); setErr(""); alert(`Order ${data} placed. EarthLabs will approve it, then you can pay.`); onDone(); } }
  return (<><h2>Place an order</h2><div className="card"><table><thead><tr><th>Product</th><th>Your price / unit (ex GST)</th><th>Units / carton</th><th>Min cartons</th><th>Cartons</th></tr></thead><tbody>
    {items.map((i) => (<tr key={i.sku}><td>{i.name}<div style={{ fontSize: 12 }}>MRP {inr(i.mrp)}</div></td><td>{inr(i.price)}</td><td>{i.pack_size}</td><td>{i.moq}</td><td><input aria-label={`Cartons of ${i.name}`} style={{ width: 80, margin: 0 }} inputMode="numeric" value={cart[i.sku] ?? ""} onChange={(e) => setCart({ ...cart, [i.sku]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></td></tr>))}
    {items.length === 0 && <tr><td colSpan={5}>No products are available for you yet.</td></tr>}</tbody></table>
    {err && <div style={{ marginTop: 10 }}><Msg kind="bad">{err}</Msg></div>}
    {q && <div style={{ marginTop: 14 }}>
      {q.hints.map((h) => <div className="note" style={{ marginBottom: 6 }} key={h}>💡 {h}</div>)}
      <table><tbody><tr><td>Goods value</td><td style={{ textAlign: "right" }}>{inr(q.taxable)}</td></tr>
        {q.applied.map((a) => <tr key={a.id}><td>Scheme: {a.name}</td><td style={{ textAlign: "right" }}>{a.kind === "kit" ? "Free kit" : "− " + inr(a.amt)}</td></tr>)}
        <tr><td>GST 18%</td><td style={{ textAlign: "right" }}>{inr(q.gst)}</td></tr><tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{inr(q.total)}</b></td></tr></tbody></table>
      {q.show_lead && <p>🚚 Delivery about {q.lead_days} days after payment is confirmed{q.short_cartons > 0 ? ` (${q.short_cartons} carton(s) will be made to order)` : ""}.</p>}
      <button className="btn" disabled={busy} onClick={place}>{busy ? "Placing…" : "Place order"}</button></div>}</div></>);
}

function Inner({ role }: { role: Role }) {
  const staff = isStaff(role); const [orders, setOrders] = useState<Order[]>([]); const [open, setOpen] = useState<string | null>(null); const [lines, setLines] = useState<Line[]>([]); const [ev, setEv] = useState<Ev[]>([]);
  const [filter, setFilter] = useState(""); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    let q = supabase.from("orders").select("id,partner_id,status,total,discount,lead_days,eta_from,eta_to,hold_reason,cancel_reason,created_at,applied").order("created_at", { ascending: false }).limit(50);
    if (filter) q = q.eq("status", filter); setOrders(((await q).data as Order[]) ?? []);
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  async function show(id: string) {
    if (open === id) { setOpen(null); return; } setOpen(id);
    setLines(((await supabase.from("order_lines").select("order_id,sku,cartons,unit_price,amount,short_cartons").eq("order_id", id)).data as Line[]) ?? []);
    setEv(((await supabase.from("order_events").select("at,status,note").eq("order_id", id).order("at")).data as Ev[]) ?? []);
  }
  async function act(o: Order, a: OrderAction) {
    let fn = "", args: Record<string, unknown> = { oid: o.id };
    if (a === "approve") fn = "approve_order";
    else if (a === "deliver") fn = "deliver_order";
    else if (a === "resume") fn = "resume_order";
    else if (a === "hold" || a === "cancel") { const why = prompt(a === "hold" ? "Reason for holding (the partner sees this)" : "Reason for cancelling (the partner sees this)"); if (!why) return; fn = a === "hold" ? "hold_order" : "cancel_order"; args = { oid: o.id, why }; }
    else if (a === "pay") { const utr = prompt(`UTR / reference number for ${inr(o.total)}`); if (!utr) return; const amt = prompt("Amount received (₹)", String(o.total)); if (!amt) return; fn = "confirm_order_payment"; args = { oid: o.id, utr, amt: Number(amt) }; }
    else if (a === "dispatch") { const vehicle = prompt("Vehicle number"); if (vehicle === null) return; const lr = prompt("LR / docket number") ?? ""; const batch = prompt("QC-approved batch reference") ?? ""; fn = "dispatch_order"; args = { oid: o.id, vehicle, lr, batch }; }
    const { error } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : "Done" }); load(); if (open === o.id) { setOpen(null); }
  }
  const [refresh, setRefresh] = useState(0);
  return (<><h1>{staff ? "Orders" : "My orders"}</h1>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    {!staff && <Place onDone={() => { setRefresh(refresh + 1); load(); }} />}
    <h2>{staff ? "Order queue" : "Order history"}</h2>
    {staff && <p><select aria-label="Filter by status" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All statuses</option>{["Pending Approval", "Approved", "Payment Confirmed", "Dispatched", "Delivered", "On hold", "Cancelled"].map((s) => <option key={s}>{s}</option>)}</select></p>}
    <div className="card"><table><thead><tr><th>Order</th>{staff && <th>Partner</th>}<th>Placed</th><th>Total incl. GST</th><th>Status</th><th>Expected</th><th></th></tr></thead><tbody>
      {orders.map((o) => (<><tr key={o.id}><td><a href="#" onClick={(e) => { e.preventDefault(); show(o.id); }}>{o.id}</a></td>{staff && <td>{o.partner_id}</td>}<td>{when(o.created_at)}</td><td>{inr(o.total)}</td>
        <td>{o.status}{!staff && <div style={{ fontSize: 12 }}>{STATUS_HELP[o.status]}</div>}{o.hold_reason && <div style={{ fontSize: 12 }}>Reason: {o.hold_reason}</div>}{o.cancel_reason && <div style={{ fontSize: 12 }}>Reason: {o.cancel_reason}</div>}</td>
        <td>{o.eta_from ? `${when(o.eta_from)} to ${when(o.eta_to)}` : ""}</td>
        <td style={{ whiteSpace: "nowrap" }}>{actionsFor(role, o.status).map((a) => <button key={a} className="btn" style={{ marginRight: 6 }} onClick={() => act(o, a)}>{({ approve: "Approve", pay: "Confirm payment", dispatch: "Dispatch", deliver: "Mark delivered", hold: "Hold", resume: "Resume", cancel: "Cancel" } as const)[a]}</button>)}</td></tr>
        {open === o.id && <tr key={o.id + "d"}><td colSpan={7}><table><tbody>{lines.map((l) => <tr key={l.sku}><td>{l.sku}</td><td>{l.cartons} cartons</td><td>{inr(l.unit_price)} / unit</td><td>{inr(l.amount)}</td><td>{l.short_cartons > 0 ? `${l.short_cartons} to be made` : ""}</td></tr>)}</tbody></table>
          {o.applied?.length > 0 && <p>Schemes applied: {o.applied.map((a) => a.name).join(", ")} (− {inr(o.discount)})</p>}
          <ul>{ev.map((e, i) => <li key={i}>{when(e.at)} · {e.status}{e.note ? ` · ${e.note}` : ""}</li>)}</ul></td></tr>}</>))}
      {orders.length === 0 && <tr><td colSpan={7}>No orders yet.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="orders">{(p) => <Inner role={p.role} />}</Shell>; }
