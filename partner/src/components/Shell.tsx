"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { supabase, configured } from "@/lib/supabase";
import { navFor, ROLE_LABEL, type Role } from "@/lib/roles";

export type Profile = { id: string; role: Role; full_name: string; partner_id: string | null; active: boolean };

/** Signs the user in, loads their profile, and shows only the screens their role may open. */
export default function Shell({ page, children }: { page: string; children: (p: Profile) => ReactNode }) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    if (!configured) { setP(null); return; }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { location.href = "./../"; return; }
      const { data: prof } = await supabase.from("profiles").select("id,role,full_name,partner_id,active").eq("id", data.user.id).single();
      setP((prof as Profile) ?? null);
    });
  }, []);
  if (p === undefined) return <main className="main">Loading…</main>;
  if (!configured) return <main className="main"><div className="note">Supabase is not configured yet. Copy .env.example to .env.local and add the project URL and publishable key.</div></main>;
  if (!p) return <main className="main"><div className="note">No profile found. Ask Super Admin to activate your account.</div></main>;
  if (!p.active) return <main className="main"><h1>Waiting for approval</h1><div className="note">Your account is created. EarthLabs will activate it soon.</div></main>;
  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand">EarthLabs</div>
        {navFor(p.role).map((n) => <Link key={n.href} href={n.href} aria-current={n.href.includes(page) ? "page" : undefined}>{n.label}</Link>)}
        <a href="#" onClick={async (e) => { e.preventDefault(); await supabase.auth.signOut(); location.href = "./../"; }}>Sign out</a>
      </nav>
      <main className="main"><div style={{ marginBottom: 18, color: "#6b7a86" }}>{p.full_name || "Signed in"} · {ROLE_LABEL[p.role]}</div>{children(p)}</main>
    </div>
  );
}
