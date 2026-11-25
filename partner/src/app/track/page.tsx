"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/fn";
import { Field, Msg, when } from "@/components/ui";
import PublicShell from "@/components/PublicShell";
import { askForm, askConfirm, askReason } from "@/lib/dialog";

type Row = { status: string; business_name: string; type_code: string; reason: string | null; partner_id: string | null; created_at: string; ref_no?: string };
type Doc = { kind: string; file_name: string; status: "Uploaded" | "Accepted" | "Rejected"; note: string | null; uploaded_at: string; not_applicable?: boolean };
type DocState = { status: string; can_upload: boolean; required: string[]; docs: Doc[] };
const NEXT: Record<string, string> = {
  "Submitted": "We are reviewing your basic details. When they are cleared, we e-mail you the list of documents to upload here.",
  "Documents requested": "Please upload your documents in the Documents tab.",
  "Documents submitted": "We have your documents and are checking them.",
  "More info needed": "We need something corrected. See the note below and use the Documents tab.",
  "Field verification": "Your documents are cleared. We will contact you for a meeting or field visit.",
  "Agreement pending": "You are approved. Watch your e-mail and phone for the MOU (agreement) from Leegality and sign it. Your login ID and password follow once it is signed.",
  "MOU signed": "Both sides have signed your MOU. EarthLabs is approving the signed copy. Your certificate, login ID and password will be e-mailed next.",
  "Approved": "Your MOU is signed and approved. Your login ID and password were e-mailed to you. Sign in from the sign-in page.",
  "Rejected": "This application was not approved.",
};
export default function Track() {
  const [ref, setRef] = useState(""); const [mail, setMail] = useState(""); const [row, setRow] = useState<Row | null | undefined>(undefined); const [err, setErr] = useState("");
  const [tab, setTab] = useState<"status" | "docs">("status"); const [ds, setDs] = useState<DocState | null>(null); const [busy, setBusy] = useState(""); const [note, setNote] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { const r = new URLSearchParams(location.search).get("ref"); if (r) setRef(r); }, []);
  async function loadDocs() { const r = await callFn("application-docs", { action: "list", ref: ref.trim(), email: mail }); setDs(r.ok ? (r.data as unknown as DocState) : null); }
  async function go() {
    setErr(""); setNote(null);
    // The status lookup and the document list do not depend on each other, so they run together.
    const [{ data, error }, d] = await Promise.all([supabase.rpc("track_application", { ref: ref.trim(), mail }), callFn("application-docs", { action: "list", ref: ref.trim(), email: mail })]);
    if (error) { setErr("Check the reference and e-mail"); setRow(undefined); return; }
    const r = (data as Row[])[0] ?? null; setRow(r); setDs(r && d.ok ? (d.data as unknown as DocState) : null);
    if (r) setTab(["Documents requested", "More info needed"].includes(r.status) ? "docs" : "status");
  }
  // Quiet refresh in the background after an action: never blanks the screen and never clears the message just shown.
  async function refresh() {
    const [t] = await Promise.all([supabase.rpc("track_application", { ref: ref.trim(), mail }), loadDocs()]);
    const r = ((t.data as Row[] | null) ?? [])[0]; if (r) setRow(r);
  }
  async function upload(kind: string, f: File | undefined) {
    if (!f) return; setNote(null); setBusy(kind);
    const s = await callFn("application-docs", { action: "sign", ref: ref.trim(), email: mail, kind, file_name: f.name, size: f.size });
    if (!s.ok) { setBusy(""); return setNote({ ok: false, t: s.error ?? "Upload failed" }); }
    const { error } = await supabase.storage.from("application-docs").uploadToSignedUrl(String(s.data?.path), String(s.data?.token), f, { contentType: f.type || undefined });
    if (error) { setBusy(""); return setNote({ ok: false, t: "The upload did not go through. Please try again." }); }
    const c = await callFn("application-docs", { action: "confirm", ref: ref.trim(), email: mail, kind, path: s.data?.path, file_name: f.name, size: f.size });
    setBusy(""); setNote(c.ok ? { ok: true, t: `${kind}: uploaded` } : { ok: false, t: c.error ?? "Upload failed" });
    // Show the file as uploaded straight away; the list is re-read in the background.
    if (c.ok) setDs((x) => x && { ...x, docs: [...x.docs.filter((d) => d.kind !== kind), { kind, file_name: f.name, status: "Uploaded", note: null, uploaded_at: new Date().toISOString() }] });
    void loadDocs();
  }
  async function na(kind: string) {
    const reason = (await askReason(`"${kind}" does not apply to me`, "Why does it not apply to you? (for example: new business, no separate premises)", "Submit")) ?? ""; if (reason.trim().length < 3) return;
    setBusy(kind); const r = await callFn("application-docs", { action: "na", ref: ref.trim(), email: mail, kind, reason: reason.trim() }); setBusy("");
    setNote({ ok: r.ok, t: r.ok ? `${kind}: marked not applicable. Our team will review your reason.` : (r.error ?? "Failed") }); loadDocs();
  }
  async function submit() {
    setBusy("submit"); setNote(null);
    const r = await callFn("application-docs", { action: "submit", ref: ref.trim(), email: mail });
    setBusy(""); if (!r.ok) return setNote({ ok: false, t: r.error ?? "Could not submit" });
    // Confirm at once; the e-mail is sent by the system in the background and the status is re-read quietly.
    setNote({ ok: true, t: "Documents submitted. We will e-mail you the result." }); setRow((x) => x && { ...x, status: "Documents submitted" }); setDs((x) => x && { ...x, can_upload: false }); setTab("status"); void refresh();
  }
  const docOf = (k: string) => ds?.docs.find((d) => d.kind === k);
  const showDocs = !!row && !!ds && (ds.can_upload || ds.docs.length > 0);
  return (<PublicShell page="track"><h1>Track your application</h1>
    <div className="card"><Field label="Reference number (e.g. APP-2026-0001)"><input value={ref} onChange={(e) => setRef(e.target.value)} /></Field><Field label="E-mail used"><input type="email" value={mail} onChange={(e) => setMail(e.target.value)} /></Field><button className="btn" onClick={go}>Check status</button>
      {err && <div style={{ marginTop: 12 }}><Msg kind="bad">{err}</Msg></div>}
      {row === null && <div style={{ marginTop: 12 }}><Msg>No application found for these details.</Msg></div>}
      {row && <div style={{ marginTop: 12 }}>
        {showDocs && <p><button className="btn" style={{ opacity: tab === "status" ? 1 : 0.55 }} onClick={() => setTab("status")}>Status</button>{" "}<button className="btn" style={{ opacity: tab === "docs" ? 1 : 0.55 }} onClick={() => setTab("docs")}>Documents{ds?.can_upload ? " (action needed)" : ""}</button></p>}
        {tab === "status" && <Msg kind={["Approved", "Agreement pending", "MOU signed"].includes(row.status) ? "ok" : "note"}><b>{row.business_name}</b>{row.ref_no ? ` (${row.ref_no})` : ""}: <b>{row.status}</b>. Received {when(row.created_at)}.{row.reason ? ` Note from EarthLabs: ${row.reason}.` : ""}{row.partner_id ? ` Your Partner ID is ${row.partner_id}.` : ""}<br />{NEXT[row.status] ?? ""}</Msg>}
        {tab === "docs" && ds && <div>
          {ds.can_upload ? <p>Upload each document (PDF, JPG or PNG, up to 8 MB). You can replace a file before you submit. When all are uploaded, press <b>Submit documents</b>.</p> : <p>Your documents are with our team for review.</p>}
          {row.reason && ds.can_upload && <Msg kind="bad">What we need: {row.reason}</Msg>}
          <table><tbody>{ds.required.map((k) => { const d = docOf(k); return (<tr key={k}><td><b>{k}</b>{d && <div style={{ fontSize: 12 }}>{d.not_applicable ? `Not applicable: ${d.note ?? ""}` : d.file_name}</div>}{d?.status === "Rejected" && d.note && <div style={{ fontSize: 12, color: "#9b3b2c" }}>Please replace: {d.note}</div>}</td>
            <td>{d ? (d.status === "Accepted" ? "Accepted" : d.status === "Rejected" ? "Needs replacing" : d.not_applicable ? "Marked not applicable" : "Uploaded") : "Not uploaded"}</td>
            <td>{ds.can_upload && d?.status !== "Accepted" && <label className="btn out" style={{ cursor: "pointer" }}>{busy === k ? "Uploading…" : d ? "Replace" : "Upload"}<input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden disabled={!!busy} onChange={(e) => { upload(k, e.target.files?.[0]); e.target.value = ""; }} /></label>}{ds.can_upload && d?.status !== "Accepted" && <> <button className="btn out" disabled={!!busy} onClick={() => na(k)}>Not applicable</button></>}</td></tr>); })}</tbody></table>
          {ds.can_upload && <p><button className="btn" disabled={!!busy || ds.required.some((k) => !docOf(k) || docOf(k)?.status === "Rejected")} onClick={submit}>{busy === "submit" ? "Submitting…" : "Submit documents"}</button></p>}
          {note && <Msg kind={note.ok ? "ok" : "bad"}>{note.t}</Msg>}
        </div>}
      </div>}
    </div><p><a href="../register/">Apply</a> · <a href="../">Sign in</a></p></PublicShell>);
}
