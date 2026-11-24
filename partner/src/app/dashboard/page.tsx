"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { inr } from "@/lib/orders";
import { lakh } from "@/lib/money";
import { bandKind } from "@/lib/performance";
import { BarChart, Card } from "@/components/charts";
import { Badge } from "@/components/ui";
import { isStaff, ROLE_LABEL, type Role } from "@/lib/roles";

type Stats = Record<string, number | string | null>;
const STAFF: { key: string; label: string; note: string; href: string; roles?: Role[] }[] = [
  { key: "applications_open", label: "Applicants in progress", note: "applications to review", href: "/applications/", roles: ["super_admin", "sales"] },
  { key: "partners_active", label: "Active partners", note: "dealers and distributors", href: "/partners/", roles: ["super_admin", "sales", "accounts"] },
  { key: "approvals_pending", label: "Pending approvals", note: "change requests to decide", href: "/approvals/", roles: ["super_admin"] },
  { key: "orders_pending", label: "Pending orders", note: "waiting for approval", href: "/orders/", roles: ["super_admin", "sales"] },
  { key: "orders_to_pay", label: "Payments to verify", note: "approved, waiting for payment", href: "/orders/", roles: ["super_admin", "accounts"] },
  { key: "orders_to_dispatch", label: "Ready to dispatch", note: "paid orders", href: "/orders/", roles: ["super_admin", "warehouse"] },
  { key: "low_stock", label: "Low stock", note: "SKUs at or below reorder level", href: "/inventory/", roles: ["super_admin", "warehouse"] },
];
function Tile({ label, value, note, href }: { label: string; value: string | number; note?: string; href?: string }) {
  const r = useRouter();
  return <div className={`kpi${href ? " click" : ""}`} {...(href ? { role: "link", tabIndex: 0, onClick: () => r.push(href), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); r.push(href); } } } : {})}>
    <div className="l">{label}</div><div className="v">{value}</div>{note && <div className="d">{note}</div>}</div>;
}
type Ov = Record<string, any>;
const CATS: [string, string][] = [["DLR", "Dealers"], ["DST", "Distributors"], ["STK", "Stockists"], ["INS", "Institutional"]];
function StaffDashboard({ role }: { role: Role }) {
  const [cat, setCat] = useState("all"); const [o, setO] = useState<Ov | null>(null); const [err, setErr] = useState(""); const router = useRouter();
  useEffect(() => { setO(null); supabase.rpc("dashboard_overview", { p_cat: cat === "all" ? null : cat }).then(({ data, error }) => { if (error) setErr(error.message); else setO(data as Ov); }); }, [cat]);
  const T = ({ l, v, d, to }: { l: string; v: React.ReactNode; d?: React.ReactNode; to: string }) => <Tile label={l} value={v as string} note={d as string} href={to} />;
  const head = (<div className="row"><h1>Dashboard</h1><div className="sp" />
    <div className="row"><label className="mini" htmlFor="fc">Category</label>
      <select id="fc" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All categories</option>{CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div></div>);
  if (err) return <>{head}<div className="note bad">{err}</div></>;
  if (!o) return <>{head}<p className="mini">Loading…</p></>;
  const money = !!o.money;
  const lowStock: { sku: string; name: string; left: number; reorder: number }[] = o.low_stock ?? [];
  const months: string[] = (o.chart_months ?? []).map((x: any) => x.month);
  const mon = months[months.length - 1] ?? "this month";
  const ct: any[] = o.chart_targets ?? [];
  const bandList = (rows: any[]) => <div className="tw"><table className="t"><thead><tr><th>Partner</th><th className="n">Score</th><th>Band</th></tr></thead><tbody>
    {rows.map((x) => <tr key={x.id} className="cl" tabIndex={0} onClick={() => router.push(`/partners/view/?id=${x.id}`)}><td>{x.name}</td><td className="n">{Number(x.score)}</td><td><Badge kind={bandKind(x.band)}>{x.band}</Badge></td></tr>)}
    {rows.length === 0 && <tr><td colSpan={3} style={{ color: "var(--mute)", padding: 20 }}>No verified scores yet.</td></tr>}</tbody></table></div>;
  return (<>{head}
    <p className="sub">The whole ecosystem at a glance. Click any tile to go to the screen behind it.</p>
    {role !== "warehouse" && <><h3>Partner overview</h3>
      <div className="grid g5" style={{ margin: "8px 0 16px" }}>
        <T l="Applicants in progress" v={o.apps_open} d={`${o.apps_rejected} rejected`} to="/applications/" />
        <T l="Approved partners" v={o.partners_total} d={`incl. ${o.partners_not_active} not active`} to="/partners/" />
        <T l="Active dealers / distributors" v={`${o.active_dlr} / ${o.active_dst}`} to="/partners/" />
        <T l="Stockists · Institutional" v={`${o.active_stk} · ${o.active_ins}`} to="/partners/" />
        <T l="Active vendors" v={o.vendors_active} d={`${o.vendors_pending} in verification`} to="/vendors/" />
        <T l="Pending approvals" v={o.pending_apps + o.pending_orders_approval} d={`${o.pending_apps} applications · ${o.pending_orders_approval} orders`} to="/applications/" />
        <T l="Pending agreements" v={o.pending_agreements} d="MOU drafts waiting" to="/agreements/" />
        <T l="Payments to verify" v={o.proofs_to_verify} d="proofs uploaded" to="/invoices/" />
        <T l="Promotion eligible" v={o.promotion_eligible} d="for management assessment" to="/performance/" />
        <T l="Unverified secondary" v={o.unverified_partners} d="partners with no verified data" to="/performance/" />
      </div></>}
    <h3>{money ? "Commercial overview" : "Operations overview"}</h3>
    <div className="grid g5" style={{ margin: "8px 0 16px" }}>
      {money && <>
        <T l={`Primary sales (${mon})`} v={lakh(Number(o.primary_sales_month))} d="invoiced to partners, before GST" to="/invoices/" />
        <T l={`Collections (${mon})`} v={lakh(Number(o.collections_month))} d="before GST" to="/invoices/" />
        <T l="Outstanding" v={lakh(Number(o.outstanding))} d="incl. GST" to="/invoices/" />
        <T l="Invoiced (all time)" v={lakh(Number(o.invoiced_total))} d={`${o.invoice_count} invoices`} to="/invoices/" />
        <T l="Credit limit used" v={o.credit_used_pct == null ? "Pay & carry" : `${o.credit_used_pct}%`} d="of total limits" to="/credit/" /></>}
      <T l="Pending orders" v={o.orders_pipeline} d="in the pipeline" to="/orders/" />
      <T l="Dispatches in transit" v={o.in_transit} to="/inventory/" />
      <T l="Quality / delivery issues" v={o.delivery_issues} d="damage or shortage reports" to="/inventory/" />
    </div>
    {money && <div className="grid g2">
      <Card title="Invoiced vs collected, by month (₹ lakh, before GST)"><BarChart label="Invoiced versus collected by month" labels={months} series={[{ n: "Invoiced", v: (o.chart_months ?? []).map((x: any) => Number(x.invoiced)) }, { n: "Collected", v: (o.chart_months ?? []).map((x: any) => Number(x.collected)) }]} /></Card>
      <Card title="Monthly target vs achieved by category (₹ lakh)"><BarChart label="Target versus achievement" labels={["Dealers", "Distributors", "Stockist", "Institutional"]} series={[{ n: "Target", v: ct.map((x) => Number(x.target)) }, { n: "Achieved", v: ct.map((x) => Number(x.achieved)) }]} /></Card></div>}
    {money && <div className="grid g2" style={{ marginTop: 14 }}><Card title="Top 5 partners">{bandList(o.top5 ?? [])}</Card><Card title="Bottom 5 partners">{bandList(o.bottom5 ?? [])}</Card></div>}
    <div className="grid g3" style={{ marginTop: 14 }}>
      {money && <Card title="Promotion eligibility">{(o.promotion_list ?? []).length ? (o.promotion_list as any[]).map((x) => <div className="check" key={x.id}><div style={{ flex: 1 }}><b>{x.name}</b><div className="mini">{x.from} to {x.to}</div></div><Link className="btn sm" href={`/partners/view/?id=${x.id}`}>Review</Link></div>) : <p className="mini">No partner is eligible right now.</p>}</Card>}
      <Card title="Operations watch">{lowStock.length ? lowStock.map((s) => <div className="check" key={s.sku}><Badge kind="warn">Low stock</Badge><div>{s.name}<div className="mini">{s.left} cartons-equivalent left, reorder at {s.reorder}</div></div></div>) : <p className="mini">Stock healthy.</p>}</Card>
    </div>
    <div className="note ai" style={{ marginTop: 14 }}><b>This month’s AI recommendations:</b> {o.ai_pending} waiting for a decision. <Link className="lk" href="/ai/">Open AI Intelligence</Link></div>
  </>);
}
function Inner({ role, name }: { role: Role; name: string }) {
  if (isStaff(role)) return <StaffDashboard role={role} />;
  const [s, setS] = useState<Stats | null>(null); const [err, setErr] = useState("");
  useEffect(() => { supabase.rpc("dashboard_stats").then(({ data, error }) => { if (error) setErr(error.message); else setS((data as Stats) ?? {}); }); }, []);
  if (err) return <div className="note bad">{err}</div>;
  if (!s) return <p className="mini">Loading…</p>;
  const first = (name || "").split(" ")[0] || ROLE_LABEL[role];
  return (<><h1>Welcome, {first}</h1>
    <p className="sub">{ROLE_LABEL[role]}. You only see your own business here.</p>
    <div className="grid g4"><Tile label="Open orders" value={Number(s.orders_open ?? 0)} note="in the pipeline" href="/orders/" /><Tile label="Waiting for your payment" value={Number(s.orders_to_pay ?? 0)} note="approved orders" href="/orders/" /><Tile label="Orders so far" value={Number(s.orders_total ?? 0)} /><Tile label="Ordered value" value={inr(Number(s.ordered_value ?? 0))} note="incl. GST" href="/invoices/" /></div>
    <div className="grid g2" style={{ marginTop: 14 }}><div className="card"><h3>Quick actions</h3><div className="row" style={{ marginTop: 8 }}>
      <Link className="btn pri" href="/orders/#place">Place an order</Link><Link className="btn" href="/invoices/">Pay an invoice</Link><Link className="btn" href="/agreements/">Agreement &amp; certificate</Link></div>
      <div className="mini" style={{ marginTop: 12 }}>{role === "dealer" ? "Dealers report monthly sales to outlets so your secondary sales count towards your score." : "Distributors can see their authorised dealer network."}</div></div>
      <div className="card"><h3>Notifications</h3><p className="mini">Your latest messages from EarthLabs appear in <Link className="lk" href="/notifications/">Notifications</Link>.</p></div></div>
  </>);
}
export default function Page() { return <Shell page="dashboard">{(p) => <Inner role={p.role} name={p.full_name} />}</Shell>; }
