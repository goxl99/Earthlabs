import{a as sb,e as esc,f as $,g as $$,i as dfmt,o as toast,s as table}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// Invoice & collections register: invoices (from Sales & Invoicing), payments (incl. those pushed from EPDMS),
// pending with ageing, GST summary and CA checks. Everything can be downloaded as Excel for the CA.

const n = x => Number(x) || 0;
const r2 = x => Math.round((n(x) + Number.EPSILON) * 100) / 100;
const INR = x => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(x));
const R = x => "₹" + INR(x);
const iso = d => { const z = d.getTimezoneOffset() * 6e4; return new Date(d - z).toISOString().slice(0, 10); };
const sum = (a, f) => a.reduce((t, x) => t + n(f(x)), 0);
const MODE = { bank: "Bank transfer", upi: "UPI", cash: "Cash", cheque: "Cheque", other: "Other" };
const BUCKETS = [["0–30 days", 0, 30], ["31–60 days", 31, 60], ["61–90 days", 61, 90], ["Over 90 days", 91, 1e9]];

// ---------- data ----------
async function load() {
  const get = async q => { const { data, error } = await q; if (error) throw new Error(error.message); return data || []; };
  const [inv, bal, pay, cus, ord, set, es] = await Promise.all([
    get(sb.from("tax_invoices").select("id,invoice_no,invoice_date,taxable,tax,total,status,order_id,data").order("invoice_date", { ascending: false }).limit(5000)),
    get(sb.from("v_invoice_balance").select("invoice_no,customer_id,customer,total,paid,balance")),
    get(sb.from("customer_payments").select("id,customer_id,invoice_id,paid_on,amount,mode,ref,notes,bank_txn_id,epdms_order_id,epdms_ref").order("paid_on", { ascending: false }).limit(5000)),
    get(sb.from("customers").select("id,name,gstin,state,customer_type,epdms_partner_id")),
    get(sb.from("sales_orders").select("id,order_no,source,epdms_order_id,epdms_invoice_no")),
    get(sb.from("app_settings").select("key,value")).catch(() => []),
    get(sb.from("earlier_sales").select("id,sale_date,customer_id,kind,product,qty,amount,gst_amount,total,received,payment_id,doc_no").order("sale_date", { ascending: false })).catch(() => []),
  ]);
  return build({ inv, bal, pay, cus, ord, set, es });
}

export function build({ inv, bal, pay, cus, ord, set, es = [] }, today = iso(new Date())) {
  const cusBy = Object.fromEntries(cus.map(c => [c.id, c])), ordBy = Object.fromEntries(ord.map(o => [o.id, o]));
  const balBy = Object.fromEntries(bal.map(b => [b.invoice_no, b])), invById = Object.fromEntries(inv.map(i => [i.id, i]));
  const days = d => Math.max(0, Math.floor((new Date(today) - new Date(String(d).slice(0, 10))) / 864e5));
  const issued = inv.filter(i => i.status === "issued");
  const cancelledNos = new Set(inv.filter(i => i.status !== "issued").map(i => i.invoice_no));
  const invoices = issued.map(i => {
    const d = i.data || {}, t = d.totals || {}, b = balBy[i.invoice_no] || {}, o = ordBy[i.order_id] || {}, c = cusBy[b.customer_id] || {};
    const tax = n(i.tax); let cgst = n(t.cgst), sgst = n(t.sgst), igst = n(t.igst);
    if (!(cgst || sgst || igst) && tax) { if (d.inter_state) igst = tax; else { cgst = r2(tax / 2); sgst = r2(tax - cgst); } }
    const paid = n(b.paid), balance = b.balance == null ? n(i.total) - paid : n(b.balance);
    return {
      id: i.id, no: i.invoice_no, date: String(i.invoice_date).slice(0, 10), cust: b.customer || d.buyer?.name || "", custId: b.customer_id || "", custType: c.customer_type || "",
      gstin: d.buyer?.gstin || c.gstin || "", state: d.place_of_supply?.state || d.buyer?.state || c.state || "", order: o.order_no || d.order_no || "", dc: d.challan_ref?.no || "",
      taxable: n(i.taxable), cgst, sgst, igst, tax, total: n(i.total), paid, balance, age: balance > 0.005 ? days(i.invoice_date) : 0,
      status: balance <= 0.005 ? "Paid" : paid > 0.005 ? "Part paid" : "Unpaid", src: o.source === "epdms" ? "EPDMS order" : "Entered here", epdmsInv: o.epdms_invoice_no || "",
    };
  });
  const payments = pay.map(p => {
    const i = invById[p.invoice_id], c = cusBy[p.customer_id] || {}, fromEpdms = !!(p.epdms_ref || p.epdms_order_id);
    return {
      id: p.id, date: String(p.paid_on).slice(0, 10), cust: c.name || "", custId: p.customer_id || "", inv: i?.invoice_no || "", amount: n(p.amount), mode: MODE[p.mode] || p.mode || "",
      ref: p.ref || p.epdms_ref || "", src: fromEpdms ? "EPDMS" : p.bank_txn_id ? "Bank statement" : "Entered here", epdmsOrder: p.epdms_order_id || "", onAcct: !p.invoice_id, advance: p.invoice_id ? 0 : n(p.amount), auto: false, note: p.notes || "",
    };
  });
  const company = Object.fromEntries((set || []).map(s => [s.key, s.value]));
  // Sales recorded as "earlier records" (before the system) are invoices too: ELI/001, ELI/002 ...
  const payById = Object.fromEntries(payments.map(p => [p.id, p])), used = new Set();
  const esInv = es.map(e => {
    const c = cusBy[e.customer_id] || {}, tax = n(e.gst_amount), half = r2(tax / 2), lp = e.payment_id && payById[e.payment_id];
    if (lp) { used.add(lp.id); lp.inv = e.doc_no || "earlier sale"; lp.onAcct = false; lp.advance = 0; }
    return { id: "es:" + e.id, no: e.doc_no || "(no number)", date: String(e.sale_date).slice(0, 10), cust: c.name || "", custId: e.customer_id || "", custType: c.customer_type || "", gstin: c.gstin || "", state: c.state || "", order: "", dc: "", taxable: n(e.amount), cgst: half, sgst: r2(tax - half), igst: 0, tax, total: n(e.total) || n(e.amount) + tax, paid: lp ? lp.amount : n(e.received), balance: 0, age: 0, status: "", src: "Before system", epdmsInv: "", product: e.product || "" };
  });
  esInv.forEach(i => { i.balance = i.total - i.paid; });
  const all = [...invoices, ...esInv];
  // Payments saved without an invoice are matched to the customer's oldest unpaid invoices.
  const pool = {}; payments.filter(p => p.onAcct && !used.has(p.id)).forEach(p => (pool[p.custId] || (pool[p.custId] = [])).push(p));
  Object.entries(pool).forEach(([cid, ps]) => {
    ps.sort((a, b) => a.date.localeCompare(b.date));
    ps.forEach(p => {
      const open = all.filter(i => i.custId === cid && i.balance > 0.005).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
      let left = p.amount; const hit = [], exact = open.find(i => Math.abs(i.balance - p.amount) <= 1);
      for (const i of exact ? [exact] : open) { if (left <= 0.005) break; const x = Math.min(left, i.balance); i.paid += x; i.balance -= x; left -= x; hit.push(i.no); }
      if (hit.length && left <= 1) left = 0;
      if (hit.length) { p.inv = hit.join(", "); p.auto = true; p.advance = left > 0.005 ? r2(left) : 0; p.onAcct = p.advance > 0; }
    });
  });
  all.forEach(i => { if (i.balance > 0.005 && i.balance <= 1) { i.roundoff = r2(i.balance); i.balance = 0; } i.status = i.balance <= 0.005 ? "Paid" : i.paid > 0.005 ? "Part paid" : "Unpaid"; i.age = i.balance > 0.005 ? days(i.date) : 0; });
  all.sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  return { invoices: all, payments, cus, ord, cancelledNos, company, today, days, invById };
}

// ---------- calculations ----------
const inRange = (d, f, t) => (!f || d >= f) && (!t || d <= t);
export function scope(M, F) {
  const invoices = M.invoices.filter(i => inRange(i.date, F.from, F.to) && (!F.cust || i.custId === F.cust));
  const payments = M.payments.filter(p => inRange(p.date, F.from, F.to) && (!F.cust || p.custId === F.cust));
  return { invoices, payments };
}

export function kpis(M, S) {
  const invoiced = sum(S.invoices, i => i.total), collected = sum(S.invoices, i => i.paid), pending = sum(S.invoices, i => i.balance);
  const overdue = sum(S.invoices.filter(i => i.age > 30), i => i.balance), advances = sum(S.payments, p => p.advance);
  const linked = S.payments.filter(p => !p.onAcct), byNo = Object.fromEntries(M.invoices.map(i => [i.no, i]));
  let w = 0, a = 0; linked.forEach(p => { const i = byNo[p.inv]; if (i) { w += p.amount * Math.max(0, (new Date(p.date) - new Date(i.date)) / 864e5); a += p.amount; } });
  const last90 = M.invoices.filter(i => M.days(i.date) <= 90), s90 = sum(last90, i => i.total);
  return { invoiced, collected, pending, overdue, advances, pct: invoiced ? collected / invoiced * 100 : 0, avgDays: a ? w / a : null, dso: s90 ? sum(M.invoices, i => i.balance) / s90 * 90 : null, count: S.invoices.length, open: S.invoices.filter(i => i.balance > 0.005).length };
}

export function ageing(M, S) {
  const by = {};
  const row = (id, name) => by[id] || (by[id] = { id, name, b: [0, 0, 0, 0], pending: 0, advance: 0, n: 0 });
  S.invoices.filter(i => i.balance > 0.005).forEach(i => { const r = row(i.custId || i.cust, i.cust); const k = BUCKETS.findIndex(([, a, b]) => i.age >= a && i.age <= b); r.b[k < 0 ? 3 : k] += i.balance; r.pending += i.balance; r.n++; });
  S.payments.filter(p => p.advance > 0.005).forEach(p => { const r = row(p.custId || p.cust, p.cust); r.advance += p.advance; });
  return Object.values(by).map(r => ({ ...r, net: Math.max(0, r.pending - r.advance) })).sort((a, b) => b.pending - a.pending);
}

export function gstMonthly(S) {
  const by = {};
  S.invoices.forEach(i => { const k = i.date.slice(0, 7); const r = by[k] || (by[k] = { month: k, n: 0, b2b: 0, b2c: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 }); r.n++; r[i.gstin ? "b2b" : "b2c"] += i.taxable; r.taxable += i.taxable; r.cgst += i.cgst; r.sgst += i.sgst; r.igst += i.igst; r.tax += i.tax; r.total += i.total; });
  return Object.values(by).sort((a, b) => a.month.localeCompare(b.month));
}

export function checks(M, S) {
  const out = [], add = (sev, title, detail, items = []) => out.push({ sev, title, detail, items });
  // 1. invoice series gaps (cancelled invoices are fine, they count as used)
  const grp = {}; M.invoices.forEach(i => { const m = /^(.*?)(\d+)$/.exec(i.no || ""); if (m) (grp[m[1]] || (grp[m[1]] = [])).push({ n: +m[2], w: m[2].length }); });
  M.cancelledNos.forEach(no => { const m = /^(.*?)(\d+)$/.exec(no || ""); if (m) (grp[m[1]] || (grp[m[1]] = [])).push({ n: +m[2], w: m[2].length }); });
  const gaps = []; Object.entries(grp).forEach(([p, a]) => { const have = new Set(a.map(x => x.n)), w = a[0].w, lo = 1, hi = Math.max(...have); for (let k = lo; k <= hi; k++) if (!have.has(k)) gaps.push(p + String(k).padStart(w, "0")); });
  add(gaps.length ? "high" : "ok", "Invoice number series", gaps.length ? `${gaps.length} number${gaps.length > 1 ? "s are" : " is"} missing in the series. GST expects every number to be used or shown as cancelled.` : "No gaps in the invoice series.", gaps);
  // 2. old unpaid
  const old = S.invoices.filter(i => i.balance > 0.005 && i.age > 90);
  add(old.length ? "high" : "ok", "Unpaid for more than 90 days", old.length ? `${old.length} invoice${old.length > 1 ? "s" : ""}, ${R(sum(old, i => i.balance))}. Follow up or consider a provision for doubtful debts.` : "Nothing is unpaid beyond 90 days.", old.map(i => `${i.no} · ${i.cust} · ${R(i.balance)} · ${i.age} days`));
  // 3. advances
  const adv = S.payments.filter(p => p.advance > 0.005);
  add(adv.length ? "warn" : "ok", "Payments not linked to an invoice", adv.length ? `${adv.length} payment${adv.length > 1 ? "s" : ""}, ${R(sum(adv, p => p.advance))}, treated as advance / on account. Link them to invoices so the pending list is right.` : "Every payment is linked to an invoice.", adv.map(p => `${p.date} · ${p.cust} · ${R(p.advance)}${p.ref ? " · " + p.ref : ""}`));
  // 4. duplicate references
  const refs = {}; M.payments.filter(p => p.ref).forEach(p => (refs[p.ref.toLowerCase()] || (refs[p.ref.toLowerCase()] = [])).push(p));
  const dup = Object.values(refs).filter(a => a.length > 1);
  add(dup.length ? "high" : "ok", "Duplicate payment references", dup.length ? `${dup.length} reference${dup.length > 1 ? "s are" : " is"} used on more than one payment. Check for double entry.` : "No payment reference is used twice.", dup.map(a => `${a[0].ref} · ${a.length} entries · ${R(sum(a, p => p.amount))}`));
  // 5. dealers without GSTIN
  const nog = S.invoices.filter(i => !i.gstin && i.custType && i.custType !== "direct");
  add(nog.length ? "warn" : "ok", "Business customers without GSTIN", nog.length ? `${nog.length} invoice${nog.length > 1 ? "s" : ""} to dealers/distributors have no buyer GSTIN, so the buyer cannot claim input credit and it goes to B2C in GSTR-1.` : "Every dealer/distributor invoice has a buyer GSTIN.", nog.map(i => `${i.no} · ${i.cust}`));
  // 6. over-collected / mismatch
  const neg = S.invoices.filter(i => i.balance < -0.005), mis = S.invoices.filter(i => Math.abs(i.taxable + i.tax - i.total) > 1);
  add(neg.length ? "high" : "ok", "Invoices collected more than billed", neg.length ? `${neg.length} invoice${neg.length > 1 ? "s" : ""} show a negative balance.` : "No invoice is over-collected.", neg.map(i => `${i.no} · ${i.cust} · ${R(i.balance)}`));
  add(mis.length ? "high" : "ok", "Invoice totals that do not add up", mis.length ? `${mis.length} invoice${mis.length > 1 ? "s" : ""} where taxable + GST is not equal to the total.` : "Taxable value + GST equals the total on every invoice.", mis.map(i => `${i.no} · ${R(i.taxable)} + ${R(i.tax)} vs ${R(i.total)}`));
  // 7. double invoicing with EPDMS
  const dbl = M.invoices.filter(i => i.epdmsInv);
  add(dbl.length ? "high" : "ok", "Possible double invoicing with EPDMS", dbl.length ? `${dbl.length} order${dbl.length > 1 ? "s" : ""} already have an invoice in EPDMS and another here. GST would be charged twice.` : "No order is invoiced in both EPDMS and here.", dbl.map(i => `${i.order || i.no} · ${i.no} here, ${i.epdmsInv} in EPDMS`));
  return out;
}

export function statement(M, custId) {
  const inv = M.invoices.filter(i => i.custId === custId).map(i => ({ d: i.date, doc: "Invoice " + i.no, dr: i.total, cr: 0 }));
  const pay = M.payments.filter(p => p.custId === custId).map(p => ({ d: p.date, doc: "Payment " + (p.mode || "") + (p.ref ? " " + p.ref : "") + (p.inv ? " against " + p.inv + (p.auto ? " (matched)" : "") : " (on account)"), dr: 0, cr: p.amount }));
  let run = 0; const rows = [...inv, ...pay].sort((a, b) => a.d.localeCompare(b.d) || (b.dr - a.dr)).map(x => ({ ...x, bal: (run += x.dr - x.cr) }));
  if (rows.length && run > 0.005 && run <= 1) rows.push({ d: rows[rows.length - 1].d, doc: "Round-off", dr: 0, cr: r2(run), bal: 0 });
  return rows;
}

// ---------- Excel ----------
const dl = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); };
export async function saveBook(name, sheets) {
  const X = await import("./xlsx-TPH7KT7D.js"), wb = X.utils.book_new();
  sheets.forEach(([title, rows]) => { const ws = X.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map((_, c) => ({ wch: Math.min(40, Math.max(10, ...rows.slice(0, 60).map(r => String(r[c] ?? "").length + 2))) })); X.utils.book_append_sheet(wb, ws, title.slice(0, 31)); });
  dl(name, new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/octet-stream" }));
}
const invHead = ["Invoice no", "Invoice date", "Customer", "Customer GSTIN", "Place of supply", "Order", "Challan", "Taxable value", "CGST", "SGST", "IGST", "Total GST", "Invoice total", "Collected till date", "Balance pending", "Days outstanding", "Status", "Source", "Round-off difference"];
const invRow = i => [i.no, i.date, i.cust, i.gstin, i.state, i.order, i.dc, r2(i.taxable), r2(i.cgst), r2(i.sgst), r2(i.igst), r2(i.tax), r2(i.total), r2(i.paid), r2(i.balance), i.balance > 0.005 ? i.age : "", i.status, i.src, i.roundoff ? r2(i.roundoff) : ""];
const payHead = ["Payment date", "Customer", "Against invoice", "Amount", "Mode", "Reference / UTR", "Source", "EPDMS order", "Notes"];
const payRow = p => [p.date, p.cust, p.inv ? p.inv + (p.auto ? " (matched)" : "") : "On account / advance", r2(p.amount), p.mode, p.ref, p.src, p.epdmsOrder, p.note];
const totalRow = (head, rows, cols) => head.map((_, c) => c === 0 ? "TOTAL" : cols.includes(c) ? r2(rows.reduce((t, r) => t + n(r[c]), 0)) : "");

export function packSheets(M, S, F, opts = {}) {
  const K = kpis(M, S), A = ageing(M, S), G = gstMonthly(S), C = checks(M, S);
  const sorted = [...S.invoices].sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
  const ir = sorted.map(invRow), pr = [...S.payments].sort((a, b) => a.date.localeCompare(b.date)).map(payRow);
  const open = sorted.filter(i => i.balance > 0.005).map(i => [i.no, i.date, i.cust, r2(i.total), r2(i.paid), r2(i.balance), i.age, BUCKETS.find(([, a, b]) => i.age >= a && i.age <= b)?.[0] || "Over 90 days"]);
  const co = M.company.co_legal_name || "EarthLabs Innovative Products Pvt. Ltd.";
  return [
    ["Summary", [["Invoice & collections report for CA"], ["Company", co], ["GSTIN", M.company.co_gstin || ""], ["Period", (F.from || "start") + " to " + (F.to || M.today)], ["Customer", F.cust ? (M.cus.find(c => c.id === F.cust)?.name || "") : "All customers"], ["Prepared on", M.today], [],
      ["Invoices raised", K.count], ["Invoiced (incl. GST)", r2(K.invoiced)], ["Collected against these invoices", r2(K.collected)], ["Pending", r2(K.pending)], ["Pending over 30 days", r2(K.overdue)], ["Collection %", r2(K.pct)], ["Advance / on account received", r2(K.advances)], ["Average days to collect", K.avgDays == null ? "" : r2(K.avgDays)], ["DSO (last 90 days)", K.dso == null ? "" : r2(K.dso)]]],
    ["Invoices", [invHead, ...ir, totalRow(invHead, ir, [7, 8, 9, 10, 11, 12, 13, 14])]],
    ["Payments", [payHead, ...pr, totalRow(payHead, pr, [3])]],
    ["Pending invoices", [["Invoice no", "Invoice date", "Customer", "Invoice total", "Collected", "Balance", "Days outstanding", "Age group"], ...open]],
    ["Ageing by customer", [["Customer", "Open invoices", ...BUCKETS.map(b => b[0]), "Total pending", "Advance received", "Net due"], ...A.map(a => [a.name, a.n, ...a.b.map(r2), r2(a.pending), r2(a.advance), r2(a.net)])]],
    ["GST by month", [["Month", "Invoices", "B2B taxable", "B2C taxable", "Taxable value", "CGST", "SGST", "IGST", "Total GST", "Invoice total"], ...G.map(g => [g.month, g.n, r2(g.b2b), r2(g.b2c), r2(g.taxable), r2(g.cgst), r2(g.sgst), r2(g.igst), r2(g.tax), r2(g.total)])]],
    ["Checks", [["Check", "Result", "Details"], ...C.flatMap(c => [[c.title, c.sev === "ok" ? "OK" : c.sev === "high" ? "Needs action" : "Review", c.detail], ...c.items.map(x => ["", "", x])])]],
  ];
}
export async function downloadCAPack(F = { from: "", to: "", cust: "" }) {
  const M = await load(), S = scope(M, F);
  await saveBook(`EarthLabs-invoices-and-collections-${M.today}.xlsx`, packSheets(M, S, F));
}


// ---------- orders in hand (customer orders received but not yet delivered) ----------
export function orderBook(orders, lines, custs = [], today = iso(new Date())) {
  const cBy = Object.fromEntries(custs.map(c => [c.id, c.name])), days = d => Math.max(0, Math.floor((new Date(today) - new Date(String(d).slice(0, 10))) / 864e5));
  const out = [], byProd = {}, byCust = {};
  (orders || []).filter(o => o.status === "open" || o.status === "part_delivered").forEach(o => {
    const L = (lines || []).filter(l => l.order_id === o.id).map(l => { const pend = Math.max(0, n(l.qty) - n(l.delivered_qty)), value = r2(pend * n(l.rate)), gst = r2(value * n(l.gst_pct) / 100); return { desc: l.description || "Item", pend, ordered: n(l.qty), rate: n(l.rate), value, gst }; }).filter(l => l.pend > 0.0005);
    if (!L.length) return;
    const value = sum(L, l => l.value), gst = sum(L, l => l.gst), cust = cBy[o.customer_id] || o.customers?.name || "";
    out.push({ id: o.id, no: o.order_no, date: String(o.order_date).slice(0, 10), cust, source: o.source === "epdms" ? "EPDMS" : "Entered here", status: o.status === "part_delivered" ? "Part delivered" : "Open", lines: L, units: sum(L, l => l.pend), value, gst, total: r2(value + gst), age: days(o.order_date) });
    L.forEach(l => { const q = byProd[l.desc] || (byProd[l.desc] = { desc: l.desc, units: 0, value: 0, total: 0, orders: 0 }); q.units += l.pend; q.value += l.value; q.total += l.value + l.gst; q.orders++; });
    const c = byCust[cust] || (byCust[cust] = { cust, orders: 0, units: 0, value: 0, total: 0 }); c.orders++; c.units += sum(L, l => l.pend); c.value += value; c.total += value + gst;
  });
  out.sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
  return { orders: out, products: Object.values(byProd).sort((a, b) => b.value - a.value), customers: Object.values(byCust).sort((a, b) => b.value - a.value), units: sum(out, o => o.units), value: sum(out, o => o.value), gst: sum(out, o => o.gst), total: sum(out, o => o.total), oldest: out.length ? Math.max(...out.map(o => o.age)) : 0 };
}
export async function loadOrderBook() {
  const get = async q => { const { data, error } = await q; if (error) throw new Error(error.message); return data || []; };
  const [so, sol, cu] = await Promise.all([get(sb.from("sales_orders").select("id,order_no,status,customer_id,order_date,source")), get(sb.from("v_sales_order_lines").select("order_id,description,qty,rate,gst_pct,delivered_qty")), get(sb.from("customers").select("id,name"))]);
  return orderBook(so, so.length ? sol : [], cu, iso(new Date()));
}
// small summary for the dashboards: fills `el`, opens Sales > Orders in hand on click
export async function orderTile(el) {
  try {
    const B = await loadOrderBook(), f = new Intl.NumberFormat("en-IN");
    el.innerHTML = `<div class="dv-attn"><div>Order amount in hand: <b>${R(B.value)}</b> <span class="muted small">(${R(B.total)} with GST)</span></div><div>Open orders: <b>${B.orders.length}</b> from ${B.customers.length} customer${B.customers.length === 1 ? "" : "s"}, ${f.format(B.units)} units still to deliver</div>${B.orders.length ? `<div>Oldest open order: <b>${B.oldest} days</b></div>` : "<div>✔ Nothing waiting to be delivered.</div>"}</div><div style="margin-top:10px"><button class="btn ghost sm" data-ordgo="1">Open orders in hand →</button></div>`;
    const b = el.querySelector("[data-ordgo]"); if (b) b.onclick = e => { e.stopPropagation(); window.__nav = { page: "sales", tab: "orderbook" }; location.hash = "#/sales"; };
  } catch (e) { el.innerHTML = '<span class="muted small">Order amount in hand is not available for your role.</span>'; }
}
const approx = x => { x = n(x); return x >= 1e7 ? "₹" + (x / 1e7).toFixed(2) + " Cr" : x >= 1e5 ? "₹" + (x / 1e5).toFixed(2) + " L" : x >= 1e3 ? "₹" + (x / 1e3).toFixed(1) + " K" : "₹" + Math.round(x); };
// headline tile for the Production dashboard: approx order value in hand, click opens Sales > Orders in hand
export async function orderStat(el) {
  try {
    const B = await loadOrderBook();
    el.title = "Click to see the orders"; el.setAttribute("role", "link"); el.tabIndex = 0; el.classList.add("dv-link");
    el.innerHTML = `<div class="stat-l">Order value in hand</div><div class="stat-v">~${approx(B.value)}</div><div class="stat-s">${B.orders.length} open order${B.orders.length === 1 ? "" : "s"} · ${approx(B.total)} with GST</div>`;
    const go = () => { window.__nav = { page: "sales", tab: "orderbook" }; location.hash = "#/sales"; };
    el.onclick = e => { e.stopPropagation(); go(); }; el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  } catch (e) { el.remove(); }
}
export async function ordersInHand(el) {
  el.innerHTML = '<p class="muted">Loading…</p>';
  let B, today = iso(new Date());
  try { B = await loadOrderBook(); } catch (e) { el.innerHTML = `<p class="dev">Could not load: ${esc(e.message)}</p>`; return; }
  const tile = (l, v, s = "", c = "") => `<div class="stat ${c}"><div class="stat-l">${l}</div><div class="stat-v">${v}</div>${s ? `<div class="stat-s">${s}</div>` : ""}</div>`;
  el.innerHTML = `<div class="toolbar"><b>Order amount in hand</b><span class="muted small">Customer orders received (including from EPDMS) that are not delivered yet.</span><span style="flex:1"></span><button class="btn" id="oxl">⬇ Excel</button></div>
    <div class="stats">${tile("Order amount in hand", R(B.value), "Before GST", "good")}${tile("Including GST", R(B.total), `GST ${R(B.gst)}`)}${tile("Open orders", String(B.orders.length), `${B.customers.length} customer${B.customers.length === 1 ? "" : "s"}`)}${tile("Units still to deliver", new Intl.NumberFormat("en-IN").format(B.units), `${B.products.length} product${B.products.length === 1 ? "" : "s"}`)}${tile("Oldest open order", B.orders.length ? B.oldest + " days" : "–", "Since order date", B.oldest > 30 ? "warn" : "")}</div>
    <h3 style="margin:14px 0 6px">What is waiting to be delivered, by product</h3>` +
    table([{ h: "Product", v: p => p.desc }, { h: "Units to deliver", v: p => new Intl.NumberFormat("en-IN").format(p.units) }, { h: "Orders", v: p => p.orders }, { h: "Amount (before GST)", v: p => R(p.value) }, { h: "Incl. GST", v: p => R(p.total) }], B.products, { empty: "No open orders. Everything ordered has been delivered." }) +
    `<h3 style="margin:16px 0 6px">Open orders</h3>` +
    table([{ h: "Order", v: o => o.no }, { h: "Date", v: o => dfmt(o.date) }, { h: "Customer", v: o => o.cust }, { h: "Source", v: o => o.source }, { h: "Status", v: o => o.status }, { h: "Units to deliver", v: o => new Intl.NumberFormat("en-IN").format(o.units) }, { h: "Amount (before GST)", v: o => R(o.value) }, { h: "Incl. GST", v: o => R(o.total) }, { h: "Days open", html: o => `<span class="${o.age > 30 ? "dev" : ""}">${o.age}</span>` }], B.orders, { empty: "No open orders." }) +
    `<h3 style="margin:16px 0 6px">By customer</h3>` + table([{ h: "Customer", v: c => c.cust }, { h: "Orders", v: c => c.orders }, { h: "Units", v: c => new Intl.NumberFormat("en-IN").format(c.units) }, { h: "Amount (before GST)", v: c => R(c.value) }, { h: "Incl. GST", v: c => R(c.total) }], B.customers, { empty: "No open orders." });
  $("#oxl", el).onclick = () => saveBook(`EarthLabs-orders-in-hand-${today}.xlsx`, [
    ["Summary", [["Order amount in hand"], ["As on", today], ["Open orders", B.orders.length], ["Units to deliver", r2(B.units)], ["Amount before GST", r2(B.value)], ["GST", r2(B.gst)], ["Amount incl. GST", r2(B.total)]]],
    ["Orders", [["Order", "Order date", "Customer", "Source", "Status", "Units to deliver", "Amount before GST", "GST", "Amount incl. GST", "Days open"], ...B.orders.map(o => [o.no, o.date, o.cust, o.source, o.status, r2(o.units), r2(o.value), r2(o.gst), r2(o.total), o.age])]],
    ["Order lines", [["Order", "Customer", "Product", "Ordered qty", "Units to deliver", "Rate", "Amount before GST", "GST"], ...B.orders.flatMap(o => o.lines.map(l => [o.no, o.cust, l.desc, r2(l.ordered), r2(l.pend), r2(l.rate), r2(l.value), r2(l.gst)]))]],
    ["By product", [["Product", "Units to deliver", "Orders", "Amount before GST", "Amount incl. GST"], ...B.products.map(p => [p.desc, r2(p.units), p.orders, r2(p.value), r2(p.total)])]],
    ["By customer", [["Customer", "Orders", "Units", "Amount before GST", "Amount incl. GST"], ...B.customers.map(c => [c.cust, c.orders, r2(c.units), r2(c.value), r2(c.total)])]],
  ]);
}

// ---------- screen ----------
const F = { from: "", to: "", cust: "", status: "", q: "", sub: "inv" };
export async function invoiceRegister(el) {
  el.innerHTML = '<p class="muted">Loading…</p>';
  let M; try { M = await load(); } catch (e) { el.innerHTML = `<p class="dev">Could not load: ${esc(e.message)}</p>`; return; }
  draw(el, M);
}
function draw(el, M) {
  const S = scope(M, F), K = kpis(M, S), q = F.q.trim().toLowerCase();
  const fi = S.invoices.filter(i => (!F.status || (F.status === "overdue" ? i.age > 30 && i.balance > 0.005 : i.status === F.status)) && (!q || (i.no + i.cust + i.order + i.gstin).toLowerCase().includes(q)));
  const fp = S.payments.filter(p => !q || (p.cust + p.inv + p.ref + p.epdmsOrder).toLowerCase().includes(q));
  const custs = [...new Map([...M.invoices, ...M.payments].filter(x => x.custId).map(x => [x.custId, x.cust])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const subs = [["inv", "Invoices"], ["pay", "Payments collected"], ["age", "Pending & ageing"], ["gst", "GST summary"], ["chk", "CA checks"]];
  const bad = checks(M, S).filter(c => c.sev !== "ok").length;
  const tile = (l, v, s = "", c = "") => `<div class="stat ${c}"><div class="stat-l">${l}</div><div class="stat-v">${v}</div>${s ? `<div class="stat-s">${s}</div>` : ""}</div>`;
  el.innerHTML = `<div class="toolbar">
      <label class="inl">From <input type="date" id="rf" value="${F.from}"></label><label class="inl">To <input type="date" id="rt" value="${F.to}"></label>
      <select id="rc"><option value="">All customers</option>${custs.map(([id, nm]) => `<option value="${id}" ${id === F.cust ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select>
      <input type="search" id="rq" placeholder="Search invoice no, customer, reference…" value="${esc(F.q)}">
      <button class="btn ghost" id="rx">Clear</button><button class="btn" id="rpack" title="Invoices, payments, pending, ageing, GST and checks in one Excel file">⬇ Excel for CA</button></div>
    <p class="muted small" style="margin:-4px 0 10px">Till date${F.to ? " (up to " + dfmt(F.to) + ")" : ""}. Payments pushed from EPDMS show as source “EPDMS”.</p>
    <div class="stats">${tile("Invoiced (incl. GST)", R(K.invoiced), `${K.count} invoice${K.count === 1 ? "" : "s"}`)}${tile("Collected", R(K.collected), `${K.pct.toFixed(0)}% of invoiced${K.avgDays == null ? "" : " · avg " + K.avgDays.toFixed(0) + " days to pay"}`, "good")}${tile("Pending", R(K.pending), `${K.open} open invoice${K.open === 1 ? "" : "s"}${K.dso == null ? "" : " · DSO " + K.dso.toFixed(0) + " days"}`, K.pending > 0 ? "warn" : "")}${tile("Pending over 30 days", R(K.overdue), "Chase these first", K.overdue > 0 ? "bad" : "")}${tile("Advance / on account", R(K.advances), "Payments not linked to an invoice")}</div>
    <div class="tabs wrapt">${subs.map(([k, t]) => `<button class="tab ${k === F.sub ? "on" : ""}" data-s="${k}">${t}${k === "chk" && bad ? ` <b class="dev">(${bad})</b>` : ""}</button>`).join("")}</div><div id="rv"></div>`;
  const rv = $("#rv", el), dlBtn = (id, t) => `<div class="row end" style="margin:6px 0"><button class="btn ghost sm" id="${id}">⬇ ${t}</button></div>`;
  if (F.sub === "inv") {
    rv.innerHTML = `<div class="toolbar"><select id="rs">${[["", "All statuses"], ["Unpaid", "Unpaid"], ["Part paid", "Part paid"], ["Paid", "Paid"], ["overdue", "Overdue (30+ days)"]].map(([v, t]) => `<option value="${v}" ${v === F.status ? "selected" : ""}>${t}</option>`).join("")}</select>
      <span class="muted small">${fi.length} invoice${fi.length === 1 ? "" : "s"} · ${R(sum(fi, i => i.total))} billed · ${R(sum(fi, i => i.paid))} collected · ${R(sum(fi, i => i.balance))} pending</span><span style="flex:1"></span><button class="btn ghost sm" id="dx">⬇ Excel – this list</button></div>` +
      table([{ h: "Invoice no", v: i => i.no }, { h: "Date", v: i => dfmt(i.date) }, { h: "Customer", v: i => i.cust }, { h: "Amount", v: i => R(i.total) }, { h: "Collected", v: i => R(i.paid) }, { h: "Pending", v: i => R(i.balance) },
        { h: "Status", html: i => i.status === "Paid" ? "✔ Paid" : `<span class="${i.age > 30 ? "dev" : ""}">${i.status === "Part paid" ? "◐ Part paid" : "● Unpaid"}${i.age > 30 ? " · " + i.age + "d" : ""}</span>` }, { h: "Source", v: i => i.src }], fi, { empty: "No invoices for these filters." });
    $("#rs", rv).onchange = e => { F.status = e.target.value; draw(el, M); };
    $("#dx", rv).onclick = () => saveBook(`EarthLabs-invoices-${M.today}.xlsx`, [["Invoices", [invHead, ...fi.map(invRow)]]]);
  } else if (F.sub === "pay") {
    const epd = fp.filter(p => p.src === "EPDMS");
    rv.innerHTML = `<div class="toolbar"><span class="muted small">${fp.length} payment${fp.length === 1 ? "" : "s"} · ${R(sum(fp, p => p.amount))} collected · ${R(sum(epd, p => p.amount))} of it from EPDMS</span><span style="flex:1"></span><button class="btn ghost sm" id="dx">⬇ Excel – this list</button></div>` +
      table([{ h: "Date", v: p => dfmt(p.date) }, { h: "Customer", v: p => p.cust }, { h: "Invoice", html: p => p.inv ? esc(p.inv) + (p.auto ? ' <span class="muted small">(matched)</span>' : "") + (p.advance > 0.005 ? ' <span class="muted small">+ ' + R(p.advance) + " advance</span>" : "") : '<span class="muted">On account</span>' }, { h: "Amount", v: p => R(p.amount) }, { h: "Mode", v: p => p.mode }, { h: "Reference / UTR", v: p => p.ref || "–" }, { h: "Source", v: p => p.src + (p.epdmsOrder ? " · " + p.epdmsOrder : "") }], fp, { empty: "No payments for these filters." });
    $("#dx", rv).onclick = () => saveBook(`EarthLabs-payments-${M.today}.xlsx`, [["Payments", [payHead, ...fp.map(payRow)]]]);
  } else if (F.sub === "age") {
    const A = ageing(M, S), open = S.invoices.filter(i => i.balance > 0.005).sort((a, b) => b.age - a.age);
    rv.innerHTML = `<div class="toolbar"><b>Who owes us, by age</b><span style="flex:1"></span><button class="btn ghost sm" id="dx">⬇ Excel – pending &amp; ageing</button></div>` +
      table([{ h: "Customer", v: a => a.name }, { h: "Invoices", v: a => a.n }, ...BUCKETS.map(([t], k) => ({ h: t, v: a => a.b[k] ? R(a.b[k]) : "–" })), { h: "Total pending", v: a => R(a.pending) }, { h: "Advance received", v: a => a.advance ? R(a.advance) : "–" }, { h: "Net due", v: a => R(a.net) },
        { h: "", html: a => a.id ? `<button class="btn ghost sm st" data-id="${esc(a.id)}">Statement</button>` : "" }], A, { empty: "Nothing is pending. All invoices are paid." }) +
      `<h3 style="margin:16px 0 6px">Pending invoices</h3>` + table([{ h: "Invoice no", v: i => i.no }, { h: "Date", v: i => dfmt(i.date) }, { h: "Customer", v: i => i.cust }, { h: "Amount", v: i => R(i.total) }, { h: "Pending", v: i => R(i.balance) }, { h: "Days", html: i => `<span class="${i.age > 30 ? "dev" : ""}">${i.age}</span>` }], open, { empty: "No pending invoices." });
    $("#dx", rv).onclick = () => { const s = packSheets(M, S, F); saveBook(`EarthLabs-pending-and-ageing-${M.today}.xlsx`, s.filter(x => ["Pending invoices", "Ageing by customer"].includes(x[0]))); };
    $$(".st", rv).forEach(b => b.onclick = () => { const c = M.cus.find(x => x.id === b.dataset.id), st = statement(M, b.dataset.id); saveBook(`Statement-${(c?.name || "customer").replace(/[^\w]+/g, "_")}-${M.today}.xlsx`, [["Statement", [["Date", "Details", "Debit (billed)", "Credit (received)", "Balance"], ...st.map(x => [x.d, x.doc, x.dr ? r2(x.dr) : "", x.cr ? r2(x.cr) : "", r2(x.bal)]), ["", "Closing balance", "", "", st.length ? r2(st[st.length - 1].bal) : 0]]]]); });
  } else if (F.sub === "gst") {
    const G = gstMonthly(S);
    rv.innerHTML = `<div class="toolbar"><b>GST on sales, by month</b><span class="muted small">B2B = buyer has a GSTIN. Use it to tally GSTR-1 and GSTR-3B.</span><span style="flex:1"></span><button class="btn ghost sm" id="dx">⬇ Excel – GST summary</button></div>` +
      table([{ h: "Month", v: g => g.month }, { h: "Invoices", v: g => g.n }, { h: "Taxable value", v: g => R(g.taxable) }, { h: "B2B", v: g => R(g.b2b) }, { h: "B2C", v: g => R(g.b2c) }, { h: "CGST", v: g => R(g.cgst) }, { h: "SGST", v: g => R(g.sgst) }, { h: "IGST", v: g => R(g.igst) }, { h: "Total GST", v: g => R(g.tax) }, { h: "Invoice total", v: g => R(g.total) }], G, { empty: "No invoices yet." });
    $("#dx", rv).onclick = () => saveBook(`EarthLabs-gst-summary-${M.today}.xlsx`, packSheets(M, S, F).filter(x => x[0] === "GST by month"));
  } else {
    rv.innerHTML = `<p class="muted small">Things a CA would ask about. Fix the red ones before filing returns.</p>` + checks(M, S).map(c => `<div class="notice ${c.sev === "ok" ? "" : c.sev === "warn" ? "warn" : ""}" style="${c.sev === "high" ? "background:#fdecea;border-color:#f1b5ae" : ""}"><b>${c.sev === "ok" ? "✔" : "⚠"} ${esc(c.title)}</b><div class="small">${esc(c.detail)}</div>${c.items.length ? `<div class="small muted" style="margin-top:4px">${c.items.slice(0, 8).map(esc).join("<br>")}${c.items.length > 8 ? `<br>…and ${c.items.length - 8} more (all in the Excel file)` : ""}</div>` : ""}</div>`).join("");
  }
  const redraw = () => draw(el, M);
  $("#rf", el).onchange = e => { F.from = e.target.value; redraw(); }; $("#rt", el).onchange = e => { F.to = e.target.value; redraw(); }; $("#rc", el).onchange = e => { F.cust = e.target.value; redraw(); };
  let tm; $("#rq", el).oninput = e => { F.q = e.target.value; clearTimeout(tm); tm = setTimeout(() => { redraw(); const i = $("#rq", el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  $("#rx", el).onclick = () => { Object.assign(F, { from: "", to: "", cust: "", status: "", q: "" }); redraw(); };
  $("#rpack", el).onclick = async e => { e.target.disabled = true; try { await saveBook(`EarthLabs-invoices-and-collections-${M.today}.xlsx`, packSheets(M, S, F)); toast("Excel downloaded"); } catch (x) { toast("Could not create the file: " + x.message, "err"); } e.target.disabled = false; };
  $$(".tab", el).forEach(b => b.onclick = () => { F.sub = b.dataset.s; redraw(); });
}
