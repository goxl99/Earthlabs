"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase, configured } from "@/lib/supabase";
import { navFor, envOf, ROLE_LABEL, type Env, type Role } from "@/lib/roles";

export type Profile = { id: string; role: Role; full_name: string; partner_id: string | null; active: boolean };

/** Which count (from nav_counts) belongs to which menu item. */
const NAVKEY: Record<string, string> = { appr: "appr", apps: "apps", agree: "agree", orders: "orders", fin: "fin", ai: "ai", proc: "proc" };
const ENVS: { k: Env | "public"; label: string }[] = [
  { k: "internal", label: "Internal portal" }, { k: "partner", label: "Partner portal" },
  { k: "vendor", label: "Vendor portal" }, { k: "public", label: "Public website" },
];

/** Signs the user in, loads their profile, and shows only the screens their role may open.
 *  Layout (top bar, portal switch, grouped side menu) follows the approved review prototype. */
export default function Shell({ page, children }: { page: string; children: (p: Profile) => ReactNode }) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [open, setOpen] = useState(false); const [mods, setMods] = useState<Record<string, boolean>>({});
  const [ct, setCt] = useState<Record<string, number>>({});
  const path = usePathname() ?? "";
  useEffect(() => {
    if (!configured) { setP(null); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { location.href = "./../"; return; }
      const { data: prof } = await supabase.from("profiles").select("id,role,full_name,partner_id,active").eq("id", data.user.id).single();
      setP((prof as Profile) ?? null);
      if (prof && ["super_admin", "sales", "accounts", "warehouse"].includes((prof as Profile).role)) supabase.rpc("nav_counts").then(({ data: c }) => setCt((c as Record<string, number>) ?? {}));
      supabase.rpc("my_modules").then(({ data: m }) => { if (m) setMods(m as Record<string, boolean>); });
    });
  }, []);
  if (p === undefined) return <main className="main">Loading…</main>;
  if (!configured) return <main className="main"><div className="note">Supabase is not configured yet. Copy .env.example to .env.local and add the project URL and publishable key.</div></main>;
  if (!p) return <main className="main"><div className="note">No profile found. Ask Super Admin to activate your account.</div></main>;
  if (!p.active) return <main className="main"><h1>Waiting for approval</h1><div className="note">Your account is created. EarthLabs will activate it soon.</div></main>;

  const env = envOf(p.role);
  const items = navFor(p.role, mods);
  // Highlight only the first item that points at this screen (partner menu has two entries for orders and performance).
  const current = items.find((n) => n.href.split("#")[0].replace(/\/$/, "").endsWith(page.replace(/\/$/, "")) || path.replace(/\/$/, "").endsWith(n.href.split("#")[0].replace(/\/$/, "")))?.key;
  let lastGroup = "";
  const initial = (p.full_name || ROLE_LABEL[p.role]).trim()[0]?.toUpperCase() ?? "?";
  return (
    <>
      <div className="top no-print">
        <button className="btn sm mob" onClick={() => setOpen(!open)} aria-expanded={open}>☰ Menu</button>
        <Link href="/dashboard/" className="brand">EarthLabs<small>PARTNER &amp; DISTRIBUTION SYSTEM</small></Link>
        <div className="seg" role="group" aria-label="Portal">
          {ENVS.map((e) => e.k === "public"
            ? <button key={e.k} aria-pressed="false" onClick={() => { location.href = "./../"; }}>{e.label}</button>
            : <button key={e.k} aria-pressed={env === e.k} disabled={env !== e.k} style={env !== e.k ? { opacity: 0.55, cursor: "default" } : undefined} title={env !== e.k ? "Your role does not open this portal" : undefined}>{e.label}</button>)}
        </div>
        <div className="who">
          <span className="av" title={p.full_name}>{initial}</span>
          <span className="mini" style={{ color: "var(--slate)" }}>{p.full_name || "Signed in"} · {ROLE_LABEL[p.role]}</span>
          <button className="btn sm" onClick={async () => { await supabase.auth.signOut(); location.href = "./../"; }}>Sign out</button>
        </div>
      </div>
      <div className="shell">
        <nav className={`side no-print ${open ? "open" : ""}`} aria-label="Main">
          {items.map((n) => {
            const head = n.group && n.group !== lastGroup ? <div className="grp" key={`g-${n.group}`}>{n.group}</div> : null;
            if (n.group) lastGroup = n.group;
            return [head, <Link key={n.key} className="nav" href={n.href} onClick={() => setOpen(false)} aria-current={n.key === current ? "page" : undefined}><span className="ic">{n.icon}</span>{n.label}{ct[NAVKEY[n.key]] ? <span className="ct">{ct[NAVKEY[n.key]]}</span> : null}</Link>];
          })}
        </nav>
        <main className="main" id="main">{children(p)}</main>
      </div>
    </>
  );
}
