"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { parseFieldMap, templateFileOk, safeName, fillDocx, mouValues, type MouField } from "@/lib/mou";
import { MouBuilder } from "@/components/MouBuilder";
import type { Role } from "@/lib/roles";

type A = { id: string; partner_id: string; status: string; sent_at: string | null; signed_at: string | null; template_id: string | null };
type T = { id: string; name: string; version: number; type_code: string | null; active: boolean; storage_path: string; field_map: Record<string, MouField> };
type Cert = { code: string; partner_id: string; issued_at: string; revoked: boolean };
const CO: Record<string, string> = { legal_name: "Company legal name", cin: "CIN", gstin: "GSTIN", address: "Registered address", signatory_name: "EarthLabs signatory name", signatory_designation: "Signatory designation", signatory_email: "Signatory e-mail (signs on Leegality)", signatory_phone: "Signatory mobile (optional)" };
function Inner({ role }: { role: Role }) {
  const isSuper = role === "super_admin"; const canPrepare = isSuper || role === "sales"; const staff = ["super_admin", "sales", "accounts", "warehouse"].includes(role);
  const [ag, setAg] = useState<A[]>([]); const [tp, setTp] = useState<T[]>([]); const [certs, setCerts] = useState<Cert[]>([]); const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const [open, setOpen] = useState<string | null>(null); const [co, setCo] = useState<Record<string, string>>({}); const [pid, setPid] = useState(""); const [tpl, setTpl] = useState(""); const [name, setName] = useState(""); const [type, setType] = useState(""); const [map, setMap] = useState("{{PARTNER_NAME}} = partner_name\n{{PARTNER_ID}} = partner_id");
  const say = (m: string, b = false) => { setMsg(m); setBad(b); };
  async function load() {
    setAg(((await supabase.from("agreements").select("id,partner_id,status,sent_at,signed_at,template_id").order("created_at", { ascending: false }).limit(50)).data as A[]) ?? []);
    setCerts(((await supabase.from("certificates").select("code,partner_id,issued_at,revoked").order("issued_at", { ascending: false }).limit(50)).data as Cert[]) ?? []);
    if (staff) { const m: Record<string, string> = {}; ((await supabase.from("company_profile").select("key,value")).data as { key: string; value: string }[] | null)?.forEach((r) => { m[r.key] = r.value; }); setCo(m); }
    if (staff) setTp(((await supabase.from("mou_templates").select("id,name,version,type_code,active,storage_path,field_map").order("created_at", { ascending: false }).limit(50)).data as T[]) ?? []);
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
  async function saveCo() { for (const k of Object.keys(CO)) { const { error } = await supabase.rpc("set_company_profile", { k, v: (co[k] ?? "").trim() }); if (error) return say(error.message, true); } say("Company details saved"); load(); }
  async function rpc(fn: string, args: Record<string, unknown>, ok: string) { const { error } = await supabase.rpc(fn, args); say(error ? error.message : ok, !!error); load(); }
  async function sign(a: A, f: File | undefined) {
    if (!f) return; const path = `${a.partner_id}/signed-${Date.now()}-${safeName(f.name)}`;
    const up = await supabase.storage.from("agreements").upload(path, f); if (up.error) return say(up.error.message, true);
    rpc("record_signed_agreement", { aid: a.id, path }, "Signed copy stored. Open the MOU and approve it to activate the partner.");
  }
  async function esign(a: A, f: File | undefined) {
    if (!f) return; if (!f.name.toLowerCase().endsWith(".pdf")) return say("E-sign needs the final agreement as a PDF", true);
    if (f.size > 15_000_000) return say("The PDF is over 15 MB", true);
    const path = `${a.partner_id}/${a.id}-for-esign.pdf`;
    const up = await supabase.storage.from("agreements").upload(path, f, { upsert: true }); if (up.error) return say(up.error.message, true);
    say("Sending to Leegality…");
    const { data, error } = await supabase.functions.invoke("esign-send", { body: { agreement_id: a.id, pdf_path: path } });
    say(error || data?.error ? (data?.error ?? error?.message ?? "Failed") : "Sent through Leegality. The partner receives the signing link; the signed copy comes back automatically; then approve it to activate the partner.", !!(error || data?.error)); load();
  }
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  async function filledMou(a: A) {
    const t = tp.find((x) => x.id === a.template_id); if (!t) return say("Template not found", true);
    if (!t.storage_path.toLowerCase().endsWith(".docx")) return say("Only .docx templates can be filled automatically. Download the template and fill it by hand.", true);
    const { data: p } = await supabase.from("partners").select("id,name,contact_name,district,state,gstin,type_code").eq("id", a.partner_id).single();
    const { data: ty } = await supabase.from("partner_types").select("name").eq("code", (p as { type_code: string } | null)?.type_code ?? "").single();
    const { data: file, error } = await supabase.storage.from("agreements").download(t.storage_path);
    if (error || !file || !p) return say(error?.message ?? "Could not load the template", true);
    try {
      const out = fillDocx(new Uint8Array(await file.arrayBuffer()), t.field_map, mouValues({ ...(p as { id: string; name: string; district: string; state: string }), contact_name: (p as { contact_name?: string }).contact_name, gstin: (p as { gstin?: string }).gstin, type_name: (ty as { name: string } | null)?.name ?? "" }));
      const url = URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      const el = document.createElement("a"); el.href = url; el.download = `MOU-${a.partner_id}.docx`; el.click(); URL.revokeObjectURL(url);
      say(`MOU prepared with ${out.replaced} field(s) filled. Check it before sending.`);
    } catch (e) { say((e as Error).message, true); }
  }
  return (<><h1>Agreements & certificates</h1>{msg && <Msg kind={bad ? "bad" : "ok"}>{msg}</Msg>}
    {canPrepare && <><h2>Prepare an MOU</h2><div className="card"><p>Enter the Partner ID to open its MOU: edit the numbers and fields, generate the PDF, then sign on Leegality or by hand. (Applications in “Agreement pending” open the same screen.)</p><input placeholder="Partner ID, e.g. ELP-DLR-0001" value={pid} onChange={(e) => setPid(e.target.value)} /> <button className="btn" disabled={!pid.trim()} onClick={() => setOpen(pid.trim())}>Open MOU</button>{open === pid.trim() && open && <MouBuilder partnerId={open} canAct={canPrepare} onActivated={load} />}</div></>}
    <h2>Agreements</h2><div className="card"><table><thead><tr><th>Partner</th><th>Status</th><th>Sent</th><th>Signed</th><th></th></tr></thead><tbody>{ag.map((a) => <tr key={a.id}><td>{a.partner_id}</td><td>{a.status}</td><td>{when(a.sent_at)}</td><td>{when(a.signed_at)}</td>
      <td>{canPrepare && <button className="btn out" onClick={() => { setPid(a.partner_id); setOpen(a.partner_id); window.scrollTo(0, 0); }}>Open MOU</button>}{" "}{canPrepare && a.status === "Draft" && a.template_id && <button className="btn" onClick={() => rpc("send_agreement", { aid: a.id }, "Sent to partner")}>Send for signing</button>}{staff && a.template_id && a.status !== "Signed" && <button className="btn" onClick={() => filledMou(a)}>Download filled MOU</button>} {canPrepare && a.status !== "Signed" && <label>Send for e-sign (PDF) <input type="file" accept=".pdf" onChange={(e) => esign(a, e.target.files?.[0])} /></label>} {isSuper && a.status === "Sent" && <label>Upload signed copy <input type="file" accept=".pdf,.jpg,.png" onChange={(e) => sign(a, e.target.files?.[0])} /></label>}</td></tr>)}{ag.length === 0 && <tr><td colSpan={5}>No agreements yet.</td></tr>}</tbody></table></div>
    <h2>Certificates</h2><div className="card"><table><tbody>{certs.map((c) => <tr key={c.code}><td>{c.partner_id}</td><td>{c.code}</td><td>{when(c.issued_at)}</td><td>{c.revoked ? "Revoked" : <><a href={`../verify/?code=${c.code}`}>Public page</a> · <a href={`../certificate/?code=${c.code}`} target="_blank">Certificate (print / PDF)</a></>}</td></tr>)}{certs.length === 0 && <tr><td>No certificates yet.</td></tr>}</tbody></table></div>
    {staff && <><h2>Company details</h2><div className="card"><p style={{ fontSize: 13 }}>Used in the MOU, on the certificate, and as the second signer on Leegality.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10 }}>{Object.entries(CO).map(([k, l]) => <label key={k} style={{ fontSize: 13 }}>{l}<input style={{ width: "100%" }} disabled={!isSuper} value={co[k] ?? ""} onChange={(e) => setCo({ ...co, [k]: e.target.value })} /></label>)}</div>{isSuper && <p><button className="btn" onClick={saveCo}>Save company details</button></p>}</div>
    <h2>MOU templates</h2><div className="card"><table><tbody>{tp.map((t) => <tr key={t.id}><td>{t.name} v{t.version}</td><td>{t.type_code ?? "All types"}</td><td>{t.active ? "Active" : "Retired"}</td></tr>)}</tbody></table>
      {isSuper && <><h3>Upload your own MOU template</h3><input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} /> <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All partner types</option><option value="DLR">Dealer</option><option value="DST">Distributor</option></select>
        <p>Field mapping (one per line: placeholder in your file = partner field)</p><textarea rows={4} style={{ width: "100%" }} value={map} onChange={(e) => setMap(e.target.value)} />
        <p><input type="file" accept=".docx,.pdf,.odt" onChange={(e) => upload(e.target.files?.[0])} /></p></>}</div></>}</>);
}
export default function Page() { return <Shell page="agreements">{(u) => <Inner role={u.role} />}</Shell>; }
