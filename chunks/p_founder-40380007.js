import{a as sb,e as esc,f as $,g as $$,o as toast,p as run,q as modal}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// ---------- helpers ----------
const IN = n => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const inrShort = n => {
  n = Number(n); if (!isFinite(n)) return "–"; const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e7) return s + "₹" + (a / 1e7).toFixed(a >= 1e8 ? 1 : 2) + " Cr";
  if (a >= 1e5) return s + "₹" + (a / 1e5).toFixed(2) + " L";
  return s + "₹" + IN(a);
};
const pct = (v, d = 0) => v == null || !isFinite(v) ? "–" : Number(v).toFixed(d) + "%";
const lit = v => v == null || !isFinite(v) ? "–" : IN(v) + " L";
const mname = m => { const [y, mo] = String(m).split("-"); return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+mo - 1] + " " + String(y).slice(2); };
const dlong = s => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const num = v => v == null || v === "" ? null : Number(v);

// ---------- pure plan maths (exported for tests) ----------
export const yearRows = snap => {
  const ms = snap?.months || [], lpp = num(snap?.goals?.lpd_per_partner) || 25, out = [];
  for (let k = 0; k * 12 < ms.length; k++) {
    const sl = ms.slice(k * 12, k * 12 + 12), last = sl[sl.length - 1];
    out.push({ year: k + 1, from: sl[0].month, to: last.month, revenue: sl.reduce((a, m) => a + Number(m.target_rev || 0), 0), exit_annual: Number(last.target_annual), exit_lpd: Number(last.target_lpd), partners: Math.ceil(Number(last.target_lpd) / lpp) });
  }
  return out;
};
export const statusOf = snap => {
  const p = num(snap?.path_pct);
  if (p == null) return { tone: "warn", label: "Set your goals" };
  if (p >= 90) return { tone: "good", label: "On the path" };
  if (p >= 60) return { tone: "warn", label: "Slightly behind" };
  return { tone: "bad", label: "Behind the path" };
};
export const growthNeeded = snap => {
  const base = Math.max(Number(snap?.run_rate_annual) || 0, 1e6), av = Number(snap?.annual_at_vision) || 0, n = Number(snap?.months_to_vision) || 36;
  const multiple = av / base; return { base, multiple, monthly: Math.pow(multiple, 1 / n) - 1 };
};
export const insights = snap => {
  const out = [], c = snap?.capacity || {}, g = snap?.goals || {}, real = num(snap?.realisation_per_litre), req = num(snap?.required_realisation_per_litre);
  const wd = num(c.working_days) || 300, tl = num(c.target_lpd) || 5000, nl = num(c.now_lpd) || 500;
  if (c.utilisation_pct != null) out.push({ tone: c.utilisation_pct < 60 ? "bad" : "good", t: `The plant made ${lit(c.made_30d_l)} in the last 30 days, about ${IN(c.avg_lpd_30d)} L a day. That is ${pct(c.utilisation_pct, 1)} of today's ${IN(nl)} L/day capacity. The best single day in the last 90 days was ${lit(c.best_day_l_90d)}.` });
  if (real != null && req != null) {
    const rev = tl * wd * real;
    if (real < req) out.push({ tone: "bad", t: `The arithmetic: ${IN(tl)} L/day × ${IN(wd)} days at your current ₹${real.toFixed(0)} per litre earns ${inrShort(rev)} a year, not ${inrShort(snap.annual_at_vision)}. To reach the vision you need either about ₹${req.toFixed(0)} per litre (${pct((req / real - 1) * 100)} more), or about ${IN(Math.ceil(snap.annual_at_vision / (real * wd)))} L/day (${(snap.annual_at_vision / (real * wd) / tl).toFixed(1)}× the target plant).` });
    else out.push({ tone: "good", t: `At your current ₹${real.toFixed(0)} per litre, ${IN(tl)} L/day for ${IN(wd)} days earns ${inrShort(rev)} a year, which covers the vision.` });
  } else if (req != null) out.push({ tone: "warn", t: `${IN(tl)} L/day for ${IN(wd)} days only reaches ${inrShort(snap.annual_at_vision)} if you realise about ₹${req.toFixed(0)} per litre. Your selling price per litre is not known yet (no delivered orders with pack sizes).` });
  const n = snap?.network;
  if (n) {
    const need = num(c.partners_needed) || 0, act = n.partners_active || 0;
    out.push({ tone: act < need * 0.25 ? "warn" : "good", t: `Network: ${act} active partner${act === 1 ? "" : "s"} today, and about ${IN(need)} are needed if each sells ${IN(g.lpd_per_partner || 25)} L/day. ${n.buying_partners_90d || 0} bought in the last 90 days (${IN(n.lpd_90d || 0)} L/day through partners).` });
    if (n.dormant_count) out.push({ tone: "warn", t: `${n.dormant_count} active partner${n.dormant_count === 1 ? " has" : "s have"} gone quiet (no order in 45+ days). Under your MOU rules that is the first-warning stage.` });
  }
  if (snap?.path_pct != null) out.push({ tone: snap.path_pct >= 90 ? "good" : snap.path_pct >= 60 ? "warn" : "bad", t: `Sales in the last 30 days were ${inrShort(snap.sales_30d)}, which is ${pct(snap.path_pct)} of the ${inrShort(snap.this_month_target)} this month needs on the path.` });
  return out;
};

// ---------- chart (SVG, with a table fallback) ----------
const chart = (past, future) => {
  const W = 720, H = 230, L = 52, B = 34, T = 14, R = 8, rows = [...past.map(r => ({ ...r, kind: "a" })), ...future.map(r => ({ ...r, kind: "t" }))];
  const max = Math.max(1, ...rows.map(r => r.v)), step = (W - L - R) / Math.max(rows.length, 1), bw = Math.max(4, step * 0.62);
  const y = v => T + (H - T - B) * (1 - v / max), ticks = [0, .25, .5, .75, 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly sales: last 12 months actual and next 12 months target" style="width:100%;height:auto">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(max * t)}" y2="${y(max * t)}" stroke="#e4e0d2" stroke-width="1"/><text x="${L - 6}" y="${y(max * t) + 4}" text-anchor="end" font-size="10.5" fill="#6d7b84">${inrShort(max * t)}</text>`).join("")}
    ${rows.map((r, i) => { const x = L + i * step + (step - bw) / 2, h = Math.max(0, H - B - y(r.v)); return `<g><title>${esc(mname(r.month))}: ${r.kind === "a" ? "actual" : "target"} ${inrShort(r.v)}</title><rect x="${x}" y="${H - B - h}" width="${bw}" height="${h}" rx="3" ${r.kind === "a" ? 'fill="#13595a"' : 'fill="#fff6dd" stroke="#c89739" stroke-width="1.5"'}/></g>${i % 2 === 0 ? `<text x="${x + bw / 2}" y="${H - 14}" text-anchor="middle" font-size="9.5" fill="#6d7b84">${esc(mname(r.month))}</text>` : ""}`; }).join("")}
    ${past.length && future.length ? `<line x1="${L + past.length * step}" x2="${L + past.length * step}" y1="${T}" y2="${H - B}" stroke="#9aa5ab" stroke-dasharray="4 4"/><text x="${L + past.length * step + 4}" y="${T + 10}" font-size="10" fill="#6d7b84">today</text>` : ""}
  </svg>
  <div class="legend"><span><i style="background:#13595a"></i>Actual sales (ex-GST)</span><span><i style="background:#fff6dd;border:1.5px solid #c89739"></i>Target on the path</span></div>
  <details class="small"><summary>View as table</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th>Type</th><th>Sales (ex-GST)</th></tr></thead><tbody>${rows.map(r => `<tr><td data-l="Month">${esc(mname(r.month))}</td><td data-l="Type">${r.kind === "a" ? "Actual" : "Target"}</td><td data-l="Sales" class="num">${inrShort(r.v)}</td></tr>`).join("")}</tbody></table></div></details>`;
};

const bar = (v, max, tone = "") => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, max ? v / max * 100 : 0)).toFixed(1)}%;${tone ? "background:" + tone : ""}"></i></div>`;
const tile = (l, v, s = "", tone = "") => `<div class="stat ${tone}"><div class="stat-v">${v}</div><div class="stat-l">${l}</div>${s ? `<div class="stat-s">${s}</div>` : ""}</div>`;

// ---------- page ----------
let SNAP = null, TRG = [];

export async function founderPage(el) {
  el.innerHTML = `<div id="fd"><div class="loading">Reading the numbers…</div></div>`;
  const load = async () => {
    const [s, t] = await Promise.all([sb.rpc("founder_snapshot"), sb.from("founder_triggers").select("*").order("sort")]);
    if (s.error) throw new Error(s.error.message);
    SNAP = s.data; TRG = t.data || [];
  };
  await load();
  let netNote = "";
  const syncNet = async (manual) => {
    try {
      const { data, error } = await sb.functions.invoke("epdms-network");
      if (error) throw error;
      if (!data || data.error) { netNote = data?.error === "not_configured" ? "EPDMS is not connected yet. Ask Claude to finish the connection (the EPDMS secret is missing)." : (data?.message || "Could not read EPDMS"); if (manual) toast(netNote, "err"); return false; }
      netNote = ""; if (manual) toast("EPDMS refreshed: " + data.partners + " partners, " + data.orders + " orders"); return true;
    } catch (e) { netNote = "Could not reach EPDMS: " + (e.message || e); if (manual) toast(netNote, "err"); return false; }
  };
  const stale = !SNAP.network || (Date.now() - new Date(SNAP.network.synced_at).getTime()) > 6 * 3600e3;
  const draw = () => paint(el, SNAP, TRG, netNote, { reload: async () => { await load(); draw(); }, syncNet });
  draw();
  if (stale) syncNet(false).then(async ok => { if (ok) { await load(); draw(); } else draw(); });
}

function paint(el, S, TR, netNote, api) {
  const g = S.goals || {}, c = S.capacity || {}, st = statusOf(S), gr = growthNeeded(S), yr = yearRows(S), ins = insights(S), n = S.network;
  const pastRows = (S.actual || []).map(a => ({ month: a.month, v: Number(a.sales) })), futRows = (S.months || []).slice(0, 12).map(m => ({ month: m.month, v: Number(m.target_rev) }));
  const modeTxt = g.vision_mode === "cumulative" ? `${inrShort(Number(g.vision_cr) * 1e7)} in total sales over the period` : `${inrShort(Number(g.vision_cr) * 1e7)} a year of sales by the end`;
  const progress = S.annual_at_vision ? Math.min(100, S.run_rate_annual / S.annual_at_vision * 100) : 0;
  el.innerHTML = `<div id="fd">
  <section class="card fd-hero"><div class="row between wrap"><div><div class="muted small">THE VISION</div><h2 style="margin:2px 0">Road to ${inrShort(Number(g.vision_cr) * 1e7)}</h2><div class="muted">${esc(modeTxt)} · by ${esc(dlong(g.vision_date))} · ${S.months_to_vision} months to go</div></div><div class="row"><span class="badge fd-st ${st.tone}">${esc(st.label)}</span><button class="btn ghost sm" id="fd-goals">Edit goals</button></div></div>
    <div class="stats" style="margin-top:12px">${tile("Sales run-rate now", inrShort(S.run_rate_annual), "a year, from the last 90 days", "")}${tile("Sales last 30 days", inrShort(S.sales_30d), `${pct(S.path_pct)} of this month's ${inrShort(S.this_month_target)} target`, st.tone)}${tile("Growth needed", gr.multiple >= 10 ? Math.round(gr.multiple) + "×" : gr.multiple.toFixed(1) + "×", `about ${(gr.monthly * 100).toFixed(1)}% a month, every month`)}${tile("Money to collect", inrShort(S.receivables?.total || 0), S.receivables?.oldest_days ? `oldest unpaid invoice ${S.receivables.oldest_days} days` : "nothing overdue", (S.receivables?.overdue_30 || 0) > 0 ? "warn" : "")}</div>
    <div class="small muted" style="margin-top:4px">Progress to the vision (today's run-rate ÷ target)</div>${bar(progress, 100)}
  </section>

  <section class="card"><div class="row between wrap"><h3 style="margin:0">What the numbers say</h3><button class="btn" id="fd-brief">✨ AI founder briefing</button></div>
    <div class="fd-ins">${ins.map(i => `<div class="fd-i ${i.tone}">${esc(i.t)}</div>`).join("") || '<p class="muted">Not enough data yet.</p>'}</div><div id="fd-ai"></div></section>

  <div class="two">
  <section class="card"><h3>Sales: last 12 months and the path ahead</h3>${chart(pastRows, futRows)}</section>
  <section class="card"><h3>Plant: ${IN(c.now_lpd)} → ${IN(c.target_lpd)} litres a day</h3>
    <div class="fd-cap"><div class="row between"><span>Made per day (last 30 days)</span><b>${IN(c.avg_lpd_30d)} L</b></div>${bar(c.avg_lpd_30d, c.target_lpd, "#239a9e")}
    <div class="row between"><span>Best day (last 90 days)</span><b>${lit(c.best_day_l_90d)}</b></div>${bar(c.best_day_l_90d, c.target_lpd, "#7b9a9b")}
    <div class="row between"><span>Capacity today (one shift)</span><b>${IN(c.now_lpd)} L</b></div>${bar(c.now_lpd, c.target_lpd, "#c89739")}
    <div class="row between"><span>Capacity target</span><b>${IN(c.target_lpd)} L</b></div>${bar(c.target_lpd, c.target_lpd, "#13595a")}</div>
    <div class="stats mini" style="margin-top:10px">${tile("Plant used", pct(c.utilisation_pct, 1), "of today's capacity", c.utilisation_pct < 60 ? "bad" : "good")}${tile("Selling price", S.realisation_per_litre ? "₹" + IN(S.realisation_per_litre) + "/L" : "–", "ex-GST, delivered orders")}${tile("Price needed", "₹" + IN(S.required_realisation_per_litre) + "/L", `for ${inrShort(S.annual_at_vision)} at ${IN(c.target_lpd)} L/day`)}</div>
  </section></div>

  <section class="card"><h3>Year by year: what has to be true</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Year</th><th>Sales target (ex-GST)</th><th>Run-rate at year end</th><th>Litres a day needed</th><th>Active partners needed</th></tr></thead><tbody>
    ${yr.map(y => `<tr><td data-l="Year">Year ${y.year} <span class="muted small">(${esc(mname(y.from))} – ${esc(mname(y.to))})</span></td><td data-l="Sales target" class="num">${inrShort(y.revenue)}</td><td data-l="Run-rate at year end" class="num">${inrShort(y.exit_annual)} a year</td><td data-l="Litres a day" class="num">${IN(y.exit_lpd)} L</td><td data-l="Partners" class="num">${IN(y.partners)}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted small">Growth is spread evenly month on month from today's run-rate. Litres a day assume today's plant fills at your target share of ${IN(c.target_lpd)} L/day. Partners assume each active partner sells ${IN(g.lpd_per_partner)} L/day (editable in goals).</p></section>

  <section class="card"><div class="row between wrap"><h3 style="margin:0">Dealer, distributor and stockist network <span class="muted small">(from EPDMS)</span></h3><div class="row"><span class="muted small">${n ? "Updated " + new Date(n.synced_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span><button class="btn ghost sm" id="fd-sync">Refresh from EPDMS</button></div></div>
    ${netNote ? `<div class="notice warn">${esc(netNote)}</div>` : ""}
    ${n ? `<div class="stats">${(n.tiers || []).map(t => tile(esc(t.name), IN(t.active), `${IN(t.pending)} pending · ${IN(t.total)} total`, t.active ? "good" : "")).join("")}</div>
    <div class="stats mini">${tile("Active partners", IN(n.partners_active), `need about ${IN(c.partners_needed)}`)}${tile("States / districts", `${n.states} / ${n.districts}`, "with an active partner")}${tile("Bought in 90 days", `${IN(n.buying_partners_90d)} of ${IN(n.partners_active)}`, `${inrShort(n.net_90d)} · ${IN(n.litres_90d)} L`)}${tile("Applications waiting", IN(n.applications_open), `${IN(n.applications_total)} received · ${IN(n.territory_claims)} territory claims`, n.applications_open > 3 ? "warn" : "")}${tile("Joined last 30 days", IN(n.new_30d), "new partners")}</div>
    <div class="two"><div><h4>Top partners (last 90 days)</h4>${(n.top_partners || []).length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Partner</th><th>District</th><th>Orders</th><th>Value</th></tr></thead><tbody>${n.top_partners.map(p => `<tr><td data-l="Partner">${esc(p.name)} <span class="muted small">${esc(p.id)}</span></td><td data-l="District">${esc(p.district || "–")}</td><td data-l="Orders" class="num">${IN(p.orders)}</td><td data-l="Value" class="num">${inrShort(p.net_90d)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No orders from partners in the last 90 days.</p>'}</div>
    <div><h4>Gone quiet (no order for 45+ days)</h4>${(n.dormant || []).length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Partner</th><th>District</th><th>Quiet for</th></tr></thead><tbody>${n.dormant.map(p => `<tr><td data-l="Partner">${esc(p.name)} <span class="muted small">${esc(p.id)}</span></td><td data-l="District">${esc(p.district || "–")}</td><td data-l="Quiet for" class="num">${IN(p.days_quiet)} days${p.never_ordered ? " (never ordered)" : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="okc">Every active partner has ordered recently.</p>'}</div></div>
    <p class="muted small">Districts covered: ${(n.districts_list || []).map(esc).join(", ") || "none yet"}.</p>`
    : `<div class="notice">The EPDMS network has not been read yet. Press <b>Refresh from EPDMS</b>.</div>`}
  </section>

  <section class="card"><div class="row between wrap"><h3 style="margin:0">Automatic alerts (triggers)</h3><div class="row"><button class="btn ghost sm" id="fd-check">Check now</button><button class="btn ghost sm" id="fd-send">Check and send alerts</button></div></div>
    <p class="muted small">Checked every morning at 8:15 AM. When something crosses its line you get a notification in the bell, and on WhatsApp if that is switched on. The same alert is not repeated until its quiet period is over.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Trigger</th><th>Now</th><th>Status</th><th>Alert line</th><th>On</th><th></th></tr></thead><tbody>
    ${TR.map(t => { const bad = t.last_message; const op = t.code === "dormant_partners" ? "days quiet" : t.op === "lt" ? "below" : "above"; return `<tr data-c="${esc(t.code)}"><td data-l="Trigger"><b>${esc(t.label)}</b><div class="muted small">${esc(t.detail || "")}</div></td><td data-l="Now" class="num">${t.last_value == null ? "–" : IN(Math.round(t.last_value * 10) / 10)} ${esc(t.unit || "")}</td><td data-l="Status">${t.last_checked_at ? (bad ? `<span class="badge s-rejected" title="${esc(t.last_message)}">Alert</span>` : '<span class="badge s-approved">OK</span>') : '<span class="muted small">not checked</span>'}${t.last_fired_at ? `<div class="muted small">last sent ${new Date(t.last_fired_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>` : ""}</td><td data-l="Alert line"><span class="small muted">${op}</span> <input type="number" step="any" class="tth" value="${t.threshold}" style="width:90px;display:inline-block"> <span class="small muted">${esc(t.unit || "")}</span></td><td data-l="On"><label class="sw"><input type="checkbox" class="ten" ${t.enabled ? "checked" : ""}><span></span></label></td><td><button class="btn sm tsv">Save</button></td></tr>`; }).join("")}</tbody></table></div></section>

  <section class="card"><h3>Ask the AI about the vision</h3><div class="aic-chips" style="justify-content:flex-start">${CHIPS.map(([l], i) => `<button class="chip" data-q="${i}">${esc(l)}</button>`).join("")}</div></section>
  </div>`;

  // ---- wiring ----
  const ask = prompt => window.dispatchEvent(new CustomEvent("ask-ai", { detail: { prompt } }));
  $$("[data-q]", el).forEach(b => b.onclick = () => ask(CHIPS[+b.dataset.q][1]));
  $("#fd-sync", el).onclick = async e => { e.target.disabled = true; const ok = await api.syncNet(true); await api.reload(); if (!ok) toast("Refresh did not complete", "err"); };
  $("#fd-check", el).onclick = async () => { if (await run(sb.rpc("evaluate_founder_triggers", { p_notify: false }), "Checked")) await api.reload(); };
  $("#fd-send", el).onclick = async () => { const r = await run(sb.rpc("evaluate_founder_triggers", { p_notify: true }), null); if (r) { toast(Array.isArray(r) ? `${r.filter(x => x.fired).length} alert(s) sent` : "Checked"); await api.reload(); } };
  $$(".tsv", el).forEach(b => b.onclick = async () => {
    const tr = b.closest("tr"); const ok = await run(sb.rpc("save_founder_trigger", { p_code: tr.dataset.c, p_enabled: $(".ten", tr).checked, p_threshold: Number($(".tth", tr).value) }), "Saved"); if (ok) await api.reload();
  });
  $("#fd-goals", el).onclick = () => goalsModal(g, api.reload);
  $("#fd-brief", el).onclick = () => briefing($("#fd-ai", el), S, TR);
}

export const CHIPS = [
  ["Are we on track for the vision?", "Compare my sales, plant output and partner network against the road to my vision (use the founder snapshot). Are we on track? What are the three biggest gaps?"],
  ["What do I need in the network?", "How many dealers, distributors and stockists do I need to reach the vision, and what should I do in the next 90 days to get there? Use the EPDMS network data. Table please."],
  ["Is 5,000 L/day enough?", "Check the arithmetic: at my real selling price per litre, does 5,000 L/day deliver my vision? What price or capacity do I need? Show scenarios in a table."],
  ["Plan the next 30 days", "Make me a 30-day action plan for capacity, sales, partner onboarding and collections, ranked by impact."],
  ["What is my biggest risk?", "What is the single biggest risk to reaching the vision right now, based on the data? Explain simply and what to do about it."],
  ["Build a board-style report", "Build a one-page founder progress report: vision, where we are, plant, network, money, alerts and next steps. Use tables."],
];

function briefing(host, S, TR) {
  host.innerHTML = '<p class="muted">Thinking through the whole picture…</p>';
  const ctx = { goals: S.goals, status: statusOf(S).label, growth_needed: growthNeeded(S), year_plan: yearRows(S), sales_last_12_months: S.actual, sales_30d: S.sales_30d, this_month_target: S.this_month_target, path_pct: S.path_pct, run_rate_annual: S.run_rate_annual, realisation_per_litre: S.realisation_per_litre, required_realisation_per_litre: S.required_realisation_per_litre, capacity: S.capacity, receivables: S.receivables, raw_material_alerts: S.rm_alerts, network: S.network ? { ...S.network, districts_list: undefined } : null, triggers: TR.map(t => ({ trigger: t.label, value: t.last_value, line: t.threshold, alert: !!t.last_message })) };
  sb.functions.invoke("ai-insights", { body: { topic: "founder", context: ctx } }).then(({ data, error }) => {
    if (error) throw error;
    if (!data || data.error) { host.innerHTML = `<div class="notice">${data?.error === "not_configured" ? "AI is not switched on yet (API key missing)." : esc(data?.message || "No advice came back")}</div>`; return; }
    const x = data.insights, badge = i => ({ high: "🔴 High impact", medium: "🟠 Medium", low: "⚪ Low" })[i] || i;
    host.innerHTML = `<div class="notice"><b>${esc(x.headline)}</b></div>${(x.recommendations || []).map(r => `<div class="card" style="margin:8px 0"><div class="row" style="gap:8px"><b>${esc(r.title)}</b><span class="muted small">${badge(r.impact)} · ${esc(String(r.area || "").replace("_", " "))}</span></div><p style="margin:4px 0">${esc(r.why)}</p><p style="margin:4px 0"><b>Do this:</b> ${esc(r.action)}</p></div>`).join("")}${(x.watch_out || []).length ? `<h4>Watch out</h4><ul>${x.watch_out.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}<p class="muted small">Advice from an AI model on the numbers in this app. Check before acting.</p>`;
  }).catch(e => { host.innerHTML = `<div class="notice">Could not get the briefing: ${esc(e.message || String(e))}</div>`; });
}

function goalsModal(g, done) {
  modal("Edit the vision and plant goals", `<form id="gf" class="form-grid">
    <label>Vision (₹ crore)<input name="vision_cr" type="number" step="any" min="0.01" value="${esc(g.vision_cr)}" required></label>
    <label>What the vision means<select name="vision_mode"><option value="annual" ${g.vision_mode !== "cumulative" ? "selected" : ""}>Sales of this size in the final year</option><option value="cumulative" ${g.vision_mode === "cumulative" ? "selected" : ""}>This much in total over the period</option></select></label>
    <label>Start date<input name="start_date" type="date" value="${esc(g.start_date)}" required></label>
    <label>Vision date<input name="vision_date" type="date" value="${esc(g.vision_date)}" required></label>
    <label>Plant capacity today (litres a day)<input name="capacity_now_lpd" type="number" step="any" min="1" value="${esc(g.capacity_now_lpd)}" required></label>
    <label>Capacity target (litres a day)<input name="capacity_target_lpd" type="number" step="any" min="1" value="${esc(g.capacity_target_lpd)}" required></label>
    <label>Working days in a year<input name="working_days" type="number" min="1" max="366" value="${esc(g.working_days)}" required></label>
    <label>Litres a day one active partner sells<input name="lpd_per_partner" type="number" step="any" min="0.1" value="${esc(g.lpd_per_partner)}" required><small>Your assumption. Used to estimate how many partners you need.</small></label>
    <label>Growth per year if "in total"<input name="growth_x_per_year" type="number" step="any" min="1.01" value="${esc(g.growth_x_per_year)}"><small>Only used when the vision is a total over the period. 3 = sales triple every year.</small></label>
    <div class="full row end"><button class="btn" type="submit">Save goals</button></div></form>`, {
    onMount: (m, close) => {
      $("#gf", m).onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target), p = {};
        for (const [k, v] of f.entries()) p[k] = ["vision_date", "start_date", "vision_mode"].includes(k) ? String(v) : Number(v);
        if (await run(sb.rpc("save_founder_goals", { p }), "Goals saved")) { close(); done(); }
      };
    },
  });
}
