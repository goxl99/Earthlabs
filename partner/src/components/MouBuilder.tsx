"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/fn";
import { Msg, when } from "@/components/ui";
import { safeName, docxToText } from "@/lib/mou";
import { MOU_FIELDS, buildMou, fillText, defaultValues, missingLabels, type Values } from "@/lib/mouDealer";
import { MOU_TEMPLATE_TEXT } from "@/lib/mouTemplateText";
import { applyProposal, parseProposal, readStored, stripSpecial, MAX_SPECIAL, type MergeProposal } from "@/lib/agreementMerge";
import { loadLogo, mouToPdf } from "@/lib/mouPdf";
import { askForm, askConfirm, askReason } from "@/lib/dialog";

type Ag = { id: string; status: string; signed_at: string | null; mou_body: string | null; mou_fields: Values | null; mou_pdf_path: string | null; approved_at: string | null };
type P = { id: string; name: string; contact_name: string; district: string; gstin: string | null; address: string | null; status: string; type_code: string };
/** The agreement text for a set of fields: the standard wording plus any approved special terms (Schedule C and amendments). */
const render = (v: Values) => { const b = buildMou(v), sp = readStored(v); return sp ? applyProposal(b.text, sp).text : b.text; };
const GROUPS = ["Parties", "Signatories", "Territory and term", "Targets (Schedule B)", "Money and clauses"] as const;

/** Dealer Agreement for one partner: edit the numbers and fields, edit the full text, make the PDF, sign on Leegality or by hand, then approve the signed copy. */
export function MouBuilder({ partnerId, canAct, onActivated }: { partnerId: string; canAct: boolean; onActivated: () => void }) {
  const [ag, setAg] = useState<Ag | null>(null); const [p, setP] = useState<P | null>(null); const [vals, setVals] = useState<Values>({}); const [body, setBody] = useState(""); const [edited, setEdited] = useState(false);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false); const [busy, setBusy] = useState(false); const [showText, setShowText] = useState(false);
  const [proposal, setProposal] = useState<MergeProposal | null>(null); const [proposalBase, setProposalBase] = useState(""); const [merging, setMerging] = useState(false); const [tplOpen, setTplOpen] = useState(false);
  const say = (m: string, b = false) => { setMsg(m); setBad(b); };
  const load = useCallback(async () => {
    const { data: pp } = await supabase.from("partners").select("id,name,contact_name,district,gstin,address,status,type_code").eq("id", partnerId).single(); setP(pp as P);
    const a = ((await supabase.from("agreements").select("id,status,signed_at,mou_body,mou_fields,mou_pdf_path,approved_at").eq("partner_id", partnerId).neq("status", "Void").order("created_at", { ascending: false }).limit(1)).data as Ag[] | null)?.[0] ?? null; setAg(a);
    const company: Record<string, string> = {}; ((await supabase.from("company_profile").select("key,value")).data as { key: string; value: string }[] | null)?.forEach((r) => { company[r.key] = r.value; });
    const v = a?.mou_fields && Object.keys(a.mou_fields).length ? a.mou_fields : defaultValues(pp as P, company);
    setVals(v); setBody(a?.mou_body ?? render(v)); setEdited(false);
  }, [partnerId]);
  useEffect(() => { load(); }, [load]);
  const built = useMemo(() => { const b = buildMou(vals), sp = readStored(vals); if (!sp) return { ...b, skipped: [] as { reason: string }[] }; const r = applyProposal(b.text, sp); return { text: r.text, missing: b.missing, skipped: r.skipped }; }, [vals]);
  const set = (k: string, x: string) => { setVals((v) => ({ ...v, [k]: x })); if (!edited) setBody(render({ ...vals, [k]: x })); };
  const locked = !ag || ag.status === "Signed";

  async function create() { const { error } = await supabase.rpc("create_agreement", { pid: partnerId, tpl: null }); say(error ? error.message : "Dealer Agreement draft created. Fill in the details below.", !!error); load(); }
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
    say(r.ok ? "Sent through Leegality. The partner and the EarthLabs signatory each get a signing link. When both have signed, approve the signed Dealer Agreement here." : (r.error ?? "Failed"), !r.ok); load();
  }
  async function mergeAi() {
    setMerging(true); setProposal(null);
    const base = stripSpecial(edited ? body : buildMou(vals).text); setProposalBase(base);
    const r = await callFn("agreement-merge", { special_terms: vals.special_terms ?? "", body: base });
    setMerging(false);
    if (!r.ok) return say(r.error ?? "The AI could not be reached", true);
    setProposal(parseProposal(r.data?.proposal)); setMsg("");
  }
  function applyAi() {
    if (!proposal) return;
    if (edited) setBody(applyProposal(proposalBase, proposal).text);
    else { const nv = { ...vals, special_proposal: JSON.stringify(proposal) }; setVals(nv); setBody(render(nv)); }
    setProposal(null); say("Special terms merged into the agreement as Schedule C. Read it through, then save the draft.");
  }
  function removeSpecial() {
    const nv = { ...vals, special_proposal: "" }; setVals(nv); setBody(edited ? stripSpecial(body) : render(nv));
    say(edited ? "Schedule C removed. Amendments made to standard clauses stay in the edited text; use Discard text edits to go back to the standard wording." : "Special terms removed from the agreement.");
  }
  async function attach(f: File | undefined) {
    if (!f) return; const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["docx", "txt", "md"].includes(ext)) return say("Attach a Word (.docx), .txt or .md file", true);
    if (f.size > 5 * 1024 * 1024) return say("The file must be under 5 MB", true);
    let raw = ""; try { raw = ext === "docx" ? docxToText(new Uint8Array(await f.arrayBuffer())) : await f.text(); } catch (e) { return say((e as Error).message, true); }
    if (raw.trim().length < 200) return say("That file has too little text to be an agreement", true);
    if (!(await askConfirm("Use this template?", `"${f.name}" replaces the standard Dealer Agreement wording for this partner. Placeholders such as {{dealer_name}} are filled from the fields on this screen. You can merge special terms into it afterwards.`, "Use this template"))) return;
    const filled = fillText(raw, vals); setBody(filled.text); setEdited(true); setShowText(true); setProposal(null);
    say(`Template "${f.name}" attached. ${filled.missing.length ? `These placeholders are blank or unknown and show as ________: ${missingLabels(filled.missing).join(", ")}.` : "All placeholders were filled."} Read it through, then save the draft.`, filled.missing.length > 0);
  }
  async function manual(f: File | undefined) {
    if (!f || !ag || !p) return; const path = `${p.id}/signed-${Date.now()}-${safeName(f.name)}`;
    const up = await supabase.storage.from("agreements").upload(path, f); if (up.error) return say(up.error.message, true);
    const { error } = await supabase.rpc("record_signed_agreement", { aid: ag.id, path }); say(error ? error.message : "Signed copy stored. Now approve it below.", !!error); load();
  }
  async function activate() {
    if (!(await askConfirm("Approve the signed Dealer Agreement?", "The partner becomes Active, the certificate is issued, and the login ID and password are e-mailed.", "Approve"))) return;
    const { error } = await supabase.rpc("activate_partner", { pid: partnerId }); if (error) return say(error.message, true);
    const r = await callFn("provision-login", { partner_id: partnerId });
    say(r.ok ? "Approved. Certificate issued; login ID and password e-mailed to the partner." : "Approved and certificate issued, but the login could not be created: " + r.error, !r.ok); load(); onActivated();
  }
  if (!p) return <p>Loading…</p>;
  const active = p.status === "Active";
  return (<div>{msg && <Msg kind={bad ? "bad" : "ok"}>{msg}</Msg>}
    {p.type_code !== "DLR" && <Msg kind="bad">This wording is the Dealer Agreement. Check it before using it for a {p.type_code}.</Msg>}
    {!ag && <p>No Dealer Agreement yet. {canAct && <button className="btn" onClick={create}>Start the Dealer Agreement</button>}</p>}
    {canAct && !locked && <p><button className="btn out" onClick={() => setTplOpen(true)}>View template</button>{" "}<label className="btn out" style={{ cursor: "pointer" }}>Attach template<input type="file" accept=".docx,.txt,.md" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ""; }} /></label> <span className="mini">View the standard Dealer Agreement wording, or attach your own template (Word or text) to use for this partner.</span></p>}
    {ag && <p>Agreement status: <b>{ag.status}</b>{ag.signed_at ? ` · signed ${when(ag.signed_at)}` : ""}{active ? " · partner Active" : ""}.</p>}
    {ag && !locked && canAct && <>
      {GROUPS.map((g) => <fieldset key={g} className="card" style={{ marginBottom: 8 }}><legend><b>{g}</b></legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
          {MOU_FIELDS.filter((f) => f.group === g).map((f) => <label key={f.key} style={{ fontSize: 13 }}>{f.label}
            {f.kind === "select" ? <select value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ width: "100%" }}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
              : f.kind === "area" ? <textarea rows={2} value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ width: "100%" }} />
              : <input value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ width: "100%" }} />}
            {f.hint && <small style={{ display: "block", color: "#667" }}>{f.hint}</small>}</label>)}
        </div></fieldset>)}
      {built.missing.length > 0 && <Msg kind="bad">Still blank (shown as ________ in the agreement): {missingLabels(built.missing).join(", ")}. Type “Not applicable” where something does not apply.</Msg>}
      <fieldset className="card" style={{ marginBottom: 8 }}><legend><b>Special terms and conditions (this dealer only)</b></legend>
        <p className="mini">Write any special terms agreed for this particular contract, in plain words. AI fits them into the Dealer Agreement as Schedule C, and changes a standard clause only where a term needs it. You review the result before it is applied.</p>
        <textarea rows={5} style={{ width: "100%" }} maxLength={MAX_SPECIAL} value={vals.special_terms ?? ""} onChange={(e) => set("special_terms", e.target.value)} placeholder="For example: 15 days credit on the first 3 orders. Territory also covers Anand. Free display stand for the first 10 outlets." />
        <p><button className="btn" disabled={merging || busy || (vals.special_terms ?? "").trim().length < 5} onClick={mergeAi}>{merging ? "AI is reading the agreement…" : "Merge with AI"}</button>{readStored(vals) && <> <button className="btn out" onClick={removeSpecial}>Remove special terms</button></>} <span className="mini">{(vals.special_terms ?? "").length} / {MAX_SPECIAL}</span></p>
        {readStored(vals) && !proposal && <Msg kind="ok">Special terms are merged into the agreement as Schedule C ({readStored(vals)!.clauses.length} clause{readStored(vals)!.clauses.length === 1 ? "" : "s"}{readStored(vals)!.amendments.length ? `, ${readStored(vals)!.amendments.length} amendment${readStored(vals)!.amendments.length === 1 ? "" : "s"}` : ""}). To change them, edit the terms above and press Merge with AI again.</Msg>}
        {built.skipped.length > 0 && <Msg kind="bad">{built.skipped.length} amendment{built.skipped.length === 1 ? "" : "s"} to standard clauses can no longer be applied because the wording they quote has changed. Press Merge with AI again.</Msg>}
        {proposal && (() => { const pv = applyProposal(proposalBase, proposal); return (<div className="note ai"><b>✦ AI proposal. Review before applying</b>
          {proposal.warnings.length > 0 && <><p style={{ margin: "8px 0 2px" }}><b>Needs your attention</b></p><ul style={{ margin: "0 0 0 18px" }}>{proposal.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></>}
          {proposal.clauses.length > 0 && <><p style={{ margin: "8px 0 2px" }}><b>Added as Schedule C ({proposal.clauses.length})</b></p>{proposal.clauses.map((c, i) => <p key={i} style={{ margin: "2px 0" }}><b>C.{i + 2} {c.title}.</b> {c.text}</p>)}</>}
          {proposal.amendments.length > 0 && <><p style={{ margin: "8px 0 2px" }}><b>Changes to standard clauses</b></p>{proposal.amendments.map((a, i) => { const sk = pv.skipped.find((x) => x.amendment === a); return (<div key={i} style={{ margin: "4px 0", opacity: sk ? 0.6 : 1 }}><b>Clause {a.clause}</b>{sk && <b> · cannot be applied: {sk.reason}</b>}<div className="mini">{a.why}</div><div>Before: <del>{a.find}</del></div><div>After: <ins>{a.replace}</ins></div></div>); })}</>}
          {proposal.clauses.length === 0 && proposal.amendments.length === 0 && <p>The AI found nothing to add.</p>}
          <p><button className="btn" disabled={proposal.clauses.length === 0 && pv.applied.length === 0} onClick={applyAi}>Apply to agreement</button> <button className="btn out" onClick={() => setProposal(null)}>Discard</button></p></div>); })()}
      </fieldset>
      <p><button className="btn out" onClick={() => setShowText(!showText)}>{showText ? "Hide" : "Edit"} full agreement text</button>{edited && <> <button className="btn out" onClick={() => { setBody(built.text); setEdited(false); }}>Discard text edits</button></>}</p>
      {showText && <textarea value={body} onChange={(e) => { setBody(e.target.value); setEdited(true); }} rows={22} style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} />}
      <p><button className="btn out" disabled={busy} onClick={save}>Save draft</button> <button className="btn out" disabled={busy} onClick={download}>Generate PDF</button> <button className="btn" disabled={busy} onClick={send}>Send via Leegality</button>{" "}
        <label className="btn out" style={{ cursor: "pointer" }}>Upload manually signed copy<input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => { manual(e.target.files?.[0]); e.target.value = ""; }} /></label></p>
      <p style={{ fontSize: 12 }}>Signing on Leegality: partner first, then the EarthLabs signatory (set under Agreements &gt; Company details). Manual signing: print the PDF, both sign, then upload the scan.</p></>}
    {ag?.status === "Signed" && !active && canAct && <p>Both sides have signed. <button className="btn" onClick={activate}>Approve signed agreement &amp; activate</button> <span style={{ fontSize: 12 }}>(Super Admin only)</span></p>}
    {ag?.status === "Signed" && active && canAct && <p>Partner is Active. <button className="btn out" onClick={async () => { const r = await callFn("provision-login", { partner_id: partnerId }); say(r.ok ? String(r.data?.note ?? "Login ID and password e-mailed.") : String(r.error), !r.ok); }}>Re-send login</button></p>}
    {tplOpen && <div className="mod-bg" role="dialog" aria-modal="true" aria-label="Dealer Agreement template" onClick={() => setTplOpen(false)}><div className="modal wide" onClick={(e) => e.stopPropagation()}>
      <header><h3 style={{ margin: 0, flex: 1 }}>Dealer Agreement template</h3><button className="x" aria-label="Close" onClick={() => setTplOpen(false)}>×</button></header>
      <div className="body"><p className="mini">The standard wording. Words in {"{{double braces}}"} are filled from the fields on the agreement screen.</p><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, fontFamily: "inherit", margin: 0 }}>{MOU_TEMPLATE_TEXT}</pre></div>
      <footer><button className="btn" onClick={() => setTplOpen(false)}>Close</button></footer></div></div>}
  </div>);
}
