"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { inr } from "@/lib/orders";
import { isStaff, type Role } from "@/lib/roles";
import DashCharts from "@/components/DashCharts";

type Stats = Record<string, number | string | null>;
const STAFF: { key: string; label: string; href: string; roles?: Role[] }[] = [
  { key: "applications_open", label: "Applications to review", href: "/applications/", roles: ["super_admin", "sales"] },
  { key: "orders_pending", label: "Orders waiting for approval", href: "/orders/", roles: ["super_admin", "sales"] },
  { key: "orders_to_pay", label: "Approved, waiting for payment", href: "/orders/", roles: ["super_admin", "accounts"] },
  { key: "orders_to_dispatch", label: "Paid, ready to dispatch", href: "/orders/", roles: ["super_admin", "warehouse"] },
  { key: "low_stock", label: "SKUs at or below reorder level", href: "/inventory/", roles: ["super_admin", "warehouse"] },
  { key: "approvals_pending", label: "Change requests to decide", href: "/approvals/", roles: ["super_admin"] },
  { key: "partners_active", label: "Active partners", href: "/partners/", roles: ["super_admin", "sales", "accounts"] },
];
function Inner({ role }: { role: Role }) {
  const [s, setS] = useState<Stats | null>(null); const [err, setErr] = useState("");
  useEffect(() => { supabase.rpc("dashboard_stats").then(({ data, error }) => { if (error) setErr(error.message); else setS((data as Stats) ?? {}); }); }, []);
  if (err) return <div className="note">{err}</div>;
  if (!s) return <p>Loading…</p>;
  const tile = (label: string, value: string | number, href?: string, hint?: string) => { const inner = (<><div className="l">{label}</div><div className="v">{value}</div><div className="d">{hint ?? (href ? "Open →" : "\u00a0")}</div></>); return href ? <Link className="kpi" key={label} href={href}>{inner}</Link> : <div className="kpi" key={label}>{inner}</div>; };
  return (<><h1>Dashboard</h1><p className="sub">{isStaff(role) ? "What needs your attention right now." : "Your orders and payments at a glance."}</p>
    <div className="kpis">
      {isStaff(role)
        ? STAFF.filter((t) => (!t.roles || t.roles.includes(role)) && s[t.key] != null).map((t) => tile(t.label, Number(s[t.key]), t.href))
        : [tile("Open orders", Number(s.orders_open ?? 0), "/orders/"), tile("Waiting for your payment", Number(s.orders_to_pay ?? 0), "/orders/"), tile("Orders so far", Number(s.orders_total ?? 0)), tile("Ordered value (incl. GST)", inr(Number(s.ordered_value ?? 0)))]}
    </div>
    {["super_admin", "sales", "accounts"].includes(role) && <DashCharts />}
    {!isStaff(role) && <p><Link className="btn gold-fill" href="/orders/">Place an order</Link></p>}
  </>);
}
export default function Page() { return <Shell page="dashboard">{(p) => <Inner role={p.role} />}</Shell>; }
