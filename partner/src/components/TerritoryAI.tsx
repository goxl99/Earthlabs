"use client";
import { useState } from "react";
import { callFn } from "@/lib/fn";
import { buildContext, mailtoLink, riskyIn, MODE_LABEL, type Advice, type Mode } from "@/lib/territoryAi";
import type { CoverageData } from "@/components/Coverage";
import type { Lvl } from "@/lib/geo";
import { Msg } from "@/components/ui";
import Link from "next/link";

/** AI sales, distribution and export advisor for the area on the map. It advises only: nothing is sent or changed from here. */
export default function TerritoryAI({ lvl, data, district }: { lvl: Lvl; data: CoverageData; district?: string | null }) {
  const [open, setOpen] = useState(false); const [mode, setMode] = useState<Mode>("find_dealers"); const [q, setQ] = useState("");
  const [lead, setLead] = useState({ name: "", business: "", email: "", notes: "" }); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [adv, setAdv] = useState<Advice | null>(null); const [done, setDone] = useState<Mode | null>(null); const [note, setNote] = useState("");
  const scope: Lvl = district ? { ...lvl, d: district } : lvl;
  async function run(m: Mode) {
    setMode(m); setErr(""); setNote(""); setAdv(null); setBusy(true);
    const { cut, ...ctx } = buildContext(scope, data.counts, data.pot);
    const r = await callFn("territory-ai", { mode: m, question: q, lead: { name: lead.name, business: lead.business, district: district ?? "", notes: lead.notes }, ctx });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "The advisor could not answer");
    setAdv((r.data as { advice: Advice }).advice); setDone(m); if (cut) setNote(`This area is large, so the advisor looked at the ${ctx.areas.length} districts with the most potential. Pick a smaller area for a closer look.`);
  }
  const needsLead = mode === "outreach"; const mail = adv?.email ? mailtoLink(lead.email, adv.email.subject, adv.email.body) : null; const risky = adv?.email ? riskyIn(adv.email.subject + " " + adv.email.body) : false;
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => setNote("Copied."), () => setNote("Copy was blocked here. Select the text and copy it."));
  return (<div className="card flat" style={{ marginBottom: 10 }}>
    <div className="row"><h2 style={{ margin: 0 }}>✦ AI sales &amp; distribution advisor</h2><div className="sp" /><button className="btn sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Open"}</button></div>
    <p className="mini" style={{ margin: "4px 0 0" }}>Finds where to recruit dealers, drafts the first e-mail, and helps plan export. Works on the area selected above{district ? ` (${district})` : ""}. It only advises: nothing is sent or changed from here.</p>
    {open && <div style={{ marginTop: 8 }}>
      <p className="note" style={{ margin: "0 0 8px" }}>Want real dealers with contact details and automatic first e-mails? Use <Link href={`/outreach/${district ? "?d=" + encodeURIComponent(district) : ""}`}><b>Dealer Outreach</b></Link>: the AI searches the web for dealers of similar products, you approve, and it sends and tracks replies.</p>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>{(["find_dealers", "outreach", "export", "ask"] as Mode[]).map((m) => <button key={m} className={"btn sm" + (mode === m ? "" : " out")} aria-pressed={mode === m} onClick={() => { setMode(m); setAdv(null); setErr(""); setNote(""); }}>{MODE_LABEL[m]}</button>)}</div>
      {needsLead && <div className="grid g2" style={{ marginTop: 8 }}>
        <label className="mini">Lead&apos;s name<input value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} maxLength={80} /></label>
        <label className="mini">Business<input value={lead.business} onChange={(e) => setLead({ ...lead, business: e.target.value })} maxLength={120} /></label>
        <label className="mini">Their e-mail (to open the draft in your mail app)<input type="email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} /></label>
        <label className="mini">What you know about them<input value={lead.notes} onChange={(e) => setLead({ ...lead, notes: e.target.value })} maxLength={800} placeholder="e.g. runs an industrial supplies shop in GIDC Makarpura" /></label></div>}
      <label className="mini" style={{ display: "block", marginTop: 8 }}>{mode === "ask" ? "Your question" : "Anything specific? (optional)"}<textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} maxLength={800} style={{ width: "100%" }} placeholder={mode === "export" ? "e.g. Which two countries should we test first for hand wash?" : mode === "ask" ? "e.g. Which district should we recruit in first, and why?" : "e.g. focus on industrial suppliers"} /></label>
      <p><button className="btn" disabled={busy || (mode === "ask" && q.trim().length < 3) || (needsLead && !lead.name.trim() && !lead.business.trim())} onClick={() => run(mode)}>{busy ? "Thinking…" : MODE_LABEL[mode]}</button></p>
      {err && <Msg kind="bad">{err}</Msg>}
      {adv && done && <div className="note ai" style={{ marginTop: 4 }}>
        {adv.headline && <p style={{ margin: "0 0 6px" }}><b>{adv.headline}</b></p>}
        {adv.points.map((p, i) => <div className="check" key={i}><div style={{ flex: 1 }}><b>{p.title}</b><div className="mini" style={{ whiteSpace: "pre-wrap" }}>{p.detail}</div></div></div>)}
        {adv.email && <div style={{ marginTop: 8 }}>
          {risky && <Msg kind="bad">Check this draft before sending: it mentions a price, a claim or a promise that only the company may make.</Msg>}
          <p className="mini" style={{ margin: "4px 0" }}><b>Subject:</b> {adv.email.subject}</p>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: 0, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>{adv.email.body}</pre>
          <p className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={() => copy(`Subject: ${adv.email!.subject}\n\n${adv.email!.body}`)}>Copy draft</button>{mail ? <a className="btn sm out" href={mail}>Open in my mail app</a> : <span className="mini">Add their e-mail address above to open it in your mail app.</span>}</p></div>}
        {adv.caveats.length > 0 && <ul className="mini" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{adv.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        <p className="mini" style={{ margin: "8px 0 0" }}>AI suggestion for review. Check facts and wording before you act.</p></div>}
      {note && <p className="mini">{note}</p>}
    </div>}
  </div>);
}
