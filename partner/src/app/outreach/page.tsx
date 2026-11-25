"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/fn";
import { Badge, Kpi, Msg, when } from "@/components/ui";
import { askConfirm } from "@/lib/dialog";
import { DISTRICTS } from "@/lib/districts";
import { leadMail, parsePasted, statusKind, statusLabel, summarize, waLink, waMessage, STATUSES, type Lead, type Reply } from "@/lib/outreach";

type Cfg = { reply_to: string | null; daily_cap: number };
const NEXT_CHOICES = ["Call them", "Send product details", "Invite to register on the portal", "Schedule a visit", "Follow up in 7 days", "Closed: not interested", "Read the reply and decide"];

function Inner({ isSuper }: { isSuper: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([]); const [cfg, setCfg] = useState<Cfg>({ reply_to: null, daily_cap: 25 }); const [unmatched, setUnmatched] = useState(0);
  const [area, setArea] = useState(""); const [st, setSt] = useState(""); const [q, setQ] = useState(""); const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState<{ k: "ok" | "bad" | "note"; t: string } | null>(null);
  const [dist, setDist] = useState("Vadodara"); const [focus, setFocus] = useState("");
  const [paste, setPaste] = useState(false); const [pText, setPText] = useState(""); const [pDist, setPDist] = useState("Vadodara");
  const [open, setOpen] = useState<Lead | null>(null); const [rep, setRep] = useState<Reply[]>([]); const [edit, setEdit] = useState<Partial<Lead>>({});
  const [setf, setSetf] = useState({ reply_to: "", daily_cap: "25" });

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("dealer_leads").select("*").order("created_at", { ascending: false }).limit(3000),
      supabase.rpc("lead_settings"),
      supabase.from("lead_replies").select("id", { count: "exact", head: true }).is("lead_id", null)]);
    if (a.error) setMsg({ k: "bad", t: a.error.message }); else setLeads((a.data as Lead[]) ?? []);
    const s = (b.data as Cfg[] | null)?.[0]; if (s) { setCfg(s); setSetf({ reply_to: s.reply_to ?? "", daily_cap: String(s.daily_cap) }); }
    setUnmatched(c.count ?? 0);
  }, []);
  useEffect(() => { load(); const d = new URLSearchParams(location.search).get("d"); if (d && DISTRICTS.includes(d)) { setDist(d); setPDist(d); setArea(d); } }, [load]);

  const rows = useMemo(() => summarize(leads), [leads]);
  const shown = useMemo(() => leads.filter((l) => (!area || l.district === area) && (!st || (st === "Sending" ? l.status === "Approved" || l.status === "Queued" : l.status === st)) &&
    (!q || [l.business, l.name, l.email, l.phone, l.products].some((x) => (x ?? "").toLowerCase().includes(q.toLowerCase())))), [leads, area, st, q]);
  const tot = useMemo(() => rows.reduce((a, r) => ({ leads: a.leads + r.leads, toReview: a.toReview + r.toReview, sent: a.sent + r.sent, replied: a.replied + r.replied, todo: a.todo + r.todo, converted: a.converted + r.converted }), { leads: 0, toReview: 0, sent: 0, replied: 0, todo: 0, converted: 0 }), [rows]);
  const ready = (l: Lead) => l.status === "Found" && !!l.email && !!l.subject && !!l.body;
  const selReady = shown.filter((l) => sel.has(l.id) && ready(l));

  async function find() {
    setBusy("find"); setMsg(null);
    const r = await callFn("lead-discover", { district: dist, focus });
    setBusy("");
    if (!r.ok) return setMsg({ k: "bad", t: r.error ?? "The search did not work" });
    const d = r.data as { added: number; withEmail: number; known: number; found: number; dropped: number };
    setMsg({ k: d.added ? "ok" : "note", t: d.added
      ? `Found ${d.added} new dealer${d.added === 1 ? "" : "s"} in ${dist}, ${d.withEmail} with an e-mail address.${d.known ? ` ${d.known} were already on your list or are already partners.` : ""}${d.dropped ? ` ${d.dropped} left out (only on an old page or a directory with no website of their own).` : ""} Check each one, then approve or WhatsApp.`
      : d.found ? `Nothing new in ${dist}: ${d.dropped ? `${d.dropped} were only on old or directory pages` : "all were already known"}. Press Find dealers again to search more, or try a nearby district.` : `The AI found no dealer in ${dist} it could confirm from a recent public page. Try again, a nearby district, or add your own list.` });
    setArea(dist); load();
  }
  async function approve() {
    if (!cfg.reply_to) return setMsg({ k: "bad", t: "Set the reply address first (Super Admin, section below). No mail goes out until replies have somewhere to land." });
    if (!selReady.length) return setMsg({ k: "note", t: "Tick leads that are To review and have an e-mail address." });
    const ok = await askConfirm("Approve and send?", `${selReady.length} dealer${selReady.length === 1 ? "" : "s"} will get the first e-mail automatically, up to ${cfg.daily_cap} a day (the rest follow the next day). Each mail has a STOP line, and anyone who replies STOP is never mailed again.`, "Approve and send");
    if (!ok) return;
    setBusy("approve");
    const { data, error } = await supabase.rpc("approve_leads", { ids: selReady.map((l) => l.id) });
    setBusy(""); setSel(new Set());
    setMsg(error ? { k: "bad", t: error.message } : { k: "ok", t: `${data as number} approved. They are being sent now.` + ((data as number) < selReady.length ? " The rest could not be approved (already a partner or applicant, or the draft is empty)." : "") }); load();
  }
  async function mark(s: string, ids: string[]) {
    if (!ids.length) return; setBusy("mark");
    const { error } = await supabase.rpc("set_lead_status", { ids, s }); setBusy(""); setSel(new Set());
    setMsg(error ? { k: "bad", t: error.message } : { k: "ok", t: "Updated." }); load(); setOpen(null);
  }
  async function addPasted() {
    const { rows: rs, skipped } = parsePasted(pText); if (!rs.length) return setMsg({ k: "bad", t: "No usable lines. Each line needs a business name and an e-mail or phone." });
    setBusy("paste"); let added = 0, dup = 0, bad = 0;
    for (const r of rs) {
      const m = leadMail({ name: r.name, business: r.business, district: pDist });
      const { error } = await supabase.from("dealer_leads").insert({ district: pDist, business: r.business, name: r.name, email: r.email, phone: r.phone, source: "staff", status: "Found", subject: m.subject, body: m.body });
      if (!error) added++; else if (error.code === "23505") dup++; else bad++;
    }
    setBusy(""); setPaste(false); setPText(""); setArea(pDist);
    setMsg({ k: added ? "ok" : "bad", t: `Added ${added}.${dup ? ` ${dup} already on the list.` : ""}${skipped ? ` ${skipped} line${skipped === 1 ? "" : "s"} skipped (no way to reach them).` : ""}${bad ? ` ${bad} failed.` : ""}` }); load();
  }
  async function openLead(l: Lead) {
    setOpen(l); setEdit({}); setRep([]);
    const { data } = await supabase.from("lead_replies").select("*").eq("lead_id", l.id).order("received_at", { ascending: false }).limit(20); setRep((data as Reply[]) ?? []);
  }
  async function saveEdit() {
    if (!open) return; const patch = Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined));
    if (patch.email) patch.email = String(patch.email).trim().toLowerCase();
    const { error } = await supabase.from("dealer_leads").update(patch).eq("id", open.id);
    if (error) return setMsg({ k: "bad", t: error.code === "23505" ? "That e-mail is already on the list." : error.message });
    setMsg({ k: "ok", t: "Saved." }); setOpen(null); load();
  }
  async function saveSettings() {
    const { error } = await supabase.rpc("set_lead_settings", { reply_to: setf.reply_to.trim() || null, daily_cap: Number(setf.daily_cap) || 25 });
    setMsg(error ? { k: "bad", t: error.message } : { k: "ok", t: "Saved. Approved leads are released within 10 minutes." }); load();
  }
  async function wa(l: Lead) {
    await supabase.from("dealer_leads").update({ wa_at: new Date().toISOString() }).eq("id", l.id); load();
  }
  const waBtn = (l: Lead, sm = true) => { const h = waLink(l.phone, waMessage({ name: l.name, district: l.district })); return h ? <a className={"btn" + (sm ? " sm" : "")} style={{ background: "#25D366", borderColor: "#25D366", color: "#073b1c" }} href={h} target="_blank" rel="noopener noreferrer" onClick={() => wa(l)}>WhatsApp</a> : null; };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const field = (k: keyof Lead) => (edit[k] as string | undefined) ?? ((open?.[k] as string | null) ?? "");
  const locked = open ? !["Found", "Rejected"].includes(open.status) : true;

  return (<>
    <div className="row"><h1>Dealer Outreach</h1><div className="sp" /><button className="btn out" onClick={() => setPaste(true)}>Add my own list</button></div>
    <p className="sub">Find dealers who already sell similar products, approve them, and the first e-mail goes out automatically. Replies come back here with the next step. Nothing is sent without your approval.</p>
    {msg && <Msg kind={msg.k === "note" ? "note" : msg.k}>{msg.t}</Msg>}
    {!cfg.reply_to && <Msg kind="bad">Mail to dealers is switched off until a Super Admin sets the reply address below. This stops dealers writing back to a mailbox nobody reads.</Msg>}
    <div className="kpis"><Kpi label="Dealers found" value={tot.leads} /><Kpi label="To review" value={tot.toReview} note="waiting for your approval" /><Kpi label="Mails sent" value={tot.sent} /><Kpi label="Replied" value={tot.replied} note={tot.todo ? `${tot.todo} need a next step` : undefined} /><Kpi label="Converted" value={tot.converted} /></div>

    <div className="card flat" style={{ marginBottom: 10 }}>
      <h2 style={{ margin: 0 }}>✦ Find dealers with AI</h2>
      <p className="mini" style={{ margin: "4px 0 8px" }}>Searches the web for businesses in the area that trade in similar products (cleaning and housekeeping supplies, soap and hand wash, industrial hygiene, hardware, FMCG wholesale). It saves only contact details it found on a public page, with a link so you can check. It never guesses an address.</p>
      <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <label className="mini">Area<select value={dist} onChange={(e) => setDist(e.target.value)}>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="mini" style={{ flex: 1, minWidth: 220 }}>Focus (optional)<input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={300} placeholder="e.g. industrial cleaning chemicals, hotel and hospital suppliers" /></label>
        <button className="btn" disabled={busy === "find"} onClick={find}>{busy === "find" ? "Searching… (up to 2 minutes)" : "Find dealers"}</button></div>
    </div>

    <div className="card" style={{ marginBottom: 10 }}>
      <h2 style={{ marginTop: 0 }}>By area</h2>
      {rows.length === 0 ? <p className="mini">No leads yet. Pick an area above and press Find dealers.</p> :
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Area</th><th>Leads</th><th>To review</th><th>Sending</th><th>Mails sent</th><th>WhatsApp</th><th>Replied</th><th>Reply needs action</th><th>Converted</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.district} style={{ cursor: "pointer", background: area === r.district ? "var(--soft, #f3f7f3)" : undefined }} onClick={() => setArea(area === r.district ? "" : r.district)}>
            <td><b>{r.district}</b></td><td>{r.leads}</td><td>{r.toReview}</td><td>{r.sending}</td><td>{r.sent}</td><td>{r.wa || "–"}</td><td>{r.sent || r.wa ? `${r.replied} of ${r.sent + r.wa}` : "–"}</td><td>{r.todo ? <Badge kind="good">{r.todo}</Badge> : "–"}</td><td>{r.converted}</td></tr>)}</tbody></table></div>}
      <p className="mini" style={{ margin: "6px 0 0" }}>Click an area to filter the list below.{unmatched > 0 && ` ${unmatched} repl${unmatched === 1 ? "y" : "ies"} came from an address that is not on the list; they are saved, not lost.`}</p>
    </div>

    <div className="card">
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Dealers{area ? ` in ${area}` : ""} ({shown.length})</h2><div className="sp" />
        <select aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}><option value="">All areas</option>{rows.map((r) => <option key={r.district}>{r.district}</option>)}</select>
        <select aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)}><option value="">All statuses</option>{["Found", "Sending", ...STATUSES.filter((s) => !["Found", "Approved", "Queued"].includes(s))].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
        <input aria-label="Search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 160 }} /></div>
      <p className="row" style={{ gap: 8, margin: "8px 0" }}>
        <button className="btn" disabled={busy !== "" || !selReady.length} onClick={approve}>Approve &amp; send ({selReady.length})</button>
        <button className="btn out" disabled={busy !== "" || !shown.some((l) => sel.has(l.id) && ["Found", "Approved"].includes(l.status))} onClick={() => mark("Rejected", shown.filter((l) => sel.has(l.id) && ["Found", "Approved"].includes(l.status)).map((l) => l.id))}>Not a fit</button>
        <button className="btn out" disabled={busy !== "" || ![...sel].length} onClick={() => mark("Converted", [...sel])}>Mark converted</button>
        <span className="mini">{sel.size} ticked</span></p>
      <div style={{ overflowX: "auto" }}><table><thead><tr><th><input type="checkbox" aria-label="Tick all" checked={shown.length > 0 && shown.every((l) => sel.has(l.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((l) => l.id)) : new Set())} /></th><th>Dealer</th><th>Contact</th><th>Area</th><th>Status</th><th>Sent</th><th>Reply and next step</th><th /></tr></thead>
        <tbody>{shown.map((l) => <tr key={l.id}>
          <td><input type="checkbox" aria-label={`Tick ${l.business}`} checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
          <td><b>{l.business}</b>{l.name && <div className="mini">{l.name}</div>}<div className="mini">{l.source === "ai_search" ? <>AI found · {l.source_url ? <a href={l.source_url} target="_blank" rel="noopener noreferrer">source page</a> : "no link"}</> : "Added by staff"}</div></td>
          <td>{l.email ?? <span className="mini">no e-mail</span>}{l.phone && <div className="mini">{l.phone}</div>}{l.wa_at && <div className="mini">WhatsApp opened {when(l.wa_at)}</div>}</td>
          <td>{l.district}</td><td><Badge kind={statusKind(l.status)}>{statusLabel(l.status)}</Badge></td><td>{when(l.sent_at)}</td>
          <td>{l.last_reply_at && <div className="mini">Replied {when(l.last_reply_at)}</div>}{l.next_step && <div><b>{l.next_step}</b></div>}{l.next_step_note && <div className="mini">{l.next_step_note}</div>}</td>
          <td style={{ whiteSpace: "nowrap" }}>{waBtn(l)} <button className="btn sm out" onClick={() => openLead(l)}>Open</button></td></tr>)}
          {shown.length === 0 && <tr><td colSpan={8} className="mini">Nothing here yet.</td></tr>}</tbody></table></div>
    </div>

    {isSuper && <div className="card flat" style={{ marginTop: 10 }}>
      <h2 style={{ marginTop: 0 }}>Sending settings (Super Admin)</h2>
      <div className="grid g2"><label className="mini">Replies go to (a mailbox set up to receive replies)<input type="email" value={setf.reply_to} onChange={(e) => setSetf({ ...setf, reply_to: e.target.value })} placeholder="partners@replies.yourdomain.com" /></label>
        <label className="mini">Most mails a day<input type="number" min={1} max={200} value={setf.daily_cap} onChange={(e) => setSetf({ ...setf, daily_cap: e.target.value })} /></label></div>
      <p className="mini">A low daily cap protects your sender reputation. The reply address must be a mailbox Resend receives mail for, so replies reach this screen (see docs/OUTREACH_SETUP.md).</p>
      <p><button className="btn" onClick={saveSettings}>Save settings</button></p></div>}

    {paste && <div className="mod-bg" role="dialog" aria-modal="true" aria-label="Add my own list" onClick={() => setPaste(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2>Add my own list</h2>
      <p className="mini">One dealer per line: business, contact name, e-mail, phone (separate with commas). Lines with neither an e-mail nor a phone are skipped. Use only business contacts.</p>
      <label className="mini">Area<select value={pDist} onChange={(e) => setPDist(e.target.value)}>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></label>
      <textarea rows={8} style={{ width: "100%", marginTop: 6 }} value={pText} onChange={(e) => setPText(e.target.value)} placeholder={"Acme Hygiene Supplies, R. Shah, sales@acme.in, 98765 43210"} />
      <footer><button className="btn out" onClick={() => setPaste(false)}>Cancel</button><button className="btn" disabled={busy === "paste" || !pText.trim()} onClick={addPasted}>{busy === "paste" ? "Adding…" : "Add to the list"}</button></footer></div></div>}

    {open && <div className="mod-bg" role="dialog" aria-modal="true" aria-label="Dealer" onClick={() => setOpen(null)}><div className="modal wide" onClick={(e) => e.stopPropagation()}>
      <div className="row"><h2 style={{ margin: 0 }}>{open.business}</h2><div className="sp" /><Badge kind={statusKind(open.status)}>{statusLabel(open.status)}</Badge></div>
      {open.source === "ai_search" && <p className="mini">Found by the AI{open.source_url && <> on <a href={open.source_url} target="_blank" rel="noopener noreferrer">this page</a></>}. Check the details against the page before approving.</p>}
      <div className="grid g2" style={{ marginTop: 6 }}>
        {([["business", "Business"], ["name", "Contact name"], ["email", "E-mail"], ["phone", "Phone"], ["products", "Deals in"]] as [keyof Lead, string][]).map(([k, n]) => <label key={k} className="mini">{n}<input value={field(k)} disabled={locked && k === "email"} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>)}
        <label className="mini">Next step<select value={field("next_step")} onChange={(e) => setEdit({ ...edit, next_step: e.target.value })}><option value="">{field("next_step") || "Choose"}</option>{NEXT_CHOICES.map((n) => <option key={n}>{n}</option>)}</select></label></div>
      <label className="mini" style={{ display: "block", marginTop: 6 }}>Note<input style={{ width: "100%" }} value={field("next_step_note")} onChange={(e) => setEdit({ ...edit, next_step_note: e.target.value })} /></label>
      <label className="mini" style={{ display: "block", marginTop: 6 }}>First e-mail: subject<input style={{ width: "100%" }} value={field("subject")} disabled={locked} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></label>
      <label className="mini" style={{ display: "block", marginTop: 6 }}>First e-mail: message {locked ? "(already approved, so locked)" : "(a STOP line is added automatically)"}<textarea rows={9} style={{ width: "100%" }} value={field("body")} disabled={locked} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
      {rep.length > 0 && <><h3>Replies</h3>{rep.map((r) => <div key={r.id} className="check"><div style={{ flex: 1 }}><b>{when(r.received_at)}</b> {r.ai_note && <span className="mini">· {r.ai_note}</span>}<div className="mini" style={{ whiteSpace: "pre-wrap" }}>{r.body}</div></div></div>)}</>}
      <footer style={{ flexWrap: "wrap" }}>
        {waBtn(open, false)}
        {["Sent", "Queued", "Approved", "Not interested", "Found"].includes(open.status) && <button className="btn out" onClick={() => mark("Replied", [open.id])}>They replied (no e-mail)</button>}
        {open.status === "Rejected" && <button className="btn out" onClick={() => mark("Found", [open.id])}>Put back to review</button>}
        {open.status !== "Converted" && open.status !== "Opted out" && <button className="btn out" onClick={() => mark("Converted", [open.id])}>Mark converted</button>}
        <div className="sp" /><button className="btn out" onClick={() => setOpen(null)}>Close</button><button className="btn" disabled={Object.keys(edit).length === 0} onClick={saveEdit}>Save changes</button></footer></div></div>}
  </>);
}
export default function Page() { return <Shell page="outreach">{(p) => <Inner isSuper={p.role === "super_admin"} />}</Shell>; }
