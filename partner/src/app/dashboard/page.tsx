"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { inr } from "@/lib/orders";
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
function Inner({ role, name }: { role: Role; name: string }) {
  const [s, setS] = useState<Stats | null>(null); const [err, setErr] = useState("");
  useEffect(() => { supabase.rpc("dashboard_stats").then(({ data, error }) => { if (error) setErr(error.message); else setS((data as Stats) ?? {}); }); }, []);
  if (err) return <div className="note bad">{err}</div>;
  if (!s) return <p className="mini">Loading…</p>;
  if (isStaff(role)) {
    const tiles = STAFF.filter((t) => (!t.roles || t.roles.includes(role)) && s[t.key] != null);
    return (<><h1>Dashboard</h1>
      <p className="sub">The whole ecosystem at a glance. Click any tile to go to the screen behind it.</p>
      <h3>Partner overview</h3>
      <div className="grid g4" style={{ margin: "8px 0 16px" }}>{tiles.map((t) => <Tile key={t.key} label={t.label} value={Number(s[t.key])} note={t.note} href={t.href} />)}</div>
      {role === "super_admin" && <div className="note ai"><b>This month’s AI recommendations:</b> AI recommends and management approves. <Link className="lk" href="/ai/">Open AI Intelligence</Link></div>}
    </>);
  }
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
