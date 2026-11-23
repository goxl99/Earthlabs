"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { supabase, configured } from "@/lib/supabase";
import { navFor, isStaff, ROLE_LABEL, type Role } from "@/lib/roles";

export type Profile = { id: string; role: Role; full_name: string; partner_id: string | null; active: boolean };

/** Signs the user in, loads their profile, and shows only the screens their role may open. */
export default function Shell({ page, children }: { page: string; children: (p: Profile) => ReactNode }) {
  const [p, setP] = useState<Profile | null | undefined>(undefined); const [mods, setMods] = useState<Record<string, boolean>>({}); const [open, setOpen] = useState(false); const [counts, setCounts] = useState<Record<string, number | string | null>>({});
  useEffect(() => {
    if (!configured) { setP(null); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { location.href = "./../"; return; }
      const { data: prof } = await supabase.from("profiles").select("id,role,full_name,partner_id,active").eq("id", data.user.id).single();
      setP((prof as Profile) ?? null);
      const { data: m } = await supabase.rpc("my_modules"); if (m) setMods(m as Record<string, boolean>);
      const { data: st } = await supabase.rpc("dashboard_stats"); if (st) setCounts(st as Record<string, number | string | null>);
    });
  }, []);
  if (p === undefined) return <main className="main">Loading…</main>;
  if (!configured) return <main className="main"><div className="note">Supabase is not configured yet. Copy .env.example to .env.local and add the project URL and publishable key.</div></main>;
  if (!p) return <main className="main"><div className="note">No profile found. Ask Super Admin to activate your account.</div></main>;
  if (!p.active) return <main className="main"><h1>Waiting for approval</h1><div className="note">Your account is created. EarthLabs will activate it soon.</div></main>;
  const items = navFor(p.role, mods);
  const order = ["Overview", "Partners", "Commercial", "Intelligence", "Admin", "Vendor"];
  const badge: Record<string, number | undefined> = { "/applications/": counts.applications_open as number, "/approvals/": counts.approvals_pending as number, "/orders/": isStaff(p.role) ? ((counts.orders_pending as number) || 0) + ((counts.orders_to_pay as number) || 0) : (counts.orders_to_pay as number) };
  const initials = (p.full_name || "EL").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div>
      <a className="skip" href="#content">Skip to content</a>
      <header className="top">
        <button className="btn out sm mob" aria-expanded={open} aria-controls="sidenav" onClick={() => setOpen(!open)}>☰ Menu</button>
        <Link className="brand" href="/dashboard/">EarthLabs<small>PARTNER PORTAL</small></Link>
        <div className="who"><div className="nm"><b>{p.full_name || "Signed in"}</b><span>{ROLE_LABEL[p.role]}</span></div><div className="av" aria-hidden="true">{initials}</div>
          <button className="btn out sm" onClick={async () => { await supabase.auth.signOut(); location.href = "./../"; }}>Sign out</button></div>
      </header>
      <div className="shell">
        <nav className={"side" + (open ? " open" : "")} id="sidenav" aria-label="Main">
          {order.map((g) => { const list = items.filter((n) => (n.grp ?? "Overview") === g); if (!list.length) return null;
            return (<div key={g}><div className="grp">{g}</div>{list.map((n) => { const ct = badge[n.href]; return (
              <Link key={n.href} className="nav" href={n.href} onClick={() => setOpen(false)} aria-current={n.href.includes(page) ? "page" : undefined}><span className="ic" aria-hidden="true">{n.ic}</span>{n.label}{ct ? <span className="ct" aria-label={`${ct} waiting`}>{ct}</span> : null}</Link>); })}</div>); })}
        </nav>
        <main className="main" id="content" tabIndex={-1}>{children(p)}</main>
      </div>
    </div>
  );
}
