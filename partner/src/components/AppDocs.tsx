"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/fn";
import { Msg, when } from "@/components/ui";
import { safeName } from "@/lib/mou";

type D = { id: string; kind: string; file_path: string; file_name: string; status: "Uploaded" | "Accepted" | "Rejected"; note: string | null; uploaded_at: string };
export function DocsReview({ appId, canAct }: { appId: string; canAct: boolean }) {
  const [docs, setDocs] = useState<D[]>([]); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { setDocs(((await supabase.from("application_documents").select("*").eq("application_id", appId).order("uploaded_at")).data as D[]) ?? []); }, [appId]);
  useEffect(() => { load(); }, [load]);
  async function view(d: D) { const { data, error } = await supabase.storage.from("application-docs").createSignedUrl(d.file_path, 120); if (error || !data) return setMsg(error?.message ?? "Could not open"); window.open(data.signedUrl, "_blank"); }
  async function review(d: D, st: "Accepted" | "Rejected") {
    const note = st === "Rejected" ? prompt("What is wrong with this document? (the applicant will see this)") ?? "" : "";
    if (st === "Rejected" && !note.trim()) return;
    const { error } = await supabase.rpc("review_document", { doc: d.id, st, note }); setMsg(error ? error.message : `${d.kind}: ${st}`); load();
  }
  if (docs.length === 0) return <p style={{ fontSize: 13 }}>No documents uploaded yet.</p>;
  return (<div>{msg && <Msg>{msg}</Msg>}<table><tbody>{docs.map((d) => <tr key={d.id}><td><b>{d.kind}</b><div style={{ fontSize: 12 }}>{d.file_name} · {when(d.uploaded_at)}</div>{d.note && <div style={{ fontSize: 12, color: "#9b3b2c" }}>{d.note}</div>}</td><td>{d.status}</td>
    <td><button className="btn out" onClick={() => view(d)}>View</button>{canAct && <> <button className="btn" onClick={() => review(d, "Accepted")}>Accept</button> <button className="btn" style={{ background: "#9b3b2c" }} onClick={() => review(d, "Rejected")}>Reject</button></>}</td></tr>)}</tbody></table></div>);
}

type Ag = { id: string; status: string; template_id: string | null; signed_at: string | null };
type Tp = { id: string; name: string; version: number; type_code: string | null };
export function MouStep({ partnerId, typeCode, canAct, onLogin }: { partnerId: string; typeCode: string; canAct: boolean; onLogin: () => void }) {
  const [ag, setAg] = useState<Ag | null>(null); const [tp, setTp] = useState<Tp[]>([]); const [tpl, setTpl] = useState(""); const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const say = (m: string, b = false) => { setMsg(m); setBad(b); };
  const load = useCallback(async () => {
    setAg(((await supabase.from("agreements").select("id,status,template_id,signed_at").eq("partner_id", partnerId).neq("status", "Void").order("created_at", { ascending: false }).limit(1)).data as Ag[] | null)?.[0] ?? null);
    setTp(((await supabase.from("mou_templates").select("id,name,version,type_code").eq("active", true)).data as Tp[]) ?? []);
  }, [partnerId]);
  useEffect(() => { load(); }, [load]);
  async function create() { const { error } = await supabase.rpc("create_agreement", { pid: partnerId, tpl }); say(error ? error.message : "MOU draft created", !!error); load(); }
  async function send(f: File | undefined) {
    if (!f || !ag) return; if (!f.name.toLowerCase().endsWith(".pdf")) return say("Leegality needs the final MOU as a PDF", true);
    if (f.size > 15_000_000) return say("The PDF is over 15 MB", true);
    const path = `${partnerId}/${ag.id}-for-esign.pdf`;
    const up = await supabase.storage.from("agreements").upload(path, f, { upsert: true }); if (up.error) return say(up.error.message, true);
    say("Sending to Leegality…");
    const r = await callFn("esign-send", { agreement_id: ag.id, pdf_path: path });
    say(r.ok ? "Sent through Leegality. The partner gets the signing link. When they sign, the login ID and password are e-mailed automatically." : (r.error ?? "Failed"), !r.ok); load();
  }
  return (<div>{msg && <Msg kind={bad ? "bad" : "ok"}>{msg}</Msg>}
    {!ag && canAct && <p>Step 1: choose the MOU template and create the draft. <select value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="">Template</option>{tp.filter((t) => !t.type_code || t.type_code === typeCode).map((t) => <option key={t.id} value={t.id}>{t.name} v{t.version}</option>)}</select> <button className="btn" disabled={!tpl} onClick={create}>Create MOU draft</button>{tp.length === 0 && <><br /><span style={{ fontSize: 12 }}>No template yet. Upload one on the Agreements page.</span></>}</p>}
    {ag && ag.status !== "Signed" && <>
      <p>MOU status: <b>{ag.status}</b>.{ag.status === "Draft" ? " Step 2: on the Agreements page click “Download filled MOU”, check it, save it as PDF, then upload that PDF here." : " Waiting for the partner to sign on Leegality."}</p>
      {canAct && <label className="btn out" style={{ cursor: "pointer" }}>{ag.status === "Sent" ? "Re-send MOU PDF to Leegality" : "Upload MOU PDF and send via Leegality"}<input type="file" accept=".pdf" hidden onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} /></label>}</>}
    {ag?.status === "Signed" && <p>MOU signed {when(ag.signed_at)}. {canAct && <button className="btn" onClick={onLogin}>Issue / re-send login</button>}</p>}
    <p style={{ fontSize: 12 }}>After signing, the system creates the login and e-mails the Login ID and password. <a href="../agreements/">Open Agreements page</a></p></div>);
}
export { safeName };
