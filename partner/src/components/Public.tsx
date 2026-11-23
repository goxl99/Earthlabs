"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { supabase, configured } from "@/lib/supabase";
import { isKnownPartner } from "@/lib/visitor";

export type PathType = { code: string; ic: string; title: string; blurb: string; points: string[] };
/** Content shown for each partner type. Registration availability still comes from the database. */
export const PATHS: PathType[] = [
  { code: "DLR", ic: "🏪", title: "Authorized Dealer", blurb: "Sell EarthLabs herbal hand wash and eco-cleaning products to shops, workshops and institutions in your district.",
    points: ["Non-exclusive district authorisation to start", "Brand kit, samples and partner price list", "Monthly targets with a clear 100-point score", "Earn your way up to Distributor"] },
  { code: "DST", ic: "🚚", title: "Authorized Distributor", blurb: "Supply a cluster of districts and build your own network of authorised dealers.",
    points: ["A cluster of 2–3 districts", "Your own authorised dealer network", "Priority supply and a better margin slab", "Exclusive rights earned on performance"] },
];
export const JOURNEY = ["Register", "Verification", "Approval", "Agreement & certificate", "Start trading"];

/** Which partner types accept applications right now. Before the database answers, show every path. */
export function useOpenTypes() {
  const [open, setOpen] = useState<string[] | null>(null);
  useEffect(() => { if (!configured) { setOpen(null); return; } supabase.from("partner_types").select("code").eq("registration_open", true).then(({ data }) => setOpen(((data as { code: string }[]) ?? []).map((x) => x.code))); }, []);
  return open;
}

export function PublicTop({ base = "./" }: { base?: string }) {
  const [known, setKnown] = useState(false);
  useEffect(() => { setKnown(isKnownPartner()); }, []);
  return (<header className="top"><Link className="brand" href={base}>EarthLabs<small>PARTNER NETWORK</small></Link>
    <div className="row">{known ? <Link className="btn out sm" href={`${base}#signin`}>Partner login</Link> : <Link className="btn out sm" href={`${base}become/`}>Become a partner</Link>}<Link className="btn out sm" href={`${base}track/`}>Track application</Link><Link className="btn out sm" href={`${base}verify/`}>Verify certificate</Link></div></header>);
}

export function PathCards({ base = "./" }: { base?: string }) {
  const open = useOpenTypes();
  const list = PATHS.filter((p) => open === null || open.includes(p.code));
  return (<div className={`grid paths ${list.length > 1 ? "g2" : ""}`}>
    {list.map((p, i) => (<div className="path" key={p.code}><div className="path-n">0{i + 1}</div><div className="path-ic" aria-hidden="true">{p.ic}</div><h2>{p.title}</h2><p className="mini">{p.blurb}</p>
      <ul className="pts">{p.points.map((x) => <li key={x}>{x}</li>)}</ul>
      <Link className="btn" href={`${base}register/?type=${p.code}`}>Apply as {p.title.replace("Authorized ", "")} →</Link></div>))}
    {open !== null && list.length === 0 && <div className="card">Partner registration is not open right now. Please check back soon.</div>}
  </div>);
}

export function Journey() {
  return (<div className="journey"><div className="eyebrow dk">YOUR JOURNEY</div><div className="jrow">{JOURNEY.map((x, i) => (<span key={x} style={{ display: "contents" }}>{i > 0 && <div className="jline" />}<div className="jst"><i>{i + 1}</i><span>{x}</span></div></span>))}</div>
    <p className="mini" style={{ marginTop: 14 }}>Registration does not authorise trading. Every application is verified and approved by EarthLabs management.</p></div>);
}

export function Hero({ eyebrow, title, children, stats }: { eyebrow: string; title: string; children: ReactNode; stats?: [string, string][] }) {
  return (<section className="hero2"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{children}
    {stats && <div className="hero-stats">{stats.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div>}</section>);
}
