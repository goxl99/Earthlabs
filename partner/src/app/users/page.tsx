"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { ROLE_LABEL, NAV, type Role } from "@/lib/roles";
import { when } from "@/components/ui";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";
import { callFn } from "@/lib/fn";
import { STAFF_ROLES } from "@/lib/staffRoles";

type U = { id: string; role: Role; full_name: string; partner_id: string | null; active: boolean; department?: string | null; territory?: string | null };
type T = { code: string; name: string; registration_open: boolean };
const ROLES = Object.keys(ROLE_LABEL) as Role[];
const MODULES: [string, string][] = [["applications", "Applications"], ["partners", "Partners"], ["territory", "Territory"], ["agreements", "Agreements"], ["catalogue", "Products & pricing"], ["schemes", "Schemes"], ["inventory", "Inventory"], ["invoices", "Invoices & ledger"], ["vendors", "Vendors"], ["procurement", "Procurement"], ["rfq", "RFQs & quotes"], ["bom", "Material planning"], ["network", "My network"], ["performance", "Performance"], ["reports", "Reports"], ["credit", "Credit ladder"], ["ai", "AI Intelligence"], ["orders", "Orders"]];

function Inner({ tab }: { tab: string }) {
  const [us, setUs] = useState<U[]>([]); const [ts, setTs] = useState<T[]>([]); const [msg, setMsg] = useState(""); const [mods, setMods] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    let a: { data: unknown; error: unknown } = await supabase.from("profiles").select("id,role,full_name,partner_id,active,department,territory").order("active").order("created_at", { ascending: false }).limit(100);
    if (a.error) a = await supabase.from("profiles").select("id,role,full_name,partner_id,active").order("active").order("created_at", { ascending: false }).limit(100);   // before migration 024 is applied
    const b = await supabase.from("partner_types").select("code,name,registration_open").order("level");
    setMods(((await supabase.rpc("my_modules")).data as Record<string, boolean>) ?? {});
    setUs((a.data as U[]) ?? []); setTs((b.data as T[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function save(u: U, patch: Partial<U>) { const { error } = await supabase.from("profiles").update(patch).eq("id", u.id); setMsg(error ? error.message : "Saved"); load(); }
  async function link(u: U) { const f = await askForm("Link login to a partner", [{ name: "pid", label: "Partner ID", required: true, hint: "For example ELP-DLR-0001" }], { ok: "Link and activate" }); if (!f) return; const pid = f.pid.trim(); const { error } = await supabase.rpc("link_user_to_partner", { uid: u.id, pid }); setMsg(error ? error.message : "Linked and activated"); load(); }
  async function createUser() {
    const v = await askForm("Create user", [
      { name: "full_name", label: "Full name", required: true }, { name: "email", label: "E-mail (login ID)", required: true },
      { name: "role", label: "Role", type: "select", required: true, options: [...STAFF_ROLES], value: "sales" },
      { name: "department", label: "Department" }, { name: "territory", label: "Territory (district or region)" }], { ok: "Create and e-mail login", cols: 2, intro: "A temporary password is e-mailed. The person must change it at first sign-in." });
    if (!v) return;
    const r = await callFn("create-staff-user", v); setMsg(r.ok ? (r.data?.emailed === false ? "User created, but the e-mail could not be sent. Use Forgot password to set one." : "User created and login e-mailed") : (r.error ?? "Failed")); load();
  }
  async function mod(k: string, on: boolean) { const { error } = await supabase.rpc("set_module", { k, on_: on }); setMsg(error ? error.message : `${k} ${on ? "switched on" : "switched off"}`); load(); }
  async function sw(t: T) { const { error } = await supabase.from("partner_types").update({ registration_open: !t.registration_open }).eq("code", t.code); setMsg(error ? error.message : `${t.name} registration ${t.registration_open ? "closed" : "opened"}`); load(); }
  return (<><h1>Users &amp; access</h1><p className="sub">Super Admin creates logins, assigns roles, departments and territories, and decides who sees which screen. The same rules are enforced by the API and database, not just the menu.</p>{msg && <Msg>{msg}</Msg>}
    {tab === "registration" && <><h2>Who can apply on the public site</h2>
    <div className="card">{ts.map((t) => <p key={t.code}><b>{t.name}</b> <button className="btn" onClick={() => sw(t)}>{t.registration_open ? "Open: click to hide" : "Hidden: click to show"}</button></p>)}</div></>}
    {tab === "access" && <><h2>Modules</h2>
    <div className="card"><p className="mini" style={{ marginTop: 0 }}>Switching a module off hides it from every menu. The RFQ, material planning and My network modules also refuse their actions in the database. Dashboard, users, audit, approvals and notifications are core and stay on.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 6 }}>{MODULES.map(([k, n]) => { const on = mods[k] !== false; return <label key={k} style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={on} onChange={() => mod(k, !on)} /> {n}</label>; })}</div></div></>}
    {tab === "users" && <><div className="row"><h2>People</h2><div className="sp" /><button className="btn pri" onClick={createUser}>Create user</button></div>{msg && <Msg>{msg}</Msg>}
    <div className="card"><table><thead><tr><th>Name</th><th>Role</th><th>Partner</th><th>Status</th><th></th></tr></thead><tbody>{us.map((u) => (<tr key={u.id}><td>{u.full_name || u.id.slice(0, 8)}{(u.department || u.territory) && <div className="mini">{[u.department, u.territory].filter(Boolean).join(" · ")}</div>}</td>
      <td><select value={u.role} onChange={(e) => save(u, { role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td><td>{u.partner_id ?? "—"}</td><td>{u.active ? "Active" : "Waiting"}</td>
      <td><button className="btn" onClick={() => save(u, { active: !u.active })}>{u.active ? "Deactivate" : "Activate"}</button> <button className="btn" onClick={() => link(u)}>Link partner</button></td></tr>))}</tbody></table></div></>}</>);
}
function Access({ tab }: { tab: string }) {
  const roles = ROLES; const [lg, setLg] = useState<{ at: string; device: string | null; user_id: string }[]>([]); const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => { supabase.from("login_history").select("at,device,user_id").order("at", { ascending: false }).limit(30).then(async ({ data }) => { const rows = (data as typeof lg) ?? []; setLg(rows); const ids = [...new Set(rows.map((r) => r.user_id))]; if (ids.length) { const { data: p } = await supabase.from("profiles").select("id,full_name").in("id", ids); setNames(Object.fromEntries(((p as { id: string; full_name: string }[]) ?? []).map((x) => [x.id, x.full_name || x.id.slice(0, 8)]))); } }); }, []);
  return (<>
    {tab === "access" && <><h2 style={{ marginTop: 24 }}>What each role can open</h2><p className="sub">Screens by role. Each screen also checks the person&apos;s role on the server, so hiding a menu is never the only protection.</p>
    <div className="card" style={{ overflowX: "auto" }}><table><thead><tr><th>Screen</th>{roles.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead><tbody>{NAV.map((n) => <tr key={n.href}><td>{n.label}</td>{roles.map((r) => <td key={r} style={{ textAlign: "center" }}>{n.roles.includes(r) ? "✓" : "—"}</td>)}</tr>)}</tbody></table></div>
</>}
    {tab === "login" && <><h2 style={{ marginTop: 24 }}>Recent sign-ins</h2>
    <div className="card"><table><thead><tr><th>User</th><th>When</th><th>Device</th></tr></thead><tbody>{lg.map((l, i) => <tr key={i}><td>{names[l.user_id] ?? l.user_id.slice(0, 8)}</td><td>{when(l.at)}</td><td className="mini">{(l.device ?? "").slice(0, 90)}</td></tr>)}{lg.length === 0 && <tr><td colSpan={3}>Sign-ins are recorded from now on.</td></tr>}</tbody></table></div></>}</>);
}
const TABS: [string, string][] = [["users", "Users"], ["access", "Access Control Manager"], ["registration", "Registration types"], ["login", "Login history"]];
function Page_() {
  const [tab, setTab] = useState("users");
  return (<><div className="tabs" role="tablist">{TABS.map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className="tabbtn" onClick={() => setTab(k)}>{n}</button>)}</div><Inner tab={tab} /><Access tab={tab} /></>);
}
export default function Page() { return <Shell page="users">{(p) => (p.role === "super_admin" ? <Page_ /> : <Msg>Only Super Admin can manage users.</Msg>)}</Shell>; }
