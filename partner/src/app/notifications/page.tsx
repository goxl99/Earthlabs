"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { isStaff, type Role } from "@/lib/roles";

type N = { id: number; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };
type Rule = { key: string; label: string; audience: string; email: boolean; in_app: boolean; whatsapp: boolean; enabled: boolean };
type Log = { at: string; to_email: string; subject: string; status: string };
function Rules({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<Rule[]>([]); const [log, setLog] = useState<Log[]>([]); const [msg, setMsg] = useState("");
  const load = () => { supabase.from("notification_rules").select("*").order("label").then(({ data }) => setRules((data as Rule[]) ?? [])); supabase.rpc("recent_mail_log").then(({ data }) => setLog((data as Log[]) ?? [])); };
  useEffect(load, []);
  async function flip(r: Rule, f: "email" | "in_app" | "whatsapp" | "enabled") {
    const n = { ...r, [f]: !r[f] };
    const { error } = await supabase.rpc("set_notification_rule", { k: r.key, e: n.email, a: n.in_app, w: n.whatsapp, on_: n.enabled }); setMsg(error ? error.message : ""); load();
  }
  const box = (r: Rule, f: "email" | "in_app" | "whatsapp" | "enabled") => <input type="checkbox" checked={r[f]} disabled={!canEdit} onChange={() => flip(r, f)} aria-label={r.label + " " + f} />;
  return (<>
    <h2 style={{ marginTop: 24 }}>Automation rules</h2><p className="sub">Each event below is sent to the partner automatically. Switch a channel on or off, or turn the whole event off.{!canEdit && " Only Super Admin can change these."} WhatsApp only goes out once WhatsApp is connected.</p>
    {msg && <Msg kind="bad">{msg}</Msg>}
    <div className="card"><table><thead><tr><th>Event</th><th>To</th><th>E-mail</th><th>In-app</th><th>WhatsApp</th><th>On</th></tr></thead><tbody>{rules.map((r) => <tr key={r.key}><td>{r.label}</td><td>{r.audience}</td><td>{box(r, "email")}</td><td>{box(r, "in_app")}</td><td>{box(r, "whatsapp")}</td><td>{box(r, "enabled")}</td></tr>)}</tbody></table></div>
    <h2 style={{ marginTop: 24 }}>Recent e-mails</h2>
    <div className="card"><table><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>{log.map((l, i) => <tr key={i}><td>{when(l.at)}</td><td>{l.to_email}</td><td>{l.subject}</td><td>{l.status}</td></tr>)}{log.length === 0 && <tr><td colSpan={4}>Nothing sent yet.</td></tr>}</tbody></table></div></>);
}
function Inner({ role }: { role: Role }) {
  const [rows, setRows] = useState<N[]>([]); const [err, setErr] = useState("");
  async function load() { const { data, error } = await supabase.from("notifications").select("id,title,body,link,read_at,created_at").order("created_at", { ascending: false }).limit(50); if (error) setErr(error.message); else setRows((data as N[]) ?? []); }
  useEffect(() => { load(); }, []);
  async function readAll() { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); load(); }
  return (<><h1>Notifications</h1><p className="sub">Email, in-app and WhatsApp. Super Admin controls every template, recipient and trigger.</p>{err && <Msg kind="bad">{err}</Msg>}<p><button className="btn" onClick={readAll}>Mark all read</button></p>
    <div className="card">{rows.length === 0 && <p>Nothing yet.</p>}{rows.map((n) => <p key={n.id} style={{ fontWeight: n.read_at ? 400 : 700 }}>{n.title}<br /><small>{n.body} · {when(n.created_at)}</small></p>)}</div>{isStaff(role) && role !== "warehouse" && <Rules canEdit={role === "super_admin"} />}</>);
}
export default function Page() { return <Shell page="notifications">{(p) => <Inner role={p.role} />}</Shell>; }
