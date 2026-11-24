"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/fn";
import { Msg, when } from "@/components/ui";
import { safeName } from "@/lib/mou";
import { askForm, askConfirm, askReason } from "@/lib/dialog";

type D = { id: string; kind: string; file_path: string | null; file_name: string | null; status: "Uploaded" | "Accepted" | "Rejected"; note: string | null; uploaded_at: string; not_applicable: boolean; is_current: boolean };
type WD = { id: string; application_id: string; email: string; kind: string; file_name: string; file_path: string | null; status: string; not_applicable: boolean; uploaded_at: string; is_current: boolean };
export function DocsReview({ appId, canAct, email }: { appId: string; canAct: boolean; email?: string }) {
  const [docs, setDocs] = useState<D[]>([]); const [msg, setMsg] = useState(""); const [old, setOld] = useState<WD[]>([]);
  const load = useCallback(async () => { setDocs(((await supabase.from("application_documents").select("*").eq("application_id", appId).eq("is_current", true).order("uploaded_at")).data as D[]) ?? []);
    if (email && canAct) { const { data } = await supabase.rpc("wallet_documents", { q: email }); setOld(((data as WD[]) ?? []).filter((w) => w.application_id !== appId && w.email.toLowerCase() === email.toLowerCase() && w.is_current && !w.not_applicable && w.status !== "Rejected")); } }, [appId, email, canAct]);
  useEffect(() => { load(); }, [load]);
  async function view(d: { file_path: string | null }) { if (!d.file_path) return; const { data, error } = await supabase.storage.from("application-docs").createSignedUrl(d.file_path, 120); if (error || !data) return setMsg(error?.message ?? "Could not open"); window.open(data.signedUrl, "_blank"); }
  async function review(d: D, st: "Accepted" | "Rejected") {
    const note = st === "Rejected" ? (await askReason("Reject document", "What is wrong with this document? (the applicant will see this)", "Reject", true)) ?? "" : "";
    if (st === "Rejected" && !note.trim()) return;
    const { error } = await supabase.rpc("review_document", { doc: d.id, st, note }); setMsg(error ? error.message : `${d.kind}: ${st}`); load();
  }
  async function reuse(w: WD) { const { error } = await supabase.rpc("reuse_document", { doc: w.id, app: appId }); setMsg(error ? error.message : `${w.kind}: reused from wallet`); load(); }
  const have = new Set(docs.map((d) => d.kind)); const reusable = old.filter((w) => !have.has(w.kind) || docs.find((d) => d.kind === w.kind)?.status === "Rejected");
  return (<div>{msg && <Msg>{msg}</Msg>}{docs.length === 0 && <p style={{ fontSize: 13 }}>No documents uploaded yet.</p>}<table><tbody>{docs.map((d) => <tr key={d.id}><td><b>{d.kind}</b><div style={{ fontSize: 12 }}>{d.not_applicable ? "Not applicable" : d.file_name} · {when(d.uploaded_at)}</div>{d.note && <div style={{ fontSize: 12, color: "#9b3b2c" }}>{d.note}</div>}</td><td>{d.status}</td>
    <td>{d.file_path && <button className="btn out" onClick={() => view(d)}>View</button>}{canAct && <> <button className="btn" onClick={() => review(d, "Accepted")}>Accept</button> <button className="btn" style={{ background: "#9b3b2c" }} onClick={() => review(d, "Rejected")}>Reject</button></>}</td></tr>)}</tbody></table>{reusable.length > 0 && <><h4>Stored in the document wallet</h4><table><tbody>{reusable.map((w) => <tr key={w.id}><td>{w.kind}<div style={{ fontSize: 12 }}>{w.file_name} · {when(w.uploaded_at)}</div></td><td><button className="btn out" onClick={() => view(w)}>View</button>{canAct && <> <button className="btn" onClick={() => reuse(w)}>Use for this application</button></>}</td></tr>)}</tbody></table></>}</div>);
}

export { safeName };
