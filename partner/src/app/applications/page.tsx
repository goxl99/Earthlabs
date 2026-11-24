"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import Drawer from "@/components/Drawer";
import { callFn } from "@/lib/fn";
import { supabase } from "@/lib/supabase";
import { Badge, Msg, when } from "@/components/ui";
import { askForm, askReason, notify } from "@/lib/dialog";
import { CATS, GJ } from "@/lib/geo";
import { REG_Q, REG_DOCS, answer, docsReceived, reviewApplication, type AppRow, type PartnerLite, type DocRow } from "@/lib/appreview";

type App = AppRow & { ref_no: string | null; contact_name: string; phone: string; email: string; reason: string | null; partner_id: string | null; created_at: string; field_note: string | null; history: { at: string; status: string; note: string | null; by: string }[] };
const kind = (s: string) => (["Approved", "MOU signed"].includes(s) ? "good" : s === "Rejected" ? "crit" : s === "Documents submitted" ? "warn" : s === "Agreement pending" ? "gold" : s === "More info needed" ? "ser" : "info") as "good" | "crit" | "warn" | "ser" | "info" | "gold";
const ref = (a: App) => a.ref_no ?? "APP-" + a.id.slice(0, 8).toUpperCase();
const Chip = ({ c }: { c: string }) => <span className="chip" style={{ background: CATS[c]?.col }}>{(CATS[c]?.s ?? c).toUpperCase()}</span>;

function Inner({ role }: { role: string }) {
  const canVerify = ["super_admin", "sales"].includes(role), canApprove = role === "super_admin";
  const [rows, setRows] = useState<App[]>([]); const [partners, setPartners] = useState<PartnerLite[]>([]); const [flt, setFlt] = useState("all"); const [cat, setCat] = useState("all");
  const [docs, setDocs] = useState<Record<string, DocRow[]>>({}); const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const [a, p] = await Promise.all([supabase.from("applications").select("*").order("created_at", { ascending: false }).limit(500), supabase.from("partners").select("id,name,type_code,status,district,exclusive").limit(2000)]);
    if (a.error) setErr(a.error.message); else setRows((a.data as App[]) ?? []);
    setPartners((p.data as PartnerLite[]) ?? []);
    const d = await supabase.from("application_documents").select("id,application_id,kind,status,file_name,file_path,note,not_applicable,is_current,uploaded_at").eq("is_current", true).limit(5000);
    const m: Record<string, DocRow[]> = {}; ((d.data as (DocRow & { application_id: string })[]) ?? []).forEach((x) => (m[x.application_id] ??= []).push(x)); setDocs(m);
  }, []);
  useEffect(() => { load(); }, [load]);
  const reviews = useMemo(() => new Map(rows.map((a) => [a.id, reviewApplication(a, rows.filter((x) => x.id !== a.id && x.district === a.district && x.status !== "Rejected" && !x.partner_id), partners, docs[a.id] ?? [])])), [rows, partners, docs]);
  const used = [...new Set(rows.map((a) => a.status))];
  const list = rows.filter((a) => (flt === "all" || a.status === flt) && (cat === "all" || a.type_code === cat));
  const cur = rows.find((a) => a.id === open) ?? null;

  async function step(a: App, status: string, patch: Record<string, unknown> = {}, done?: string) {
    const { error } = await supabase.from("applications").update({ status, reason: null, ...patch }).eq("id", a.id);
    if (error) { await notify("Could not update", error.message); return; }
    setMsg({ ok: true, t: done ?? `${a.business_name} moved to ${status}` }); await load();
  }
  async function askInfo(a: App) { const r = await askReason("Request more information", "What do you need from the applicant?", "Send request"); if (r) await step(a, "More info needed", { reason: r }, `Request sent to ${a.business_name}`); }
  async function reject(a: App) { const r = await askReason("Reject application", "Reason (shared with the applicant)", "Reject", true); if (r) await step(a, "Rejected", { reason: r }, "Application rejected"); }
  async function fieldDone(a: App) {
    const f = await askForm("Field verification result", [
      { name: "rep", label: "Market reputation (from at least two trade references)", type: "select", options: ["Weak (0.3)", "Fair (0.5)", "Good (0.7)", "Strong (0.9)"], value: "Good (0.7)" },
      { name: "reg", label: "Registration verified with the registrar?", type: "select", options: ["Yes", "No"], value: a.reg_verified ? "Yes" : "No" },
      { name: "note", label: "Field note", type: "textarea" }], { ok: "Save result" });
    if (!f) return;
    const { error } = await supabase.from("applications").update({ reputation: Number(/\(([\d.]+)\)/.exec(f.rep)?.[1]), reg_verified: f.reg === "Yes", field_note: f.note?.trim() || null }).eq("id", a.id);
    if (error) { await notify("Could not save", error.message); return; }
    setMsg({ ok: true, t: "Field verification result saved. It now counts in the joining score." }); await load();
  }
  async function approve(a: App) {
    const r = reviews.get(a.id)!;
    const { data: tpls } = await supabase.from("mou_templates").select("id,name,type_code").eq("active", true);
    const T = (tpls as { id: string; name: string; type_code: string | null }[]) ?? [];
    const catOpts = ["DLR", "DST", "STK", "INS"].map((c) => `${CATS[c].n} (${c})`);
    const f = await askForm(`Approve ${a.business_name}`, [
      { name: "cat", label: "Partner category", type: "select", options: catOpts, value: `${CATS[r.defCat].n} (${r.defCat})`, hint: "Policy: new partners normally start as Dealer" },
      { name: "d", label: "Territory (district)", type: "select", options: GJ.gd.map((d) => d.n), value: a.district },
      { name: "ex", label: "Exclusivity", type: "select", options: ["Non-exclusive (default)", "Exclusive"], hint: "Exclusive rights are earned and checked against existing agreements" },
      { name: "tpl", label: "Agreement template", type: "select", options: ["Prepare the agreement later", ...T.map((t) => t.name)] },
      { name: "yrs", label: "Agreement length", type: "select", options: ["1 year", "2 years", "3 years"], value: "1 year" },
      { name: "mt", label: "Monthly target (₹ lakh)", type: "number", value: a.type_code === "DST" ? 10 : 5, min: 0, required: true }],
      { ok: "Approve and issue Partner ID", cols: 2, intro: `Suggestion: ${r.rec} in ${a.district}. The decision is yours.` });
    if (!f) return;
    const code = /\((\w+)\)$/.exec(f.cat)![1]; const tpl = T.find((t) => t.name === f.tpl);
    if (tpl && tpl.type_code && tpl.type_code !== code) { await notify("Template does not fit", `“${tpl.name}” is for another partner type. Choose a matching template or prepare the agreement later.`); return; }
    const { data, error } = await supabase.rpc("approve_application", { app: a.id, cat: code, dist: f.d, excl: f.ex === "Exclusive", years: parseInt(f.yrs), target: Number(f.mt), tpl: tpl?.id ?? null });
    if (error) {
      const m = /^Exclusive territory blocked: (.*)$/.exec(error.message);
      await (m ? notify("Exclusive territory blocked", `⛔ ${m[1]}. Exclusive rights cannot overlap an existing agreement. Choose non-exclusive, or another territory.`) : notify("Could not approve", error.message));
      return;
    }
    setMsg({ ok: true, t: `Approved. Partner ID ${data} issued${tpl ? " and the agreement draft generated" : ""}.` }); await load();
  }

  async function schedule(a: App) {
    const f = await askForm("Schedule field verification", [{ name: "note", label: "Visit details (the applicant sees this)", type: "textarea", required: true, hint: "For example: visit on Friday, please keep your registration originals ready" }], { ok: "Schedule visit" });
    if (f) await step(a, "Field verification", { reason: f.note.trim() }, "Field verification scheduled");
  }
  async function review(d: DocRow, st: "Accepted" | "Rejected") {
    let note: string | null = null;
    if (st === "Rejected") { note = await askReason("Reject document", `What is wrong with “${d.kind}”?`, "Reject document", true); if (!note) return; }
    const { error } = await supabase.rpc("review_document", { doc: d.id, st, note });
    if (error) { await notify("Could not review", error.message); return; }
    setMsg({ ok: true, t: `${d.kind}: ${st}` }); await load();
  }
  async function view(d: DocRow) {
    if (!d.file_path) return;
    const { data, error } = await supabase.storage.from("application-docs").createSignedUrl(d.file_path, 120);
    if (error || !data) { await notify("Could not open the file", error?.message ?? "No link returned"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function issueLogin(a: App) {
    const r = await callFn("provision-login", { partner_id: a.partner_id });
    setMsg({ ok: r.ok, t: r.ok ? (r.data?.created === false ? String(r.data?.note ?? "") : r.data?.emailed ? "Login ID and password e-mailed to the partner." : "Login created, but the e-mail could not be sent. Ask the partner to use Forgot password.") : "Could not create the login: " + r.error }); await load();
  }
  const foot = (a: App) => {
    if (a.status === "Approved" && canApprove && a.partner_id) return <button className="btn pri" onClick={() => issueLogin(a)}>Issue / re-send login</button>;
    const s = a.status; if (!canVerify || ["Approved", "Rejected", "Agreement pending", "MOU signed"].includes(s)) return null;
    return (<>
      {s === "Submitted" && <button className="btn pri" onClick={() => step(a, "Documents requested", {}, "Documents requested from the applicant")}>Request documents</button>}
      {s === "More info needed" && <button className="btn pri" onClick={() => step(a, "Documents submitted", {}, "Information received, back in review")}>Information received → back to review</button>}
      {["Documents submitted", "Field verification"].includes(s) && <button className="btn" onClick={() => fieldDone(a)}>Record field verification result</button>}
      {s === "Documents submitted" && <button className="btn" onClick={() => schedule(a)}>Schedule field verification</button>}
      {["Documents submitted", "Field verification"].includes(s) && canApprove && <button className="btn pri" onClick={() => approve(a)}>Approve…</button>}
      {s !== "More info needed" && <button className="btn" onClick={() => askInfo(a)}>Request more information</button>}
      <button className="btn red" onClick={() => reject(a)}>Reject…</button>
    </>);
  };

  const body = (a: App) => {
    const r = reviews.get(a.id)!, qs = REG_Q[a.type_code] ?? [], mine = docs[a.id] ?? [], tracked = docsReceived(a, mine) != null, req = REG_DOCS[a.type_code] ?? [];
    return (<>
      <div className="row"><Badge kind={kind(a.status)}>{a.status}</Badge><Chip c={a.type_code} />{a.partner_id && <Badge kind="good">Partner ID {a.partner_id}</Badge>}</div>
      {["Documents submitted", "Field verification"].includes(a.status) && !canApprove && <div className="note">Final approval stays with authorised EarthLabs management. Your role ({role.replace("_", " ")}) can verify and recommend, not approve.</div>}
      {["Agreement pending", "MOU signed"].includes(a.status) && <div className="note">Approved. The rest happens on Agreements &amp; Certificates: prepare and send the MOU, then approve the signed copy to activate the partner.</div>}
      <div className="note ai"><b>✦ AI application review</b> <span className="mini">(rule-based on the answers below; the recommendation never approves anything)</span><p style={{ margin: "6px 0 0" }}>{r.summary}</p></div>
      <div className="grid g2">
        <div className="card flat"><h3>Completeness</h3><div style={{ fontSize: 22, fontWeight: 700 }}>{r.comp}%</div><div className="bar"><i className={r.comp === 100 ? "g" : "w"} style={{ width: `${r.comp}%` }} /></div>
          <div className="mini" style={{ marginTop: 6 }}>{r.unanswered.length ? `Not answered: ${r.unanswered.join(", ")}` : "All questions answered"}{r.miss.length ? ` · Missing documents: ${r.miss.join(", ")}` : ""}</div></div>
        <div className="card flat"><h3>Suggested category and territory</h3><div><b>{r.rec}</b></div><div className="mini">{r.recT}</div>{r.suit != null && <div className="mini" style={{ marginTop: 6 }}>Joining score (verified items): <b>{Math.round(r.suit * 100)}</b> / 100</div>}</div></div>
      {(r.risks.length > 0 || r.checks.length > 0) && <><h3 style={{ marginTop: 12 }}>Risks and checks</h3>{r.risks.map((x, i) => <div key={i} className={`note${x[0] === "crit" ? " bad" : ""}`}>{x[0] === "crit" ? "⛔" : "⚠"} {x[1]}</div>)}{r.checks.map((x, i) => <div key={i} className="note">ℹ {x}</div>)}</>}
      {r.join && <><h3 style={{ marginTop: 12 }}>Joining criteria (from your Performance Matrix)</h3>
        <div className="tw"><table className="t"><thead><tr><th>Criterion</th><th className="n">Weight</th><th className="n">Actual</th><th className="n">Score</th><th className="n">Min</th></tr></thead><tbody>{r.join.rows.map((x) => <tr key={x.n}><td>{x.n}</td><td className="n">{Math.round(x.w * 100)}%</td><td className="n">{x.actual == null ? <Badge kind="mute">Unverified</Badge> : x.actual}</td><td className="n">{x.score == null ? "—" : Math.round(x.score * 100) + (x.pass ? "" : " ⚠")}</td><td className="n">{Math.round(x.min * 100)}</td></tr>)}</tbody></table></div>
        <p className="mini">Unverified items are shown separately and not counted as zero. Must-pass: valid company registration ({a.reg_verified ? "verified" : <b style={{ color: "var(--crit)" }}>not verified</b>}); the signed MOU and opening order come later.</p></>}
      <h3 style={{ marginTop: 12 }}>Applicant</h3><div className="mini">{a.contact_name} · {a.phone} · {a.email}{a.gstin ? ` · GSTIN ${a.gstin}` : ""} · submitted {when(a.created_at)}</div>
      <h3 style={{ marginTop: 12 }}>Their answers</h3>
      <div className="tw"><table className="t"><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>{qs.map((q) => <tr key={q.key}><td>{q.label}</td><td>{answer(a, q) ?? "—"}</td></tr>)}</tbody></table></div>
      <h3 style={{ marginTop: 12 }}>Documents</h3>
      {tracked ? req.map((k) => { const d = mine.find((x) => x.kind === k); return (<div className="check" key={k}><span>{!d ? "⬜" : d.not_applicable ? "➖" : d.status === "Accepted" ? "✅" : d.status === "Rejected" ? "⛔" : "📎"}</span>
        <div style={{ flex: 1 }}>{k}{d && !d.not_applicable && <div className="mini">{d.file_name} · {d.status}{d.note ? ` · ${d.note}` : ""}</div>}{d?.not_applicable && <div className="mini">Marked not applicable</div>}{!d && <div className="mini">Not uploaded yet</div>}</div>
        {d && !d.not_applicable && <><button className="btn sm" onClick={() => view(d)}>View</button>{canVerify && d.status !== "Accepted" && <button className="btn sm" onClick={() => review(d, "Accepted")}>Accept</button>}{canVerify && d.status !== "Rejected" && <button className="btn sm red" onClick={() => review(d, "Rejected")}>Reject</button>}</>}</div>); })
        : <><div className="mini">Documents are requested after the first review and uploaded by the applicant from the tracking page. Required for a {CATS[a.type_code]?.s}:</div>{req.map((k) => <div className="check" key={k}><span>⬜</span><div>{k}</div></div>)}</>}
      {(a.reputation != null || a.reg_verified != null || a.field_note) && <><h3 style={{ marginTop: 12 }}>Field verification record</h3><table className="t"><tbody><tr><td>Registration verified</td><td>{a.reg_verified == null ? "—" : a.reg_verified ? "Yes" : "No"}</td></tr><tr><td>Market reputation</td><td>{a.reputation ?? "—"}</td></tr><tr><td>Field note</td><td>{a.field_note ?? "—"}</td></tr></tbody></table></>}
      <h3 style={{ marginTop: 12 }}>History</h3>
      <div className="tl">{(a.history ?? []).map((h, i) => <div key={i}><b>{h.status}</b>{h.note ? `: ${h.note}` : ""}<br /><small>{when(h.at)} · {h.by}</small></div>)}<div><b>Application submitted</b><br /><small>{when(a.created_at)} · {a.contact_name}</small></div></div>
      {a.reason && <div className="note bad"><b>Reason:</b> {a.reason}</div>}
      {a.partner_id && <p style={{ marginTop: 10 }}><Link className="btn sm" href={`/partners/view/?id=${a.partner_id}`}>Open partner profile</Link></p>}
    </>);
  };

  return (<>
    <div className="row"><h1>Applications</h1><div className="sp" /><Link className="btn" href="/register/">Open the public registration site</Link></div>
    <p className="sub">Everyone who registers lands here. Registration never authorises trading: each application is verified and then approved by management. Click a row to review it.</p>
    {err && <Msg kind="bad">{err}</Msg>}{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="row" style={{ marginBottom: 10 }}>
      <button className="btn sm" aria-pressed={flt === "all"} onClick={() => setFlt("all")}>All ({rows.length})</button>
      {used.map((s) => <button key={s} className="btn sm" aria-pressed={flt === s} onClick={() => setFlt(s)}>{s} ({rows.filter((a) => a.status === s).length})</button>)}
      <div className="sp" /><select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All categories</option>{["DLR", "DST", "STK", "INS"].map((c) => <option key={c} value={c}>{CATS[c].s}</option>)}</select></div>
    <div className="tw"><table className="t"><thead><tr><th>ID</th><th>Applicant</th><th>Category</th><th>District</th><th>Submitted</th><th className="n">Complete</th><th>Status</th><th>Flags</th></tr></thead>
      <tbody>{list.map((a) => { const r = reviews.get(a.id)!; return (<tr key={a.id} tabIndex={0} style={{ cursor: "pointer" }} onClick={() => setOpen(a.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(a.id)}>
        <td>{ref(a)}</td><td><b>{a.business_name}</b><div className="mini">{a.contact_name}</div></td><td><Chip c={a.type_code} /></td><td>{a.district}</td><td>{when(a.created_at)}</td><td className="n">{r.comp}%</td><td><Badge kind={kind(a.status)}>{a.status}</Badge></td>
        <td>{r.risks.length ? <Badge kind={r.crit ? "crit" : "warn"}>{r.risks.length}</Badge> : "—"}</td></tr>); })}
        {list.length === 0 && <tr><td colSpan={8}>Nothing here.</td></tr>}</tbody></table></div>
    {cur && <Drawer title={cur.business_name} sub={`${ref(cur)} · ${CATS[cur.type_code]?.n} · ${cur.district}`} foot={foot(cur)} onClose={() => setOpen(null)}>{body(cur)}</Drawer>}
  </>);
}
export default function Page() { return <Shell page="applications">{(p) => <Inner role={p.role} />}</Shell>; }
