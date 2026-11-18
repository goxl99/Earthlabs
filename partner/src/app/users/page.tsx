"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/roles";

type U = { id: string; role: Role; full_name: string; partner_id: string | null; active: boolean };
type T = { code: string; name: string; registration_open: boolean };
const ROLES = Object.keys(ROLE_LABEL) as Role[];

function Inner() {
  const [us, setUs] = useState<U[]>([]); const [ts, setTs] = useState<T[]>([]); const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const a = await supabase.from("profiles").select("id,role,full_name,partner_id,active").order("active").order("created_at", { ascending: false }).limit(100);
    const b = await supabase.from("partner_types").select("code,name,registration_open").order("level");
    setUs((a.data as U[]) ?? []); setTs((b.data as T[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function save(u: U, patch: Partial<U>) { const { error } = await supabase.from("profiles").update(patch).eq("id", u.id); setMsg(error ? error.message : "Saved"); load(); }
  async function link(u: U) { const pid = prompt("Partner ID to link (for example ELP-DLR-0001)"); if (!pid) return; const { error } = await supabase.rpc("link_user_to_partner", { uid: u.id, pid }); setMsg(error ? error.message : "Linked and activated"); load(); }
  async function sw(t: T) { const { error } = await supabase.from("partner_types").update({ registration_open: !t.registration_open }).eq("code", t.code); setMsg(error ? error.message : `${t.name} registration ${t.registration_open ? "closed" : "opened"}`); load(); }
  return (<><h1>Users &amp; access</h1>{msg && <Msg>{msg}</Msg>}
    <h2>Who can apply on the public site</h2>
    <div className="card">{ts.map((t) => <p key={t.code}><b>{t.name}</b> <button className="btn" onClick={() => sw(t)}>{t.registration_open ? "Open: click to hide" : "Hidden: click to show"}</button></p>)}</div>
    <h2>People</h2>
    <div className="card"><table><thead><tr><th>Name</th><th>Role</th><th>Partner</th><th>Status</th><th></th></tr></thead><tbody>{us.map((u) => (<tr key={u.id}><td>{u.full_name || u.id.slice(0, 8)}</td>
      <td><select value={u.role} onChange={(e) => save(u, { role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td><td>{u.partner_id ?? "—"}</td><td>{u.active ? "Active" : "Waiting"}</td>
      <td><button className="btn" onClick={() => save(u, { active: !u.active })}>{u.active ? "Deactivate" : "Activate"}</button> <button className="btn" onClick={() => link(u)}>Link partner</button></td></tr>))}</tbody></table></div></>);
}
export default function Page() { return <Shell page="users">{(p) => (p.role === "super_admin" ? <Inner /> : <Msg>Only Super Admin can manage users.</Msg>)}</Shell>; }
