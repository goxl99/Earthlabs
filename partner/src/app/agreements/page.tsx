"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { parseFieldMap, templateFileOk, safeName } from "@/lib/mou";
import type { Role } from "@/lib/roles";

type A = { id: string; partner_id: string; status: string; sent_at: string | null; signed_at: string | null; template_id: string | null };
type T = { id: string; name: string; version: number; type_code: string | null; active: boolean };
type Cert = { code: string; partner_id: string; issued_at: string; revoked: boolean };
function Inner({ role }: { role: Role }) {
  const isSuper = role === "super_admin"; const canPrepare = isSuper || role === "sales"; const staff = ["super_admin", "sales", "accounts", "warehouse"].includes(role);
  const [ag, setAg] = useState<A[]>([]); const [tp, setTp] = useState<T[]>([]); const [certs, setCerts] = useState<Cert[]>([]); const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const [pid, setPid] = useState(""); const [tpl, setTpl] = useState(""); const [name, setName] = useState(""); const [type, setType] = useState(""); const [map, setMap] = useState("{{PARTNER_NAME}} = partner_name\n{{PARTNER_ID}} = partner_id");
  const say = (m: string, b = false) => { setMsg(m); setBad(b); };
  async function load() {
    setAg(((await supabase.from("agreements").select("id,partner_id,status,sent_at,signed_at,template_id").order("created_at", { ascending: false }).limit(50)).data as A[]) ?? []);
    setCerts(((await supabase.from("certificates").select("code,partner_id,issued_at,revoked").order("issued_at", { ascending: false }).limit(50)).data as Cert[]) ?? []);
    if (staff) setTp(((await supabase.from("mou_templates").select("id,name,version,type_code,active").order("created_at", { ascending: false }).limit(50)).data as T[]) ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function upload(f: File | undefined) {
    if (!f) return; const e = templateFileOk(f.name, f.size); if (e) return say(e, true);
    const p = parseFieldMap(map); if (p.error) return say(p.error, true); if (name.trim().length < 3) return say("Give the template a name", true);
    const path = `_templates/${Date.now()}-${safeName(f.name)}`;
    const up = await supabase.storage.from("agreements").upload(path, f); if (up.error) return say(up.error.message, true);
    const { error } = await supabase.from("mou_templates").insert({ name: name.trim(), storage_path: path, field_map: p.map, type_code: type || null });
    say(error ? error.message : "Template saved", !!error); load();
  }
  async function rpc(fn: string, args: Record<string, unknown>, ok: string) { const { error } = await supabase.rpc(fn, args); say(error ? error.message : ok, !!error); load(); }
  async function sign(a: A, f: File | undefined) {
    if (!f) return; const path = `${a.partner_id}/signed-${Date.now()}-${safeName(f.name)}`;
    const up = await supabase.storage.from("agreements").upload(path, f); if (up.error) return say(up.error.message, true);
    rpc("record_signed_agreement", { aid: a.id, path }, "Signed copy stored. Partner activated and certificate issued.");
  }
  return (<><h1>Agreements & certificates</h1>{msg && <Msg kind={bad ? "bad" : "ok"}>{msg}</Msg>}
    {canPrepare && <><h2>Prepare an agreement</h2><div className="card"><input placeholder="Partner ID, e.g. ELP-DLR-0001" value={pid} onChange={(e) => setPid(e.target.value)} /> <select value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="">Template</option>{tp.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name} v{t.version}</option>)}</select> <button className="btn" disabled={!pid || !tpl} onClick={() => rpc("create_agreement", { pid: pid.trim(), tpl }, "Draft agreement created")}>Create draft</button></div></>}
    <h2>Agreements</h2><div className="card"><table><thead><tr><th>Partner</th><th>Status</th><th>Sent</th><th>Signed</th><th></th></tr></thead><tbody>{ag.map((a) => <tr key={a.id}><td>{a.partner_id}</td><td>{a.status}</td><td>{when(a.sent_at)}</td><td>{when(a.signed_at)}</td>
      <td>{canPrepare && a.status === "Draft" && <button className="btn" onClick={() => rpc("send_agreement", { aid: a.id }, "Sent to partner")}>Send for signing</button>}{isSuper && a.status === "Sent" && <label>Upload signed copy <input type="file" accept=".pdf,.jpg,.png" onChange={(e) => sign(a, e.target.files?.[0])} /></label>}</td></tr>)}{ag.length === 0 && <tr><td colSpan={5}>No agreements yet.</td></tr>}</tbody></table></div>
    <h2>Certificates</h2><div className="card"><table><tbody>{certs.map((c) => <tr key={c.code}><td>{c.partner_id}</td><td>{c.code}</td><td>{when(c.issued_at)}</td><td>{c.revoked ? "Revoked" : <a href={`../verify/?code=${c.code}`}>Public page</a>}</td></tr>)}{certs.length === 0 && <tr><td>No certificates yet.</td></tr>}</tbody></table></div>
    {staff && <><h2>MOU templates</h2><div className="card"><table><tbody>{tp.map((t) => <tr key={t.id}><td>{t.name} v{t.version}</td><td>{t.type_code ?? "All types"}</td><td>{t.active ? "Active" : "Retired"}</td></tr>)}</tbody></table>
      {isSuper && <><h3>Upload your own MOU template</h3><input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} /> <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All partner types</option><option value="DLR">Dealer</option><option value="DST">Distributor</option></select>
        <p>Field mapping (one per line: placeholder in your file = partner field)</p><textarea rows={4} style={{ width: "100%" }} value={map} onChange={(e) => setMap(e.target.value)} />
        <p><input type="file" accept=".docx,.pdf,.odt" onChange={(e) => upload(e.target.files?.[0])} /></p></>}</div></>}</>);
}
export default function Page() { return <Shell page="agreements">{(u) => <Inner role={u.role} />}</Shell>; }
