import{a as sb,e as esc,f as $,g as $$,h as num,i as dfmt,m as hasRole}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// Accounting dashboard + Production dashboard.
// Colours: two validated categorical slots (blue, orange); status colours always come with an icon and a word.
const C1 = "#2a78d6", C2 = "#eb6834", GOOD = "#3d7a3f", WARN = "#9a6a00", BAD = "#b0402e", INK = "#1f2933", MUTED = "#6b7280", GRID = "#e4e0d2";
const n0 = x => Number(x) || 0;
const inr = x => "₹" + n0(x).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const short = x => { const v = Math.abs(n0(x)), s = n0(x) < 0 ? "-" : "";
  return v >= 1e7 ? `${s}₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${s}₹${(v / 1e5).toFixed(2)} L` : v >= 1e3 ? `${s}₹${(v / 1e3).toFixed(1)}K` : `${s}₹${Math.round(v)}`; };
const lit = x => `${n0(x).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
const pct = (a, b) => b > 0 ? (a / b * 100) : null;
const pc = x => x == null ? "–" : x.toFixed(1) + "%";
const sum = (a, f) => a.reduce((t, x) => t + n0(f(x)), 0);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mLabel = k => `${MON[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
const mKey = s => String(s || "").slice(0, 7);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthsBack = n => { const d = new Date(), out = []; d.setDate(1); for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(iso(x).slice(0, 7)); } return out; };
export const rangeFor = (key, now = new Date()) => {
  const t = iso(now), y = now.getFullYear(), m = now.getMonth();
  if (key === "quarter") return { df: iso(new Date(y, m - 2, 1)), dt: t, pf: iso(new Date(y, m - 5, 1)), pt: iso(new Date(y, m - 2, 0)), label: "Last 3 months" };
  if (key === "fy") { const s = m >= 3 ? y : y - 1; return { df: `${s}-04-01`, dt: t, pf: `${s - 1}-04-01`, pt: `${s}-03-31`, label: `FY ${s}-${String(s + 1).slice(2)}` }; }
  if (key === "all") return { df: "0000-01-01", dt: t, pf: null, pt: null, label: "All time" };
  return { df: iso(new Date(y, m, 1)), dt: t, pf: iso(new Date(y, m - 1, 1)), pt: iso(new Date(y, m, 0)), label: "This month" };
};
const inR = (d, a, b) => { const s = String(d || "").slice(0, 10); return s >= a && s <= b; };
const delta = (cur, prev, good = "up") => {
  if (prev == null || !(prev > 0)) return "";
  const p = (cur - prev) / prev * 100, up = p >= 0, ok = good === "up" ? up : !up;
  return `<span style="color:${ok ? GOOD : BAD}">${up ? "▲" : "▼"} ${Math.abs(p).toFixed(0)}% vs previous</span>`;
};

// ---------- tiny chart kit ----------
const css = () => {
  if (document.getElementById("dv-css")) return;
  const s = document.createElement("style"); s.id = "dv-css";
  s.textContent = `.dv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px}.dv-grid .card{margin:0}.dv-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.dv-h h3{margin:0 0 4px}.dv-sub{color:${MUTED};font-size:12px;margin:0 0 8px}.dv-leg{display:flex;gap:14px;font-size:12px;margin:4px 0;flex-wrap:wrap}.dv-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.dv-row{display:grid;grid-template-columns:minmax(90px,34%) 1fr auto;gap:8px;align-items:center;padding:3px 0;font-size:13px}.dv-track{height:12px;background:#f1efe6;border-radius:0 6px 6px 0;position:relative}.dv-track i{position:absolute;left:0;top:0;bottom:0;border-radius:0 6px 6px 0}
.dv-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv-v{font-variant-numeric:tabular-nums}.dv-tip{position:fixed;z-index:9999;background:#1f2933;color:#fff;font-size:12px;padding:6px 8px;border-radius:6px;pointer-events:none;max-width:260px;display:none;line-height:1.35}
.dv-attn{display:grid;gap:6px}.dv-attn div{padding:8px 10px;border-radius:8px;background:#faf8ef;font-size:13px}.dv-tv summary{cursor:pointer;font-size:12px;color:${MUTED};margin-top:6px}.dv-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}`;
  document.head.appendChild(s);
  const tip = document.createElement("div"); tip.className = "dv-tip"; tip.id = "dv-tip"; document.body.appendChild(tip);
};
const tipInit = root => {
  const tip = document.getElementById("dv-tip"); if (!tip) return;
  const show = (e, t) => { tip.textContent = t; tip.style.display = "block"; const x = Math.min((e.clientX || 0) + 12, window.innerWidth - 270); tip.style.left = x + "px"; tip.style.top = ((e.clientY || 0) + 14) + "px"; };
  root.addEventListener("mousemove", e => { const t = e.target.closest?.("[data-tip]"); t ? show(e, t.dataset.tip) : (tip.style.display = "none"); });
  root.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  root.addEventListener("click", e => { const t = e.target.closest?.("[data-tip]"); if (t) show(e, t.dataset.tip); });
};
const niceMax = v => { if (!(v > 0)) return 4; const p = Math.pow(10, Math.floor(Math.log10(v / 4))), f = v / 4 / p, s = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10; return s * p * 4; };
// grouped columns: cats = labels, series = [{name,color,vals,fmt?}]
export const cols = (cats, series, fmt = short) => {
  const W = 560, H = 230, L = 52, R = 8, T = 16, B = 28, pw = W - L - R, ph = H - T - B, top = niceMax(Math.max(0, ...series.flatMap(s => s.vals.map(n0))));
  const gw = pw / Math.max(1, cats.length), bw = Math.max(6, Math.min(28, gw * 0.72 / series.length - 2)), yy = v => T + ph - ph * n0(v) / top;
  let g = "";
  for (let i = 0; i <= 4; i++) { const v = top / 4 * i, y = yy(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${GRID}" stroke-width="1"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="${MUTED}">${esc(fmt(v))}</text>`; }
  cats.forEach((c, i) => {
    const cx = L + gw * i + gw / 2, tw = series.length * (bw + 2) - 2;
    series.forEach((s, j) => {
      const v = n0(s.vals[i]), h = ph * v / top, x = cx - tw / 2 + j * (bw + 2), y = T + ph - h, r = Math.min(3, h / 2);
      if (h > 0.5) g += `<path d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z" fill="${s.color}"/>`;
      if (i === cats.length - 1 && series.length <= 2 && v > 0) g += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="${INK}">${esc(fmt(v))}</text>`;
    });
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${MUTED}">${esc(c)}</text>`;
    g += `<rect x="${L + gw * i}" y="${T}" width="${gw}" height="${ph}" fill="transparent" data-tip="${esc(c + " · " + series.map(s => s.name + " " + fmt(s.vals[i])).join(" · "))}"/>`;
  });
  const leg = series.length > 1 ? `<div class="dv-leg">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  return `${leg}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(series.map(s => s.name).join(" and ") + " by month")}">${g}</svg>`;
};
// horizontal bars: items = [{label,value,text?,tip?,color?}]
export const hbars = (items, fmt = short, color = C1) => {
  if (!items.length) return '<div class="empty">Nothing to show yet.</div>';
  const mx = Math.max(...items.map(i => n0(i.value)), 1);
  return items.map(i => `<div class="dv-row" data-tip="${esc(i.tip || i.label + " · " + (i.text || fmt(i.value)))}"><span class="dv-l">${esc(i.label)}</span><span class="dv-track"><i style="width:${Math.max(n0(i.value) / mx * 100, i.value > 0 ? 1.5 : 0)}%;background:${i.color || color}"></i></span><b class="dv-v">${esc(i.text || fmt(i.value))}</b></div>`).join("");
};
const tview = (heads, rows) => `<details class="dv-tv"><summary>View as table</summary><div style="overflow:auto"><table><thead><tr>${heads.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
const stat = (l, v, s = "", cls = "") => `<div class="stat ${cls}"><div class="stat-l">${l}</div><div class="stat-v">${v}</div>${s ? `<div class="stat-s">${s}</div>` : ""}</div>`;
const card = (title, sub, body) => `<div class="card"><div class="dv-h"><h3>${title}</h3></div>${sub ? `<p class="dv-sub">${sub}</p>` : ""}${body}</div>`;
const rangeSel = (cur) => `<select id="rg">${[["month", "This month"], ["quarter", "Last 3 months"], ["fy", "This financial year"], ["all", "All time"]].map(([k, t]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${t}</option>`).join("")}</select>`;
const get = async q => { const r = await q; if (r.error) throw r.error; return r.data || []; };
const soft = async (q) => { try { return await get(q); } catch { return []; } };

// =====================================================================
// ACCOUNTING DASHBOARD
// =====================================================================
let ARANGE = "month";
export async function accountingDashboardPage(el) {
  if (!hasRole("admin")) { el.innerHTML = '<p class="muted">The accounting dashboard is for admin only.</p>'; return; }
  css(); el.innerHTML = '<p class="muted">Loading…</p>';
  let D;
  try {
    const [inv, pay, exp, ib, cb, sl, rv, as, bt, es] = await Promise.all([
      get(sb.from("tax_invoices").select("id,invoice_no,invoice_date,taxable,tax,total,status").eq("status", "issued")),
      get(sb.from("customer_payments").select("paid_on,amount,customer_id")), get(sb.from("expenses").select("exp_date,amount,gst_amount,category,paid_by,reimbursed")),
      get(sb.from("v_invoice_balance").select("invoice_no,invoice_date,customer,total,paid,balance")), get(sb.from("v_customer_balance").select("customer_id,name,billed,received")),
      get(sb.from("v_sale_lines").select("dc_date,revenue,cogs,customer,order_no")), soft(sb.from("v_rm_value").select("name,value,no_rate,on_hand")), soft(sb.from("v_assets").select("cost,book_value,status")),
      soft(sb.from("bank_txns").select("id,status")), soft(sb.from("earlier_sales").select("sale_date,amount,total,received,cogs")),
    ]);
    D = { inv, pay, exp, ib, cb, sl, rv, as, bt, es };
  } catch (e) { el.innerHTML = `<p class="dev">Could not load: ${esc(e.message)}</p>`; return; }
  const draw = async () => {
    const R = rangeFor(ARANGE), { inv, pay, exp, ib, cb, sl, rv, as, bt, es } = D;
    const depn = n0((await sb.rpc("asset_dep_between", { p_from: R.df === "0000-01-01" ? "2000-01-01" : R.df, p_to: R.dt })).data);
    const within = (a, f, from, to) => a.filter(x => inR(f(x), from, to));
    const cur = (a, f) => within(a, f, R.df, R.dt), prv = (a, f) => R.pf ? within(a, f, R.pf, R.pt) : null;
    const sales = sum(cur(inv, i => i.invoice_date), i => i.taxable) + sum(cur(es, e => e.sale_date), e => e.amount), salesP = prv(inv, i => i.invoice_date) && sum(prv(inv, i => i.invoice_date), i => i.taxable) + sum(prv(es, e => e.sale_date), e => e.amount);
    const coll = sum(cur(pay, p => p.paid_on), p => p.amount), collP = prv(pay, p => p.paid_on) && sum(prv(pay, p => p.paid_on), p => p.amount);
    const spent = sum(cur(exp, e => e.exp_date), e => e.amount), spentP = prv(exp, e => e.exp_date) && sum(prv(exp, e => e.exp_date), e => e.amount);
    const opex = sum(cur(exp, e => e.exp_date).filter(e => !["raw_material", "packaging", "asset"].includes(e.category)), e => n0(e.amount) - n0(e.gst_amount));
    const gp = sum(cur(sl, l => l.dc_date), l => l.revenue) - sum(cur(sl, l => l.dc_date), l => l.cogs) + sum(cur(es, e => e.sale_date), e => n0(e.amount) - n0(e.cogs)), net = gp - opex - depn;
    const outstanding = sum(cb, c => n0(c.billed) - n0(c.received)), earlierDue = Math.max(0, outstanding - sum(ib, i => i.balance)), today = iso(new Date()), days = d => Math.floor((new Date(today) - new Date(String(d).slice(0, 10))) / 864e5);
    const open = ib.filter(i => n0(i.balance) > 0.005), age = [["0–30 days", 0, 30], ["31–60 days", 31, 60], ["61–90 days", 61, 90], ["Over 90 days", 91, 1e9]].map(([l, a, b]) => ({ label: l, value: sum(open.filter(i => days(i.invoice_date) >= a && days(i.invoice_date) <= b), i => i.balance), n: open.filter(i => days(i.invoice_date) >= a && days(i.invoice_date) <= b).length })).concat(earlierDue > 0.005 ? [{ label: "Earlier sales (before system)", value: earlierDue, n: es.filter(e => n0(e.total) - n0(e.received) > 0.005).length }] : []);
    const overdue = open.filter(i => days(i.invoice_date) > 30), ms = monthsBack(6);
    const mi = ms.map(k => sum(pay.filter(p => mKey(p.paid_on) === k), p => p.amount)), mo = ms.map(k => sum(exp.filter(e => mKey(e.exp_date) === k), e => e.amount));
    const mr = ms.map(k => sum(sl.filter(l => mKey(l.dc_date) === k), l => l.revenue) + sum(es.filter(e => mKey(e.sale_date) === k), e => e.amount)), mc = ms.map(k => sum(sl.filter(l => mKey(l.dc_date) === k), l => l.cogs) + sum(es.filter(e => mKey(e.sale_date) === k), e => e.cogs));
    const byCat = {}; cur(exp, e => e.exp_date).forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + n0(e.amount); });
    const CATN = { raw_material: "Raw material", packaging: "Packaging", marketing: "Marketing", transport: "Transport", utilities: "Utilities", salary: "Salary", rent: "Rent", asset: "Assets", other: "Other" };
    const catItems = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: CATN[k] || k, value: v, tip: `${CATN[k] || k} · ${inr(v)}` }));
    const topDue = cb.map(c => ({ label: c.name, value: n0(c.billed) - n0(c.received) })).filter(c => c.value > 0.005).sort((a, b) => b.value - a.value).slice(0, 6);
    const owe = {}; exp.filter(e => String(e.paid_by).toLowerCase() !== "company" && !e.reimbursed).forEach(e => { owe[e.paid_by] = (owe[e.paid_by] || 0) + n0(e.amount); });
    const stock = sum(rv, r => r.value), noRate = rv.filter(r => r.no_rate && n0(r.on_hand) > 0).length, negStock = rv.filter(r => n0(r.on_hand) < 0).length;
    const assetBV = sum(as.filter(a => a.status === "in_use"), a => a.book_value), assetCost = sum(as, a => a.cost), unmatched = bt.filter(t => t.status === "unmatched").length;
    const attn = [
      overdue.length ? `<div>⚠ <b>${overdue.length} invoice${overdue.length > 1 ? "s" : ""} older than 30 days</b> still unpaid: ${inr(sum(overdue, i => i.balance))}. Follow up from Accounts → Party ledger.</div>` : `<div>✔ No invoice is older than 30 days and unpaid.</div>`,
      unmatched ? `<div>⚠ <b>${unmatched} bank entr${unmatched > 1 ? "ies are" : "y is"} not matched</b> yet. Accounts → Bank statement.</div>` : `<div>✔ All bank entries are matched (or none uploaded).</div>`,
      Object.keys(owe).length ? `<div>⚠ <b>To pay back:</b> ${Object.entries(owe).map(([k, v]) => `${esc(k)} ${inr(v)}`).join(", ")} (spent from their own pocket).</div>` : `<div>✔ Nothing is owed to partners.</div>`,
      negStock ? `<div>⚠ <b>${negStock} raw material${negStock > 1 ? "s are" : " is"} below zero</b> in stock. Record the bills or correct the entries, or batches cannot be approved.</div>` : `<div>✔ No raw material is below zero.</div>`,
      noRate ? `<div>⚠ <b>${noRate} item${noRate > 1 ? "s" : ""} in stock have no purchase rate</b>, so cost and margin are understated. Add the purchase bills.</div>` : "",
    ].join("");
    const body = `<div class="dv-bar">${rangeSel(ARANGE)}<span class="muted small">${R.label}${R.pf ? " compared with the period before" : ""}</span></div>
      <div class="stats">${stat("Sales (before GST)", short(sales), delta(sales, salesP))}${stat("Collected", short(coll), delta(coll, collP), "good")}${stat("Spent (all expenses)", short(spent), delta(spent, spentP, "down"))}
        ${stat("Gross profit", short(gp), "Sales minus material and packing cost", gp >= 0 ? "good" : "bad")}${stat("Net profit (estimate)", short(net), "After expenses and depreciation", net >= 0 ? "good" : "bad")}
        ${stat("To collect", short(outstanding), `${open.length} open invoice${open.length === 1 ? "" : "s"}`, outstanding > 0 ? "warn" : "")}${stat("Raw material at site", short(stock), "At latest purchase rates")}${stat("Assets (book value)", short(assetBV), `Cost ${short(assetCost)}`)}</div>
      <div class="dv-grid">
        ${card("Needs attention", "", `<div class="dv-attn">${attn}</div>`)}
        ${card("Money in and out", "Last 6 months. Money in = customer payments received; money out = all expenses.", cols(ms.map(mLabel), [{ name: "Received", color: C1, vals: mi }, { name: "Spent", color: C2, vals: mo }]) + tview(["Month", "Received", "Spent", "Net"], ms.map((k, i) => [mLabel(k), inr(mi[i]), inr(mo[i]), inr(mi[i] - mo[i])])))}
        ${card("Sales and material cost", "Last 6 months, by delivery date. Sales before GST; cost = materials and packing at latest rates.", cols(ms.map(mLabel), [{ name: "Sales", color: C1, vals: mr }, { name: "Material cost", color: C2, vals: mc }]) + tview(["Month", "Sales", "Cost", "Margin"], ms.map((k, i) => [mLabel(k), inr(mr[i]), inr(mc[i]), mr[i] ? ((mr[i] - mc[i]) / mr[i] * 100).toFixed(1) + "%" : "–"])))}
        ${card("Who owes us, by age", "Unpaid invoice balances by days since the invoice date.", hbars(age.map(a => ({ ...a, tip: `${a.label} · ${inr(a.value)} · ${a.n} invoice${a.n === 1 ? "" : "s"}` }))) + tview(["Age", "Invoices", "Amount"], age.map(a => [a.label, a.n, inr(a.value)])))}
        ${card("Biggest balances due", "Customers with the most unpaid.", hbars(topDue) + tview(["Customer", "Due"], topDue.map(c => [c.label, inr(c.value)])))}
        ${card("Where the money went", `${R.label}. Includes raw material, packaging and assets.`, hbars(catItems) + tview(["Label", "Amount"], catItems.map(c => [c.label, inr(c.value)])))}
      </div>`;
    el.innerHTML = body; tipInit(el);
    $("#rg", el).onchange = e => { ARANGE = e.target.value; draw(); };
  };
  await draw();
}

// =====================================================================
// PRODUCTION DASHBOARD
// =====================================================================
let PRANGE = "month";
export async function productionDashboardPage(el) {
  css(); el.innerHTML = '<p class="muted">Loading…</p>';
  let D;
  try {
    const [bt, fl, fg, rm, cap] = await Promise.all([
      get(sb.from("v_batch_register").select("id,temp_ref,batch_code,status,mfg_date,product_name,variant,batch_size_l,operator_name,param_deviations,submitted_at,approved_at,litres_filled,loss_l,remaining_l").order("mfg_date", { ascending: false }).limit(1000)),
      soft(sb.from("filling_lines").select("batch_id,pack_type,size_ml,filled,rejected,filling_runs(run_date)")), soft(sb.from("v_finished_goods").select("batch_code,product_name,variant,pack_type,size_ml,available,dispatched")),
      soft(sb.from("raw_material_status").select("name,unit,on_hand,below_min,below_cover,category")), soft(sb.from("v_product_rm_capacity").select("product_name,variant,rm_name,unit,per_litre,on_hand")),
    ]);
    D = { bt, fl, fg, rm, cap };
  } catch (e) { el.innerHTML = `<p class="dev">Could not load: ${esc(e.message)}</p>`; return; }
  const draw = async () => {
    const R = rangeFor(PRANGE), { bt, fl, fg, rm, cap } = D, nowD = new Date();
    const inB = (b, from, to) => inR(b.mfg_date, from, to), cur = bt.filter(b => b.status !== "draft" && inB(b, R.df, R.dt)), prev = R.pf ? bt.filter(b => b.status !== "draft" && inB(b, R.pf, R.pt)) : null;
    const appr = cur.filter(b => b.status === "approved"), apprP = prev && prev.filter(b => b.status === "approved");
    const litres = sum(appr, b => b.batch_size_l), litresP = apprP && sum(apprP, b => b.batch_size_l);
    const reviewed = cur.filter(b => ["approved", "rejected", "rework"].includes(b.status)), approvalRate = pct(appr.length, reviewed.length);
    const pending = bt.filter(b => b.status === "pending_approval"), oldest = pending.length ? Math.max(...pending.map(b => (nowD - new Date(b.submitted_at)) / 36e5)) : 0;
    const flIn = fl.filter(l => inR(l.filling_runs?.run_date, R.df, R.dt)), filled = sum(flIn, l => l.filled), rej = sum(flIn, l => l.rejected), rejRate = pct(rej, filled + rej);
    const loss = sum(appr, b => b.loss_l), lossRate = pct(loss, litres), devB = cur.filter(b => (b.param_deviations || []).length).length;
    const tat = appr.filter(b => b.submitted_at && b.approved_at).map(b => (new Date(b.approved_at) - new Date(b.submitted_at)) / 36e5), avgTat = tat.length ? sum(tat, x => x) / tat.length : null;
    const bulk = sum(bt.filter(b => b.status === "approved"), b => b.remaining_l), fgUnits = sum(fg, r => r.available);
    const ms = monthsBack(6), mManu = ms.map(k => sum(bt.filter(b => b.status === "approved" && mKey(b.mfg_date) === k), b => b.batch_size_l)), mFill = ms.map(k => sum(bt.filter(b => b.status === "approved" && mKey(b.mfg_date) === k), b => b.litres_filled));
    const stat3 = [["approved", "Approved", "✔", GOOD], ["pending_approval", "Waiting for approval", "⏳", WARN], ["rework", "Sent back for rework", "↺", WARN], ["rejected", "Rejected", "✖", BAD]].map(([k, l, ic, c]) => ({ label: `${ic} ${l}`, value: cur.filter(b => b.status === k).length, color: c, text: String(cur.filter(b => b.status === k).length) }));
    const byProd = {}; appr.forEach(b => { const k = b.product_name + (b.variant ? " · " + b.variant : ""); byProd[k] = (byProd[k] || 0) + n0(b.batch_size_l); });
    const prodItems = Object.entries(byProd).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, text: lit(v) }));
    const fgBy = {}; fg.forEach(r => { const k = `${r.product_name}${r.variant ? " · " + r.variant : ""} · ${r.size_ml ? r.size_ml + " mL " : ""}${r.pack_type}`; fgBy[k] = (fgBy[k] || 0) + n0(r.available); });
    const fgItems = Object.entries(fgBy).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v, text: num(v, 0) + " units" }));
    const cp = {}; cap.forEach(r => { if (n0(r.per_litre) > 0) { const k = r.product_name + (r.variant ? " · " + r.variant : ""), l = Math.max(0, n0(r.on_hand)) / n0(r.per_litre); if (!cp[k] || l < cp[k].l) cp[k] = { l, by: r.rm_name }; } });
    const capItems = Object.entries(cp).sort((a, b) => b[1].l - a[1].l).map(([k, v]) => ({ label: k, value: v.l, text: lit(v.l), tip: `${k} · can make about ${lit(v.l)} with current stock. Limited by ${v.by}` }));
    const ops = {}; cur.forEach(b => { const o = (ops[b.operator_name || "–"] ||= { n: 0, a: 0, rw: 0, dv: 0 }); o.n++; if (b.status === "approved") o.a++; if (b.status === "rework" || b.status === "rejected") o.rw++; if ((b.param_deviations || []).length) o.dv++; });
    const outRm = rm.filter(r => n0(r.on_hand) <= 0).length, lowRm = rm.filter(r => r.below_min || r.below_cover).length, negRm = rm.filter(r => n0(r.on_hand) < 0).length;
    let blocked = [];
    for (const b of pending.slice(0, 10)) { const r = await sb.rpc("batch_stock_check", { p_batch: b.id }); const sh = (r.data || []).filter(x => n0(x.short) > 0.0005); if (sh.length) blocked.push({ b, sh }); }
    const attn = [
      pending.length ? `<div>⏳ <b>${pending.length} batch${pending.length > 1 ? "es" : ""} waiting for approval</b>, oldest ${oldest >= 24 ? (oldest / 24).toFixed(1) + " days" : oldest.toFixed(0) + " hours"}.</div>` : `<div>✔ No batch is waiting for approval.</div>`,
      ...blocked.map(x => `<div>⚠ <b>${esc(x.b.temp_ref)}</b> cannot be approved: short of ${x.sh.map(s => `${esc(s.name)} by ${n0(s.short).toFixed(2)} ${esc(s.unit)}`).join(", ")}.</div>`),
      negRm ? `<div>⚠ <b>${negRm} raw material${negRm > 1 ? "s are" : " is"} below zero.</b> Add the purchase bills in Raw Material Stock.</div>` : "",
      lowRm ? `<div>⚠ <b>${lowRm} item${lowRm > 1 ? "s" : ""} low or out of stock</b> (${outRm} at zero or below). See the Reorder tab.</div>` : `<div>✔ Raw material levels are fine.</div>`,
      devB ? `<div>⚠ <b>${devB} batch${devB > 1 ? "es" : ""} had quality or mixing deviations</b> in this period.</div>` : `<div>✔ No deviations in this period.</div>`,
    ].join("");
    el.innerHTML = `<div class="dv-bar">${rangeSel(PRANGE)}<span class="muted small">${R.label}</span></div>
      <div class="stats">${stat("Litres approved", lit(litres), delta(litres, litresP), "good")}${stat("Batches approved", String(appr.length), `${cur.length} submitted`)}${stat("Approval rate", pc(approvalRate), "Of batches reviewed", approvalRate != null && approvalRate < 80 ? "warn" : "")}
        ${stat("Waiting for approval", String(pending.length), pending.length ? `Oldest ${oldest >= 24 ? (oldest / 24).toFixed(1) + " d" : oldest.toFixed(0) + " h"}` : "", pending.length ? "warn" : "")}${stat("Units filled", num(filled, 0), `Pack rejects ${pc(rejRate)}`)}
        ${stat("Filling loss", pc(lossRate), `${lit(loss)} lost`, lossRate != null && lossRate > 3 ? "warn" : "")}${stat("Avg time to approve", avgTat == null ? "–" : avgTat >= 24 ? (avgTat / 24).toFixed(1) + " days" : avgTat.toFixed(1) + " hours", "Submitted to approved")}${stat("Bulk waiting to fill", lit(bulk), `${num(fgUnits, 0)} finished units available`)}</div>
      <div class="dv-grid">
        ${card("Needs attention", "", `<div class="dv-attn">${attn}</div>`)}
        ${card("Litres made and filled", "Last 6 months, approved batches by manufacturing date.", cols(ms.map(mLabel), [{ name: "Made", color: C1, vals: mManu }, { name: "Filled", color: C2, vals: mFill }], x => lit(x)) + tview(["Month", "Made (L)", "Filled (L)"], ms.map((k, i) => [mLabel(k), mManu[i].toFixed(1), mFill[i].toFixed(1)])))}
        ${card("Batch results", `${R.label}.`, hbars(stat3) + tview(["Result", "Batches"], stat3.map(s => [s.label, s.text])))}
        ${card("What we made", `${R.label}. Litres by product.`, hbars(prodItems, lit) + tview(["Product", "Litres"], prodItems.map(p => [p.label, p.text])))}
        ${card("Finished goods ready to sell", "Units available now.", hbars(fgItems, x => num(x, 0)) + tview(["Item", "Units"], fgItems.map(p => [p.label, p.text])))}
        ${card("How much we can make", "Litres possible with the raw material in stock now (the scarcest ingredient decides).", hbars(capItems, lit) + tview(["Product", "Litres"], capItems.map(p => [p.label, p.text])))}
        ${card("By operator", `${R.label}.`, `<div style="overflow:auto"><table><thead><tr><th>Operator</th><th>Batches</th><th>Approved</th><th>Rework / rejected</th><th>With deviations</th></tr></thead><tbody>${Object.entries(ops).map(([k, o]) => `<tr><td>${esc(k)}</td><td>${o.n}</td><td>${o.a}</td><td>${o.rw}</td><td>${o.dv}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No batches in this period.</td></tr>'}</tbody></table></div>`)}
      </div>`;
    tipInit(el); $("#rg", el).onchange = e => { PRANGE = e.target.value; draw(); };
  };
  await draw();
}
