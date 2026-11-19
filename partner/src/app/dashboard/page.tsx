"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { inr } from "@/lib/orders";
import { isStaff, type Role } from "@/lib/roles";

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
  const tile = (label: string, value: string | number, href?: string) => (<div className="card" key={label}><div style={{ fontSize: 32, fontWeight: 800, color: "var(--teal)" }}>{value}</div><div>{href ? <Link href={href}>{label}</Link> : label}</div></div>);
  return (<><h1>Dashboard</h1>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
      {isStaff(role)
        ? STAFF.filter((t) => (!t.roles || t.roles.includes(role)) && s[t.key] != null).map((t) => tile(t.label, Number(s[t.key]), t.href))
        : [tile("Open orders", Number(s.orders_open ?? 0), "/orders/"), tile("Waiting for your payment", Number(s.orders_to_pay ?? 0), "/orders/"), tile("Orders so far", Number(s.orders_total ?? 0)), tile("Ordered value (incl. GST)", inr(Number(s.ordered_value ?? 0)))]}
    </div>
    {!isStaff(role) && <p><Link className="btn" style={{ textDecoration: "none", display: "inline-block" }} href="/orders/">Place an order</Link></p>}
  </>);
}
export default function Page() { return <Shell page="dashboard">{(p) => <Inner role={p.role} />}</Shell>; }
