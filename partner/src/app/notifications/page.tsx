"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";

type N = { id: number; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };
function Inner() {
  const [rows, setRows] = useState<N[]>([]); const [err, setErr] = useState("");
  async function load() { const { data, error } = await supabase.from("notifications").select("id,title,body,link,read_at,created_at").order("created_at", { ascending: false }).limit(50); if (error) setErr(error.message); else setRows((data as N[]) ?? []); }
  useEffect(() => { load(); }, []);
  async function readAll() { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); load(); }
  return (<><h1>Notifications</h1><p className="sub">Email, in-app and WhatsApp. Super Admin controls every template, recipient and trigger.</p>{err && <Msg kind="bad">{err}</Msg>}<p><button className="btn" onClick={readAll}>Mark all read</button></p>
    <div className="card">{rows.length === 0 && <p>Nothing yet.</p>}{rows.map((n) => <p key={n.id} style={{ fontWeight: n.read_at ? 400 : 700 }}>{n.title}<br /><small>{n.body} · {when(n.created_at)}</small></p>)}</div></>);
}
export default function Page() { return <Shell page="notifications">{() => <Inner />}</Shell>; }
