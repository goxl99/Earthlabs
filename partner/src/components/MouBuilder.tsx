"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/fn";
import { Msg, when } from "@/components/ui";
import { safeName } from "@/lib/mou";
import { MOU_FIELDS, buildMou, defaultValues, missingLabels, type Values } from "@/lib/mouDealer";
import { loadLogo, mouToPdf } from "@/lib/mouPdf";
import { askForm, askConfirm, askReason } from "@/lib/dialog";

type Ag = { id: string; status: string; signed_at: string | null; mou_body: string | null; mou_fields: Values | null; mou_pdf_path: string | null; approved_at: string | null };
type P = { id: string; name: string; contact_name: string; district: string; gstin: string | null; address: string | null; status: string; type_code: string };
const GROUPS = ["Parties", "Signatories", "Territory and term", "Targets (Schedule B)", "Money and clauses"] as const;

/** MOU for one partner: edit the numbers and fields, edit the full text, make the PDF, sign on Leegality or by hand, then approve the signed copy. */
export function MouBuilder({ partnerId, canAct, onActivated }: { partnerId: string; canAct: boolean; onActivated: () => void }) {
  const [ag, setAg] = useState<Ag | null>(null); const [p, setP] = useState<P | null>(null); const [vals, setVals] = useState<Values>({}); const [body, setBody] = useState(""); const [edited, setEdited] = useState(false);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false); const [busy, setBusy] = useState(false); const [showText, setShowText] = useState(false);
  const say = (m: string, b = false) => { setMsg(m); setBad(b); };
  const load = useCallback(async () => {
    const { data: pp } = await supabase.from("partners").select("id,name,contact_name,district,gstin,address,status,type_code").eq("id", partnerId).single(); setP(pp as P);
    const a = ((await supabase.from("agreements").select("id,status,signed_at,mou_body,mou_fields,mou_pdf_path,approved_at").eq("partner_id", partnerId).neq("status", "Void").order("created_at", { ascending: false }).limit(1)).data as Ag[] | null)?.[0] ?? null; setAg(a);
    const company: Record<string, string> = {}; ((await supabase.from("company_profile").select("key,value")).data as { key: string; value: string }[] | null)?.forEach((r) => { company[r.key] = r.value; });
    const v = a?.mou_fields && Object.keys(a.mou_fields).length ? a.mou_fields : defaultValues(pp as P, company);
    setVals(v); setBody(a?.mou_body ?? buildMou(v).text); setEdited(false);
  }, [partnerId]);
  useEffect(() => { load(); }, [load]);
  const built = useMemo(() => buildMou(vals), [vals]);
  const set = (k: string, x: string) => { setVals((v) => ({ ...v, [k]: x })); if (!edited) setBody(buildMou({ ...vals, [k]: x }).text); };
  const locked = !ag || ag.status === "Signed";

  async function create() { const { error } = await supabase.rpc("create_agreement", { pid: partnerId, tpl: null }); say(error ? error.message : "MOU draft created. Fill in the details below.", !!error); load(); }
  async function makePdf(): Promise<string | null> {
    if (!ag) return null; setBusy(true);
    try {
      const base = location.pathname.replace(/\/(applications|agreements)\/?$/, "/");
      const logo = await loadLogo(base);
      const blob = mouToPdf(body, { logo, footer: `Dealer Agreement · ${vals.dealer_name || partnerId} · ${vals.partner_id || partnerId}` });
      const path = `${partnerId}/${ag.id}-for-esign.pdf`;
      const up = await supabase.storage.from("agreements").upload(path, blob, { upsert: true, contentType: "application/pdf" }); if (up.error) throw up.error;
      const { error } = await supabase.rpc("save_mou", { aid: ag.id, body, fields: vals, pdf_path: path }); if (error) throw error;
      return path;
    } catch (e) { say((e as Error).message, true); return null; } finally { setBusy(false); }
  }
  async function save() { if (!ag) return; const { error } = await supabase.rpc("save_mou", { aid: ag.id, body, fields: vals, pdf_path: null }); say(error ? error.message : "Saved", !!error); load(); }
  async function download() {
    const path = await makePdf(); if (!path) return;
    const { data } = await supabase.storage.from("agreements").createSignedUrl(path, 300); if (data) window.open(data.signedUrl, "_blank");
    say("PDF ready. Print it for manual signing, or send it through Leegality."); load();
  }
  async function send() {
    if (!ag) return; if (built.missing.length && !(await askConfirm("Send with blank fields?", `These fields are still blank: ${missingLabels(built.missing).join(", ")}. Send anyway?`, "Send anyway"))) return;
    const path = await makePdf(); if (!path) return;
    say("Sending to Leegality…"); setBusy(true);
    const r = await callFn("esign-send", { agreement_id: ag.id, pdf_path: path }); setBusy(false);
    say(r.ok ? "Sent through Leegality. The partner and the EarthLabs signatory each get a signing link. When both have signed, approve the signed MOU here." : (r.error ?? "Failed"), !r.ok); load();
  }
  async function manual(f: File | undefined) {
    if (!f || !ag || !p) return; const path = `${p.id}/signed-${Date.now()}-${safeName(f.name)}`;
    const up = await supabase.storage.from("agreements").upload(path, f); if (up.error) return say(up.error.message, true);
    const { error } = await supabase.rpc("record_signed_agreement", { aid: ag.id, path }); say(error ? error.message : "Signed copy stored. Now approve it below.", !!error); load();
  }
  async function activate() {
    if (!(await askConfirm("Approve the signed MOU?", "The partner becomes Active, the certificate is issued, and the login ID and password are e-mailed.", "Approve"))) return;
    const { error } = await supabase.rpc("activate_partner", { pid: partnerId }); if (error) return say(error.message, true);
    const r = await callFn("provision-login", { partner_id: partnerId });
    say(r.ok ? "Approved. Certificate issued; login ID and password e-mailed to the partner." : "Approved and certificate issued, but the login could not be created: " + r.error, !r.ok); load(); onActivated();
  }
  if (!p) return <p>Loading…</p>;
  const active = p.status === "Active";
  return (<div>{msg && <Msg kind={bad ? "bad" : "ok"}>{msg}</Msg>}
    {p.type_code !== "DLR" && <Msg kind="bad">This MOU wording is the Dealer agreement. Check it before using it for a {p.type_code}.</Msg>}
    {!ag && <p>No MOU yet. {canAct && <button className="btn" onClick={create}>Start the MOU</button>}</p>}
    {ag && <p>MOU status: <b>{ag.status}</b>{ag.signed_at ? ` · signed ${when(ag.signed_at)}` : ""}{active ? " · partner Active" : ""}.</p>}
    {ag && !locked && canAct && <>
      {GROUPS.map((g) => <fieldset key={g} className="card" style={{ marginBottom: 8 }}><legend><b>{g}</b></legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
          {MOU_FIELDS.filter((f) => f.group === g).map((f) => <label key={f.key} style={{ fontSize: 13 }}>{f.label}
            {f.kind === "select" ? <select value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ width: "100%" }}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
              : f.kind === "area" ? <textarea rows={2} value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ width: "100%" }} />
              : <input value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ width: "100%" }} />}
            {f.hint && <small style={{ display: "block", color: "#667" }}>{f.hint}</small>}</label>)}
        </div></fieldset>)}
      {built.missing.length > 0 && <Msg kind="bad">Still blank (shown as ________ in the MOU): {missingLabels(built.missing).join(", ")}. Type “Not applicable” where something does not apply.</Msg>}
      <p><button className="btn out" onClick={() => setShowText(!showText)}>{showText ? "Hide" : "Edit"} full MOU text</button>{edited && <> <button className="btn out" onClick={() => { setBody(built.text); setEdited(false); }}>Discard text edits</button></>}</p>
      {showText && <textarea value={body} onChange={(e) => { setBody(e.target.value); setEdited(true); }} rows={22} style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} />}
      <p><button className="btn out" disabled={busy} onClick={save}>Save draft</button> <button className="btn out" disabled={busy} onClick={download}>Generate PDF</button> <button className="btn" disabled={busy} onClick={send}>Send via Leegality</button>{" "}
        <label className="btn out" style={{ cursor: "pointer" }}>Upload manually signed copy<input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => { manual(e.target.files?.[0]); e.target.value = ""; }} /></label></p>
      <p style={{ fontSize: 12 }}>Signing on Leegality: partner first, then the EarthLabs signatory (set under Agreements &gt; Company details). Manual signing: print the PDF, both sign, then upload the scan.</p></>}
    {ag?.status === "Signed" && !active && canAct && <p>Both sides have signed. <button className="btn" onClick={activate}>Approve signed MOU &amp; activate</button> <span style={{ fontSize: 12 }}>(Super Admin only)</span></p>}
    {ag?.status === "Signed" && active && canAct && <p>Partner is Active. <button className="btn out" onClick={async () => { const r = await callFn("provision-login", { partner_id: partnerId }); say(r.ok ? String(r.data?.note ?? "Login ID and password e-mailed.") : String(r.error), !r.ok); }}>Re-send login</button></p>}
  </div>);
}
