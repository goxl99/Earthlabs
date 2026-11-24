import{a as sb,e as esc,f as $,g as $$,h as num,i as dfmt,m as hasRole,o as toast,p as run,q as modal,s as table}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

const INR = n => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const R = n => "₹" + INR(n);
const CATS = [["raw_material", "Raw material"], ["packaging", "Packaging"], ["marketing", "Marketing"], ["business_dev", "Business development"], ["transport", "Transport"], ["utilities", "Utilities"], ["salary", "Salary"], ["rent", "Rent"], ["asset", "Asset / investment"], ["other", "Other"]];
const CAT = Object.fromEntries(CATS);
const EARLY_NOTE = "Before the system (not added to stock)";
const EARLY_HELP = "Read from the bill. Bought before the system: this is for your accounts only and does <b>not</b> add to stock.";
export const SUBS = {
  business_dev: ["Travel", "Meals & hospitality", "Gifts", "Free samples & demos", "Events & meetings", "Other"],
  marketing: ["Social media", "Paid promotion (ads)", "Influencers & creators", "Content, photos & design", "Printing & branding", "Events & sponsorship", "Website & SEO", "Other"],
  transport: ["Raw material inward", "Delivery to customers", "Local / courier", "Other"],
  utilities: ["Electricity", "Water", "Internet & phone", "Fuel", "Other"],
};
export const guessSub = (cat, text) => {
  const t = String(text || "").toLowerCase();
  if (cat === "business_dev") return /sample|\bdemo\b|trial pack/.test(t) ? "Free samples & demos" : /lunch|dinner|breakfast|\bmeals?\b|restaurant|\bhotel\b|cafe|snacks?|hospitality|\btea\b/.test(t) ? "Meals & hospitality" : /\bgifts?\b|hamper|sweets|bouquet|memento/.test(t) ? "Gifts" : /travel|\btaxi\b|\bcab\b|\btrain\b|flight|bus fare|\btoll\b|\bticket|petrol|\bvisit/.test(t) ? "Travel" : /meeting|conference|expo|event/.test(t) ? "Events & meetings" : "";
  if (cat === "marketing") return /\bads?\b|advert|boost|paid|google|meta|campaign|promot/.test(t) ? "Paid promotion (ads)" : /influenc|creator|blogger/.test(t) ? "Influencers & creators" : /design|photo|video|content|shoot|logo|creative/.test(t) ? "Content, photos & design" : /print|flex|banner|brochure|visiting card|standee|pamphlet|label design|branding/.test(t) ? "Printing & branding" : /sponsor|stall|exhibition|\bevent/.test(t) ? "Events & sponsorship" : /website|seo|domain|hosting/.test(t) ? "Website & SEO" : /instagram|facebook|linkedin|youtube|social|whatsapp|\breel|post/.test(t) ? "Social media" : "";
  if (cat === "transport") return /inward|raw|supplier|pickup/.test(t) ? "Raw material inward" : /deliver|customer|dispatch|outward/.test(t) ? "Delivery to customers" : /courier|local|auto|tempo/.test(t) ? "Local / courier" : "";
  if (cat === "utilities") return /electric|power|\bbill\b.*light|mseb|torrent/.test(t) ? "Electricity" : /water/.test(t) ? "Water" : /internet|phone|mobile|broadband|wifi/.test(t) ? "Internet & phone" : /fuel|diesel|petrol|gas/.test(t) ? "Fuel" : "";
  return "";
};
const MODES = [["bank", "Bank transfer"], ["upi", "UPI"], ["cash", "Cash"], ["cheque", "Cheque"], ["other", "Other"]];
const MODE = Object.fromEntries(MODES);
const PAYERS = ["Company", "Gaurang", "Viraj"];
let TAB = "overview", SUB = "all", SUB2 = "all";
const UNITS = /^(kg|kgs|kilo|kilogram|kilograms|g|gm|gms|gram|grams|l|ltr|ltrs|lt|litre|litres|liter|liters|ml|millilitre|milliliter|pcs|pc|nos|no|piece|pieces|unit|units|each)$/i;
const ASSET_TYPES = [["machinery", "Machinery", 10], ["drums_containers", "Drums & containers", 10], ["vehicle", "Vehicle", 15], ["furniture", "Furniture & fittings", 10], ["computer", "Computers & electronics", 30], ["tools", "Tools & equipment", 15], ["building", "Building / civil", 5], ["other", "Other", 0]];
const ATYPE = Object.fromEntries(ASSET_TYPES.map(a => [a[0], a[1]])), ADEP = Object.fromEntries(ASSET_TYPES.map(a => [a[0], a[2]]));
export const guessAsset = t => { const s = String(t || "").toLowerCase();
  return /drum|barrel|container|carboy|crate|pallet|\bjar\b/.test(s) ? "drums_containers" : /vehicle|truck|tempo|\bvan\b|bike|\bcar\b|scooter/.test(s) ? "vehicle" : /computer|laptop|printer|phone|tablet|scanner|cctv|server|camera/.test(s) ? "computer"
    : /furniture|chair|table|desk|rack|shelf|almirah|cabinet/.test(s) ? "furniture" : /\btool|drill|cutter|spanner|trolley/.test(s) ? "tools" : /building|shed|civil|construction|flooring/.test(s) ? "building" : "machinery"; };
const today = () => new Date().toISOString().slice(0, 10);
const mAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); };

// ---------- helpers for spreadsheets ----------
const loadX = () => import("./xlsx-TPH7KT7D.js");
const readSheet = async file => {
  const X = await loadX();
  const wb = X.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
};
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ymd = (y, m, d) => { y = +y; if (y < 100) y += 2000; const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === +d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : ""; };
export const toISO = v => {
  if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 12 * 3600e3); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  const s = String(v ?? "").trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) return ymd(m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[a-z]*[\s\-,]+(\d{2,4})/)) && MON[m[2].toLowerCase()]) return ymd(m[3], MON[m[2].toLowerCase()], +m[1]);
  return "";
};
export const toNum = v => { if (typeof v === "number") return v; const s = String(v ?? "").replace(/[^0-9.\-]/g, ""); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
export const normCat = v => {
  const s = String(v || "").toLowerCase();
  if (/asset|machin|equipment|capex|drum|vehicle|computer|laptop|furniture|compressor|mixer|boiler|reactor|stirrer|\bpump\b|investment/.test(s)) return "asset";
  if (/sample|\bdemo\b|trial pack|lunch|dinner|breakfast|\bmeals?\b|restaurant|\bhotel\b|cafe|snacks?|hospitality|\btea\b|\bgifts?\b|hamper|sweets|bouquet|memento|travel|\btaxi\b|\bcab\b|\btrain\b|flight|bus fare|\btoll\b|\bticket|petrol|\bvisit|business dev|\bbd\b/.test(s)) return "business_dev";
  if (/raw|material|chemical/.test(s)) return "raw_material"; if (/pack|bottle|carton|label|box/.test(s)) return "packaging";
  if (/market|advert|promo|\bads?\b|brand|social/.test(s)) return "marketing"; if (/transport|freight|logistic|tempo|truck|courier|cartage|delivery/.test(s)) return "transport";
  if (/electric|water|utilit|power|fuel|internet|phone|diesel/.test(s)) return "utilities"; if (/salary|wage|payroll|labou?r/.test(s)) return "salary"; if (/rent|lease/.test(s)) return "rent";
  return "other";
};
const normMode = v => { const s = String(v || "").toLowerCase(); return /upi|gpay|phonepe|paytm/.test(s) ? "upi" : /cash/.test(s) ? "cash" : /chq|cheque|check/.test(s) ? "cheque" : /bank|neft|rtgs|imps|transfer/.test(s) ? "bank" : s ? "other" : "bank"; };
const findCol = (hdr, res) => { for (const re of res) { const i = hdr.findIndex(h => re.test(h)); if (i >= 0) return i; } return -1; };
const download = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };

export const parseExpenseRows = (rows, force = "auto") => {
  const filled = r => r.some(x => String(x).trim() !== "");
  const hi = rows.findIndex(r => r.some(c => /amount|total|value|\brs\b|₹|rate|price|qty|quantity/i.test(String(c))) && r.some(c => /date/i.test(String(c))));
  const hasHdr = hi >= 0, h = hasHdr ? rows[hi].map(x => String(x).toLowerCase().trim()) : [];
  const c = { date: findCol(h, [/^date/, /date/]), vendor: findCol(h, [/vendor|party|payee|supplier|paid to|name/]), desc: findCol(h, [/desc|particular|narration|detail|item|material/]), cat: findCol(h, [/^(?!.*sub).*(categ|type|head|label)/]), sub: findCol(h, [/sub.?categ|sub.?label|sub.?head|sub.?type|sub.?cat/]),
    amt: findCol(h, [/^amount/, /amount|total|value|\brs\b|₹/]), gst: findCol(h, [/gst|tax/]), by: findCol(h, [/paid by|by whom|payer|paid_by|\bby\b/]), mode: findCol(h, [/mode|method/]), notes: findCol(h, [/note|remark/]),
    qty: findCol(h, [/qty|quantity/]), rate: findCol(h, [/rate|price/]), unit: findCol(h, [/^unit|uom/]), bill: findCol(h, [/bill|invoice|inv\b|challan/]) };
  const start = hasHdr ? hi + 1 : 0;
  // no usable headings: work out the columns from what is inside them
  if (!hasHdr || c.date < 0 || c.amt < 0) {
    const sample = rows.slice(start).filter(filled).slice(0, 15), nc = Math.max(0, ...sample.map(r => r.length));
    const share = (j, f) => { const v = sample.map(r => r[j]).filter(x => String(x ?? "").trim() !== ""); return v.length ? v.filter(f).length / v.length : 0; };
    if (c.date < 0) c.date = [...Array(nc).keys()].find(j => share(j, x => !!toISO(x)) >= 0.6) ?? -1;
    const known = new Set([c.qty, c.rate, c.unit, c.gst, c.cat, c.sub, c.by, c.mode, c.notes, c.bill].filter(j => j >= 0)), qr = c.qty >= 0 && c.rate >= 0;
    const nums = [...Array(nc).keys()].filter(j => j !== c.date && !known.has(j) && share(j, x => typeof x === "number" || /^[\s₹Rs.,\d-]+$/.test(String(x))) >= 0.6 && sample.some(r => toNum(r[j]) > 0));
    if (c.amt < 0 && !qr && nums.length) c.amt = nums.map(j => [j, sample.reduce((t, r) => t + toNum(r[j]), 0)]).sort((x, y) => y[1] - x[1])[0][0];
    const txt = [...Array(nc).keys()].filter(j => j !== c.date && j !== c.amt && !known.has(j) && !nums.includes(j));
    const len = j => sample.reduce((t, r) => t + String(r[j] ?? "").length, 0);
    if (c.desc < 0 && txt.length) c.desc = [...txt].sort((x, y) => len(y) - len(x))[0];
    if (c.vendor < 0) { const o = txt.find(j => j !== c.desc); if (o !== undefined) c.vendor = o; }
  }
  const out = [];
  rows.forEach((r, ri) => {
    if (ri < start || !filled(r)) return;
    const g = k => (c[k] >= 0 ? r[c[k]] : "");
    const date = toISO(g("date")), by = String(g("by") || "").trim(), gst = toNum(g("gst")), qty = toNum(g("qty")), rate = toNum(g("rate"));
    let amount = toNum(g("amt")); if (!(amount > 0) && qty > 0 && rate > 0) amount = Math.round((qty * rate + gst) * 100) / 100;
    const unit = String(g("unit") || "").trim(), base = String(g("desc") || "").trim(), ccat = force && force !== "auto" ? force : normCat(g("cat") || g("desc") || g("vendor"));
    const err = !date ? "Date not understood" : !(amount > 0) ? "Amount missing" : "";
    out.push({ line: ri + 1, err, row: { exp_date: date, vendor: String(g("vendor") || "").trim(), description: base, bill_no: String(g("bill") || "").trim(), qty, unit, rate,
      category: ccat, subcategory: String(g("sub") || "").trim() || guessSub(ccat, [g("desc"), g("vendor")].join(" ")), amount, gst_amount: gst, paid_by: by || "Company", payment_mode: normMode(g("mode")), notes: String(g("notes") || "").trim() } });
  });
  return { out, missing: ["date", "amt"].filter(k => c[k] < 0 && !(k === "amt" && c.qty >= 0 && c.rate >= 0)) };
};

export const parseBankRows = rows => {
  let hi = rows.findIndex(r => { const t = r.map(x => String(x).toLowerCase()); return t.some(x => /date/.test(x)) && t.some(x => /debit|withdraw|credit|deposit|amount|dr\b|cr\b/.test(x)); });
  if (hi < 0) return { out: [], error: "Could not find the column headings (Date, Debit/Withdrawal, Credit/Deposit). Please check the file." };
  const h = rows[hi].map(x => String(x).toLowerCase().trim());
  const c = { date: findCol(h, [/^(txn|transaction|value|posting)?\s*date/, /date/]), desc: findCol(h, [/narration|description|particular|remark|detail/]), ref: findCol(h, [/chq|cheque|ref|utr|instrument/]),
    deb: findCol(h, [/withdraw|debit|\bdr\b/]), cred: findCol(h, [/deposit|credit|\bcr\b/]), bal: findCol(h, [/balance/]), amt: findCol(h, [/^amount/]), typ: findCol(h, [/dr\s*\/\s*cr|type/]) };
  const out = [];
  rows.slice(hi + 1).forEach(r => {
    const date = toISO(r[c.date]); if (!date) return;
    let debit = c.deb >= 0 ? toNum(r[c.deb]) : 0, credit = c.cred >= 0 ? toNum(r[c.cred]) : 0;
    if (!debit && !credit && c.amt >= 0) { const a = Math.abs(toNum(r[c.amt])), t = String(c.typ >= 0 ? r[c.typ] : "").toLowerCase(); if (/cr/.test(t)) credit = a; else if (/dr/.test(t)) debit = a; else if (toNum(r[c.amt]) < 0) debit = a; else credit = a; }
    if (!debit && !credit) return;
    out.push({ date, description: String(c.desc >= 0 ? r[c.desc] : "").trim(), ref: String(c.ref >= 0 ? r[c.ref] : "").trim(), debit, credit, balance: c.bal >= 0 && String(r[c.bal]).trim() !== "" ? toNum(r[c.bal]) : null });
  });
  return { out, error: out.length ? "" : "No transactions found in this file." };
};

const stat = (l, v, s = "", cls = "") => `<div class="stat ${cls}"><div class="stat-l">${l}</div><div class="stat-v">${v}</div>${s ? `<div class="stat-s">${s}</div>` : ""}</div>`;
const compress = async file => {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file), sc = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
};

export async function accountsPage(el) {
  if (!hasRole("admin")) { el.innerHTML = '<p class="muted">Accounts is for admin only.</p>'; return; }
  const tabs = [["overview", "Overview"], ["account", "Overall account"], ["ledger", "Party ledger"], ["expenses", "Expenses"], ["assets", "Assets"], ["earlier", "Earlier records"], ["bank", "Bank statement"], ["profit", "Profitability"]];
  if (!tabs.some(([k]) => k === TAB)) TAB = "overview";
  el.innerHTML = `<div class="tabs wrapt">${tabs.map(([k, t]) => `<button class="tab ${k === TAB ? "on" : ""}" data-k="${k}">${t}</button>`).join("")}</div><div id="av"><p class="muted">Loading…</p></div>`;
  $$(".tab", el).forEach(b => b.onclick = () => { TAB = b.dataset.k; accountsPage(el); });
  const av = $("#av", el), reload = () => accountsPage(el);
  const fail = e => { av.innerHTML = `<p class="dev">Could not load: ${esc(e.message)}</p>`; };
  const get = async (q) => { const r = await q; if (r.error) throw r.error; return r.data || []; };
  const sel = (name, opts, cur, extra = "") => `<select name="${name}" ${extra}>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;

  // ---------- expense form (manual / scan / bank) ----------
  const openExpense = async (x = {}, o = {}) => {
    let orders = [], chs = [];
    try { [orders, chs] = await Promise.all([get(sb.from("sales_orders").select("id,order_no,customers(name)").order("created_at", { ascending: false }).limit(200)), get(sb.from("challans").select("id,dc_no,order_id").order("created_at", { ascending: false }).limit(300))]); } catch {}
    const payers = [...new Set([...PAYERS, x.paid_by].filter(Boolean))];
    modal(x.id ? "Edit expense" : "Add expense", `<form id="ef" class="form-grid">
      ${o.note ? `<div class="notice full">${o.note}</div>` : ""}
      <label>Date<input type="date" name="exp_date" required value="${esc(x.exp_date || today())}"></label>
      <label>Main category${sel("category", CATS, x.category || "other")}</label>
      <label>Sub-category <span class="muted small">pick or type</span><input name="subcategory" list="subl" value="${esc(x.subcategory || "")}" placeholder="e.g. Travel"><datalist id="subl">${(SUBS[x.category || "other"] || []).map(v => `<option value="${esc(v)}">`).join("")}</datalist></label>
      <label>Vendor / paid to<input name="vendor" value="${esc(x.vendor || "")}"></label>
      <label>Amount paid (₹, incl. GST)<input type="number" step="0.01" min="0.01" name="amount" required value="${x.amount ?? ""}"></label>
      <label>of which GST (₹)<input type="number" step="0.01" min="0" name="gst_amount" value="${x.gst_amount ?? 0}"></label>
      <label>Paid by<input name="paid_by" list="payers" value="${esc(x.paid_by || "Company")}"><datalist id="payers">${payers.map(p => `<option>${esc(p)}</option>`).join("")}</datalist></label>
      <label>Payment mode${sel("payment_mode", MODES, x.payment_mode || "bank")}</label>
      <label>For order (optional)<select name="order_id"><option value="">Not linked</option>${orders.map(r => `<option value="${r.id}" ${x.order_id === r.id ? "selected" : ""}>${esc(r.order_no)} · ${esc(r.customers?.name || "")}</option>`).join("")}</select></label>
      <label>For delivery / challan (optional)<select name="challan_id"><option value="">Not linked</option>${chs.map(r => `<option value="${r.id}" ${x.challan_id === r.id ? "selected" : ""}>${esc(r.dc_no)}</option>`).join("")}</select></label>
      <label class="full">Description<input name="description" value="${esc(x.description || "")}"></label>
      <label class="full">For (person or company you met, or gave the gift / sample to) <span class="muted small">optional</span><input name="prospect" value="${esc(x.prospect || "")}" placeholder="e.g. Kerone Enterprises, Mr. Shah"></label>
      ${x.id ? "" : `<div id="afx" class="form-grid full" style="display:${(x.category || "") === "asset" ? "grid" : "none"};margin:0;padding:0"><div class="notice full">This is an asset (investment). It is added to the Assets register and is not counted as a running cost.</div>
        <label>Asset type<select name="asset_type">${ASSET_TYPES.map(a => `<option value="${a[0]}" ${(x.asset_type || guessAsset(x.description)) === a[0] ? "selected" : ""}>${a[1]}</option>`).join("")}</select></label>
        <label>Quantity<input type="number" step="0.001" min="0.001" name="qty" value="${x.qty > 0 ? x.qty : 1}"></label>
        <label>Depreciation % per year<input type="number" step="0.1" min="0" max="100" name="dep_rate" value="${x.dep_rate ?? ADEP[x.asset_type || guessAsset(x.description)]}"></label></div>`}
      <label class="full">Notes<input name="notes" value="${esc(x.notes || "")}"></label>
      <div class="full row end"><button class="btn" id="es">Save expense</button></div></form>`, {
      onMount: (m, close) => {
        const cs = $("[name=category]", m), at = $("[name=asset_type]", m), dr = $("[name=dep_rate]", m);
        if (cs && $("#afx", m)) cs.onchange = () => { $("#afx", m).style.display = cs.value === "asset" ? "grid" : "none"; };
        if (cs) cs.addEventListener("change", () => { const dl = $("#subl", m); if (dl) dl.innerHTML = (SUBS[cs.value] || []).map(v => `<option value="${esc(v)}">`).join(""); });
        if (at && dr) at.onchange = () => { dr.value = ADEP[at.value] ?? 0; };
        $("#ef", m).onsubmit = async e => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          $("#es", m).disabled = true;
          const r = await run(sb.rpc("save_expense", { p: { ...f, id: x.id || null, file_path: x.file_path || null, source: x.source || "manual", bank_txn_id: o.bank_txn_id || null, supplier_invoice_id: x.supplier_invoice_id || null } }), "Expense saved");
          $("#es", m).disabled = false;
          if (r) { close(); reload(); }
        };
      },
    });
  };

  // ---------- scanned purchase bill: add to stock + record the expense ----------
  const openPurchaseBill = async (ex, path) => {
    let mats = []; try { mats = await get(sb.from("raw_materials").select("id,name,unit,category").eq("active", true).order("name")); } catch {}
    const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, ""), cat0 = ex.suggested_category === "packaging" ? "packaging" : "raw_material";
    const poolOf = c => { const p = mats.filter(x => (x.category || "raw") === (c === "packaging" ? "packaging" : "raw")); return p.length ? p : mats; };
    const find = (text, c) => { const k = norm(text); if (k.length < 2) return ""; const p = poolOf(c), e = p.filter(x => norm(x.name) === k); if (e.length === 1) return e[0].id;
      const part = p.filter(x => { const n2 = norm(x.name); return n2.length >= 3 && (n2.includes(k) || k.includes(n2)); }); return part.length === 1 ? part[0].id : ""; };
    const gst = Number(ex.gst_amount) || 0, raw = (ex.lines || []).map(l => ({ desc: l.description || "", qty: Number(l.qty) || "", unit: l.unit || "", amt: Number(l.amount) || 0 }));
    const sumL = raw.reduce((t, l) => t + l.amt, 0), incl = ex.total > 0 && sumL > 0 && Math.abs(sumL - ex.total) / ex.total < 0.02;
    const L = raw.map(l => ({ ...l, amount: Math.round((incl || !sumL ? l.amt : l.amt + gst * l.amt / sumL) * 100) / 100, item: find(l.desc, cat0) }));
    modal("Purchase bill: add to stock", `<form id="pbf" class="form-grid"><div class="notice full">Read from the bill. Choose the stock item for each line. Saving adds the quantities to stock, sets the latest purchase rate, and records the expense.</div>
      <label>Vendor<input name="vendor" value="${esc(ex.vendor || "")}"></label><label>Bill no.<input name="bill_no" value="${esc(ex.bill_no || "")}"></label>
      <label>Bill date<input type="date" name="exp_date" value="${esc(ex.bill_date || today())}" required></label>
      <label>Label<select name="category" id="pcat"><option value="raw_material" ${cat0 === "raw_material" ? "selected" : ""}>Raw material</option><option value="packaging" ${cat0 === "packaging" ? "selected" : ""}>Packaging</option></select></label>
      <label>GST in this bill (₹)<input type="number" step="0.01" min="0" name="gst" value="${gst}"></label>
      <label>Paid by<input name="paid_by" value="Company"></label>
      <label>Payment mode<select name="payment_mode">${MODES.map(([v, t]) => `<option value="${v}" ${v === (ex.payment_mode || "bank") ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <div class="full" id="pbl"></div><div class="full row end" style="gap:8px"><button type="button" class="btn ghost" id="pbx">Record as expense only</button><button class="btn" id="pbs">Add to stock and record</button></div></form>`, {
      wide: true,
      onMount: (m, close) => {
        const draw = () => {
          $("#pbl", m).innerHTML = `<table class="tbl edit"><thead><tr><th>On the bill</th><th>Stock item</th><th>Qty</th><th>Unit</th><th>Amount incl. GST (₹)</th><th></th></tr></thead><tbody>${L.map((l, i) => `<tr data-i="${i}"><td>${esc(l.desc)}</td>
            <td><select data-f="item"><option value="">Choose…</option>${poolOf($("#pcat", m).value).map(x => `<option value="${x.id}" ${l.item === x.id ? "selected" : ""}>${esc(x.name)} (${esc(x.unit)})</option>`).join("")}</select></td>
            <td><input data-f="qty" type="number" step="any" value="${l.qty}" style="width:90px"></td><td><input data-f="unit" value="${esc(l.unit)}" style="width:60px" placeholder="unit"></td>
            <td><input data-f="amount" type="number" step="0.01" value="${l.amount}" style="width:110px"></td><td><button type="button" class="btn ghost sm del">✕</button></td></tr>`).join("")}</tbody></table>`;
          const ok = L.length && L.every(l => l.item && Number(l.qty) > 0 && Number(l.amount) > 0); $("#pbs", m).disabled = !ok;
        };
        draw();
        $("#pcat", m).onchange = () => { L.forEach(l => { l.item = find(l.desc, $("#pcat", m).value); }); draw(); };
        $("#pbl", m).addEventListener("change", e => { const tr = e.target.closest("tr[data-i]"); if (!tr) return; const l = L[tr.dataset.i]; l[e.target.dataset.f] = e.target.value; draw(); });
        $("#pbl", m).addEventListener("click", e => { const d = e.target.closest(".del"); if (!d) return; L.splice(d.closest("tr").dataset.i, 1); draw(); });
        $("#pbx", m).onclick = () => { close(); openExpense({ exp_date: ex.bill_date || today(), vendor: ex.vendor || "", description: ex.description || "", category: $("#pcat", m).value, amount: ex.total ?? "", gst_amount: gst, payment_mode: ex.payment_mode || "bank", file_path: path, source: "scan" }); };
        $("#pbf", m).onsubmit = async e => {
          e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), tot = L.reduce((t, l) => t + Number(l.amount), 0), g = Number(f.gst) || 0;
          const rows = L.map(l => { const mt = mats.find(x => x.id === l.item), share = tot ? g * Number(l.amount) / tot : 0;
            return { exp_date: f.exp_date, vendor: f.vendor, bill_no: f.bill_no, description: l.desc, category: f.category, raw_material_id: l.item, qty: Number(l.qty), unit: UNITS.test(l.unit || "") ? l.unit : mt.unit, amount: Number(l.amount), gst_amount: Math.round(share * 100) / 100, paid_by: f.paid_by || "Company", payment_mode: f.payment_mode, file_path: path, source: "scan" }; });
          $("#pbs", m).disabled = true;
          const r = await run(sb.rpc("bulk_import_purchases", { p_rows: rows }), null);
          if (r && !(r.failed || []).length) { toast(`Added ${r.stock_lines ?? rows.length} items to stock and recorded the expense`); close(); reload(); }
          else if (r) { toast("Not saved: " + r.failed.map(x => x.error).join("; "), "err"); $("#pbs", m).disabled = false; } else $("#pbs", m).disabled = false;
        };
      },
    });
  };

  // ---------- scan a bill ----------
  const scanCat = ex => (ex.suggested_category && ex.suggested_category !== "other") ? ex.suggested_category : normCat([ex.description, ex.vendor].join(" "));
  const openScan = (opt = {}) => modal("Scan a bill or receipt", `<p class="muted">Take a photo or upload a PDF of any expense bill or purchase invoice. The details are read automatically. You then choose the label (raw material, packaging, marketing, transport…) and save.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="spick">Choose photo / PDF</button><button class="btn ghost" id="scam">Take photo</button></div>
    <input id="sf" type="file" accept="application/pdf,image/*" hidden><input id="sc" type="file" accept="image/*" capture="environment" hidden><p id="sst" class="muted small"></p>`, {
    onMount: (m, close) => {
      const status = t => { $("#sst", m).textContent = t; }, en = v => ["spick", "scam"].forEach(i => $("#" + i, m).disabled = !v);
      const onFile = async file => {
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) return toast("File is too large (max 25 MB)", "err");
        en(false); status("Uploading…");
        const up = await compress(file), ext = (up.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
        const { error: ue } = await sb.storage.from("expense-files").upload(path, up, { contentType: up.type || undefined });
        if (ue) { status(""); en(true); return toast("Upload failed: " + ue.message, "err"); }
        status("Reading the bill… about 10–20 seconds.");
        const { data } = await sb.functions.invoke("read-expense", { body: { path } });
        const ex = data?.extracted;
        if (!ex) {
          status(""); en(true); close();
          toast(data?.error === "not_configured" ? "Automatic reading isn't switched on. Fill the details yourself; the photo is attached." : "Could not read it" + (data?.message ? ": " + data.message : "") + ". Fill the details yourself; the photo is attached.", "err");
          return openExpense({ file_path: path, source: "scan", ...(opt.earlier ? { notes: EARLY_NOTE } : {}) }, { note: opt.earlier ? EARLY_HELP : "The photo is attached. Type the details." });
        }
        close();
        if (!opt.earlier && ["raw_material", "packaging"].includes(ex.suggested_category) && (ex.lines || []).length) return openPurchaseBill(ex, path);
        openExpense({ exp_date: ex.bill_date || today(), vendor: ex.vendor || "", description: [ex.description, ex.bill_no ? "Bill " + ex.bill_no : ""].filter(Boolean).join(" · "), category: scanCat(ex), subcategory: guessSub(scanCat(ex), [ex.description, ex.vendor].join(" ")),
          amount: ex.total ?? "", gst_amount: ex.gst_amount ?? 0, payment_mode: ex.payment_mode || "bank", file_path: path, source: "scan", ...(opt.earlier ? { notes: EARLY_NOTE } : {}) },
          { note: opt.earlier ? EARLY_HELP : "Read from the bill. Check the amount, then choose the correct label and who paid before saving." });
      };
      $("#spick", m).onclick = () => $("#sf", m).click(); $("#scam", m).onclick = () => $("#sc", m).click();
      $("#sf", m).onchange = e => onFile(e.target.files[0]); $("#sc", m).onchange = e => onFile(e.target.files[0]);
    },
  });

  // ---------- bulk excel (expenses + stock purchases) ----------
  // (units pattern is declared at module level)
  const UNITS_ = /^(kg|kgs|kilo|kilogram|kilograms|g|gm|gms|gram|grams|l|ltr|ltrs|lt|litre|litres|liter|liters|ml|millilitre|milliliter|pcs|pc|nos|no|piece|pieces|unit|units|each)$/i;
  const STOCK = { raw_material: "raw", packaging: "packaging" };
  const openBulkExpenses = (preset = "auto") => modal("Upload from Excel", `<p class="muted">Upload any Excel or CSV list of bills or spends. Date, amount, vendor and item are found automatically, even if the headings differ. Optional columns: Category, Bill no, Qty, Unit, Rate, GST, Paid by, Mode, Notes.</p>
    <label>This file is<select id="kind"><option value="auto">Work it out from each row (Category column)</option>${CATS.map(([k, t]) => `<option value="${k}" ${k === preset ? "selected" : ""}>${k === "other" ? "Other expense" : t}</option>`).join("")}</select></label>
    <p class="muted small">Raw material and packaging rows are added to your stock when you pick the stock item, and set the latest purchase rate. Other labels are recorded as expenses only.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn ghost" id="tpl">Download template</button><button class="btn" id="bp">Choose Excel / CSV</button></div><input id="bf" type="file" accept=".xlsx,.xls,.csv" hidden><div id="bo"></div>`, {
    wide: true,
    onMount: async (m, close) => {
      let rows = null, all = [], mats = [];
      try { mats = await get(sb.from("raw_materials").select("id,name,unit,category").eq("active", true).order("name")); } catch {}
      const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const pool = cat => { const w = STOCK[cat]; const p = mats.filter(x => (x.category || "raw") === w); return p.length ? p : mats; };
      const guess = r => {
        if (!STOCK[r.row.category]) return "";
        const key = norm(r.row.description) || norm(r.row.vendor); if (key.length < 2) return "";
        const p = pool(r.row.category), ex = p.filter(x => norm(x.name) === key); if (ex.length === 1) return ex[0].id;
        const part = p.filter(x => { const k = norm(x.name); return k.length >= 3 && (k.includes(key) || key.includes(k)); }); return part.length === 1 ? part[0].id : "";
      };
      $("#tpl", m).onclick = async () => {
        const X = await loadX(), ws = X.utils.aoa_to_sheet([["Date", "Bill no", "Vendor", "Description", "Category", "Qty", "Unit", "Rate", "Amount", "GST", "Paid by", "Mode", "Notes"], ["2026-11-20", "", "Shree Transport", "Tempo to Surat", "Transport", "", "", "", 2500, 0, "Gaurang", "Cash", ""], ["2026-11-21", "B-101", "ABC Chemicals", "SLES 70%", "Raw material", 100, "kg", 80, 9440, 1440, "Company", "Bank", ""], ["2026-11-22", "", "Meta Ads", "Instagram campaign", "Marketing", "", "", "", 5900, 900, "Company", "UPI", ""]]);
        const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Expenses");
        download("earthlabs-expenses-template.xlsx", new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/octet-stream" }));
      };
      const state = r => {
        if (r.err) return r.err;
        if (r.item && !(Number(r.row.qty) > 0)) return "Quantity needed to add stock";
        return "";
      };
      const render = () => {
        const ok = all.filter(r => !state(r)), stk = ok.filter(r => r.item && STOCK[r.row.category]), bad = all.length - ok.length;
        const sums = CATS.map(([k, t]) => [t, ok.filter(r => r.row.category === k).reduce((s2, r) => s2 + r.row.amount, 0)]).filter(x => x[1] > 0);
        const noItem = ok.filter(r => STOCK[r.row.category] && !r.item).length;
        $("#bo", m).innerHTML = `<p style="margin-top:10px"><b>${ok.length}</b> rows ready${bad ? `, <b>${bad}</b> need attention and will be skipped` : ""}. Total ${R(ok.reduce((s2, r) => s2 + r.row.amount, 0))}${sums.length ? " · " + sums.map(x => `${x[0]} ${R(x[1])}`).join(" · ") : ""}.</p>
          <p class="small"><b>${stk.length}</b> rows will be added to stock${noItem ? `, <span style="color:#b45309">${noItem} raw material / packaging rows have no stock item chosen and will be saved as expenses only</span>` : ""}.</p>
          <div style="max-height:300px;overflow:auto">${table([{ h: "Line", v: r => r.line }, { h: "Date", v: r => r.row.exp_date || "–" }, { h: "Vendor", v: r => r.row.vendor }, { h: "Item / details", v: r => r.row.description },
            { h: "Label", html: r => r.err ? "–" : `<select class="rc" data-i="${r.idx}">${CATS.map(([k, t]) => `<option value="${k}" ${r.row.category === k ? "selected" : ""}>${t}</option>`).join("")}</select>` },
            { h: "Stock item", html: r => r.err || !STOCK[r.row.category] ? "–" : `<select class="ri" data-i="${r.idx}"><option value="">Don't add to stock</option>${pool(r.row.category).map(x => `<option value="${x.id}" ${r.item === x.id ? "selected" : ""}>${esc(x.name)} (${esc(x.unit)})</option>`).join("")}</select>` },
            { h: "Qty", v: r => r.row.qty > 0 ? `${+Number(r.row.qty).toFixed(3)} ${r.row.unit || ""}` : "–" },
            { h: "Amount", v: r => INR(r.row.amount) }, { h: "Paid by", v: r => r.row.paid_by }, { h: "Check", v: r => state(r) || "OK" }], all, { empty: "Nothing found" })}</div>
          <div class="row end" style="margin-top:8px"><button class="btn" id="bgo" ${ok.length ? "" : "disabled"}>Import ${ok.length} entries${stk.length ? ` (${stk.length} to stock)` : ""}</button></div>`;
        $$(".rc", m).forEach(sl => sl.onchange = () => { const r = all[+sl.dataset.i]; r.row.category = sl.value; r.item = guess(r); render(); });
        $$(".ri", m).forEach(sl => sl.onchange = () => { all[+sl.dataset.i].item = sl.value; render(); });
        $("#bgo", m).onclick = async () => {
          $("#bgo", m).disabled = true;
          const toStock = [], toExp = [];
          ok.forEach(r => {
            const mat = r.item && STOCK[r.row.category] ? mats.find(x => x.id === r.item) : null;
            if (mat) toStock.push({ ...r.row, raw_material_id: mat.id, unit: UNITS.test(r.row.unit || "") ? r.row.unit : mat.unit, rate: r.row.rate > 0 ? r.row.rate : null });
            else if (r.row.category === "asset") { const t = guessAsset(r.row.description || r.row.vendor); toExp.push({ ...r.row, asset_type: t, dep_rate: ADEP[t] ?? 0, qty: Number(r.row.qty) > 0 ? r.row.qty : 1 }); }
            else { const q = Number(r.row.qty) > 0 ? ` (${+Number(r.row.qty).toFixed(3)}${r.row.unit ? " " + r.row.unit : ""})` : ""; toExp.push({ ...r.row, description: (r.row.description + q + (r.row.bill_no ? " · Bill " + r.row.bill_no : "")).trim() }); }
          });
          let nb = 0, ns = 0, ne = 0; const fails = [];
          if (toStock.length) { const r = await run(sb.rpc("bulk_import_purchases", { p_rows: toStock }), null); if (!r) { $("#bgo", m).disabled = false; return; } nb = r.bills ?? 0; ns = r.stock_lines ?? 0; (r.failed || []).forEach(f => fails.push("stock row " + f.row + ": " + f.error)); }
          if (toExp.length) { const r = await run(sb.rpc("bulk_import_expenses", { p_rows: toExp }), null); if (!r) { $("#bgo", m).disabled = false; return; } ne = r.imported ?? toExp.length; (r.failed || []).forEach(f => fails.push("row " + f.row + ": " + f.error)); }
          toast(`${ns ? ns + " items added to stock (" + nb + " bills)" : ""}${ns && ne ? ", " : ""}${ne ? ne + " expenses recorded" : ""}${fails.length ? ". Not imported: " + fails.join("; ") : ""}`, fails.length ? "err" : undefined);
          close(); reload();
        };
      };
      const build = () => {
        const p = parseExpenseRows(rows, $("#kind", m).value);
        if (p.missing.length) { $("#bo", m).innerHTML = '<div class="notice err">Could not find a Date column and an Amount column in this file.</div>'; return; }
        all = p.out.map((r, i) => ({ ...r, idx: i, item: "" })); all.forEach(r => { r.item = r.err ? "" : guess(r); }); render();
      };
      $("#bp", m).onclick = () => $("#bf", m).click();
      $("#kind", m).onchange = () => { if (rows) build(); };
      $("#bf", m).onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try { rows = await readSheet(f); } catch (x) { return toast("Could not open that file: " + x.message, "err"); }
        build();
      };
    },
  });

  // ---------- record payment ----------
  const openPayment = (cust, invoices, pre = {}, o = {}) => modal("Record payment received", `<form id="pf" class="form-grid">
    <div class="notice full">${esc(cust.name)}${o.note ? " · " + o.note : ""}</div>
    <label class="full">Against invoice<select name="invoice_id" id="pinv"><option value="">On account (no specific invoice)</option>${invoices.filter(i => Number(i.balance) > 0.005).map(i => `<option value="${i.id}" data-bal="${i.balance}" ${pre.invoice_id === i.id ? "selected" : ""}>${esc(i.invoice_no)} · ${dfmt(i.invoice_date)} · balance ${R(i.balance)}</option>`).join("")}</select></label>
    <label>Amount received (₹)<input type="number" step="0.01" min="0.01" name="amount" required value="${pre.amount ?? ""}"></label>
    <label>Date received<input type="date" name="paid_on" required value="${esc(pre.paid_on || today())}"></label>
    <label>Mode${sel("mode", MODES, pre.mode || "bank")}</label>
    <label>Reference (UTR / cheque no.)<input name="ref" value="${esc(pre.ref || "")}"></label>
    <label class="full">Notes<input name="notes"></label>
    <div class="full row end"><button class="btn" id="ps">Mark as received</button></div></form>`, {
    onMount: (m, close) => {
      const inv = $("#pinv", m), amt = $("[name=amount]", m);
      inv.onchange = () => { const b = inv.selectedOptions[0]?.dataset.bal; if (b && !pre.amount) amt.value = b; };
      if (pre.invoice_id && !pre.amount) inv.onchange();
      $("#pf", m).onsubmit = async e => {
        e.preventDefault();
        $("#ps", m).disabled = true;
        const r = await run(sb.rpc("record_payment", { p: { ...Object.fromEntries(new FormData(e.target)), customer_id: cust.id, bank_txn_id: o.bank_txn_id || null } }), "Payment recorded");
        $("#ps", m).disabled = false;
        if (r) { close(); (o.after || reload)(); }
      };
    },
  });

  // =================== OVERVIEW ===================
  const overview = async () => {
    const [rm, ols, invs, pays, exps, sinv, ast, esl] = await Promise.all([
      get(sb.from("v_rm_value").select("*").order("name")), get(sb.from("v_sales_order_lines").select("order_id,qty,rate,gst_pct")), get(sb.from("tax_invoices").select("total").eq("status", "issued")),
      get(sb.from("customer_payments").select("amount")), get(sb.from("expenses").select("amount,category,paid_by,reimbursed")), get(sb.from("supplier_invoices").select("total")), get(sb.from("v_assets").select("cost,book_value,status")), get(sb.from("earlier_sales").select("total")),
    ]);
    const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
    const stock = sum(rm, r => r.value), noRate = rm.filter(r => r.no_rate && Number(r.on_hand) > 0).length;
    const ordVal = sum(ols, l => l.qty * l.rate * (1 + l.gst_pct / 100)), billed = sum(invs, i => i.total) + sum(esl, e => e.total), rec = sum(pays, p => p.amount);
    const exTot = sum(exps, e => e.amount), byCat = Object.fromEntries(CATS.map(([k]) => [k, 0])); exps.forEach(e => byCat[e.category] += Number(e.amount));
    const byPayer = {}; exps.forEach(e => { byPayer[e.paid_by] = (byPayer[e.paid_by] || 0) + Number(e.amount); });
    const owed = {}; exps.filter(e => e.paid_by.toLowerCase() !== "company" && !e.reimbursed).forEach(e => { owed[e.paid_by] = (owed[e.paid_by] || 0) + Number(e.amount); });
    av.innerHTML = `<div class="stats">
      ${stat("Raw material at plant (idle stock)", R(stock), noRate ? `${noRate} items have no purchase rate yet` : "On hand × last purchase rate")}
      ${stat("Raw material bought (bills)", R(sum(sinv, s => s.total)), "Supplier bills uploaded")}
      ${stat("Order value (all orders, incl. GST)", R(ordVal))}
      ${stat("Invoiced", R(billed))}
      ${stat("Received", R(rec), "", "good")}
      ${stat("To collect", R(billed - rec), "Invoiced minus received", billed - rec > 0 ? "warn" : "")}
      ${stat("Expenses recorded", R(exTot))}
      ${stat("Investment in assets", R(sum(ast, a => a.cost)), `Book value now ${R(sum(ast.filter(a => a.status === "in_use"), a => a.book_value))}`)}
    </div>
    <div class="card"><h3>Expenses by label</h3>${table([{ h: "Label", v: r => r[0] }, { h: "Amount", v: r => R(r[1]) }], CATS.map(([k, t]) => [t, byCat[k]]), { empty: "No expenses yet" })}</div>
    <div class="card"><h3>Expenses by who paid</h3>${table([{ h: "Paid by", v: r => r[0] }, { h: "Total paid", v: r => R(r[1]) }, { h: "Still to be paid back", v: r => owed[r[0]] ? R(owed[r[0]]) : "–" }], Object.entries(byPayer), { empty: "No expenses yet" })}</div>
    <div class="card"><h3>Raw material at the plant</h3>${table([{ h: "Material", v: r => r.name }, { h: "On hand", v: r => `${+Number(r.on_hand).toFixed(3)} ${r.unit}` }, { h: "Last rate", v: r => r.rate ? `${R(r.rate)} / ${r.rate_unit}` : "No bill yet" }, { h: "Value", v: r => r.no_rate ? "–" : R(r.value) }], rm.filter(r => Number(r.on_hand) > 0), { empty: "No stock on hand" })}</div>`;
  };

  // =================== PARTY LEDGER ===================
  const ledger = async () => {
    const [cb, ib] = await Promise.all([get(sb.from("v_customer_balance").select("*").order("name")), get(sb.from("v_invoice_balance").select("*").order("invoice_date"))]);
    const draw = () => {
      const t = ($("#q", av).value || "").toLowerCase(), only = $("#ow", av).checked;
      const rows = cb.filter(c => (!t || c.name.toLowerCase().includes(t)) && (!only || Number(c.billed) - Number(c.received) > 0.005));
      $("#tb", av).innerHTML = table([{ h: "Customer", v: c => c.name }, { h: "Type", v: c => c.customer_type === "direct" ? "Direct" : c.customer_type === "dealer" ? "Dealer" : "Distributor" }, { h: "Billed", v: c => R(c.billed) }, { h: "Received", v: c => R(c.received) },
        { h: "Outstanding", v: c => R(Number(c.billed) - Number(c.received)) }, { h: "", html: c => `<button class="btn ghost sm st" data-id="${c.customer_id}">Ledger</button> <button class="btn sm pay" data-id="${c.customer_id}">Payment</button>` }], rows, { empty: "No customers yet" });
      $$(".st", av).forEach(b => b.onclick = () => openLedger(cb.find(c => c.customer_id === b.dataset.id)));
      $$(".pay", av).forEach(b => b.onclick = () => { const c = cb.find(x => x.customer_id === b.dataset.id); openPayment({ id: c.customer_id, name: c.name }, ib.filter(i => i.customer_id === c.customer_id)); });
    };
    av.innerHTML = `<div class="toolbar"><input id="q" type="search" placeholder="Search customer…"><label class="row" style="gap:6px"><input type="checkbox" id="ow"> Only with balance due</label><span class="grow"></span><button class="btn ghost" id="bpay">Upload payments (Excel)</button></div>
      <div class="stats">${stat("Billed", R(cb.reduce((s, c) => s + Number(c.billed), 0)))}${stat("Received", R(cb.reduce((s, c) => s + Number(c.received), 0)), "", "good")}${stat("Outstanding", R(cb.reduce((s, c) => s + Number(c.billed) - Number(c.received), 0)), "", "warn")}</div><div id="tb"></div>`;
    draw(); $("#q", av).oninput = draw; $("#ow", av).onchange = draw;
    $("#bpay", av).onclick = openBulkPayments;
  };
  const openLedger = async c => {
    const [invs, pays, esl] = await Promise.all([get(sb.from("v_invoice_balance").select("*").eq("customer_id", c.customer_id).order("invoice_date")), get(sb.from("customer_payments").select("*").eq("customer_id", c.customer_id).order("paid_on")), get(sb.from("earlier_sales").select("*").eq("customer_id", c.customer_id).order("sale_date"))]);
    const invNo = Object.fromEntries(invs.map(i => [i.id, i.invoice_no]));
    const ev = [...invs.map(i => ({ d: i.invoice_date, t: "Invoice " + i.invoice_no, dr: Number(i.total), cr: 0 })), ...esl.map(e => ({ d: e.sale_date, t: "Earlier sale (before the system): " + e.product, dr: Number(e.total), cr: 0 })), ...pays.map(p => ({ d: p.paid_on, t: `Payment received (${MODE[p.mode] || p.mode})${p.invoice_id ? " · " + (invNo[p.invoice_id] || "") : " · on account"}${p.ref ? " · " + p.ref : ""}`, dr: 0, cr: Number(p.amount), id: p.id }))].sort((a, b) => String(a.d).localeCompare(String(b.d)));
    let bal = 0; ev.forEach(e => { bal += e.dr - e.cr; e.bal = bal; });
    modal("Ledger · " + c.name, `<div class="stats">${stat("Billed", R(c.billed))}${stat("Received", R(c.received), "", "good")}${stat("Outstanding", R(Number(c.billed) - Number(c.received)), "", "warn")}</div>
      <h4>Invoices</h4>${table([{ h: "Invoice", v: i => i.invoice_no }, { h: "Date", v: i => dfmt(i.invoice_date) }, { h: "Amount", v: i => R(i.total) }, { h: "Paid", v: i => R(i.paid) }, { h: "Balance", v: i => Number(i.balance) > 0.005 ? R(i.balance) : "Paid ✓" },
        { h: "", html: i => Number(i.balance) > 0.005 ? `<button class="btn sm mk" data-id="${i.id}">Mark paid</button>` : "" }], invs, { empty: "No invoices issued yet" })}
      <h4>Statement</h4><div style="max-height:260px;overflow:auto">${table([{ h: "Date", v: e => dfmt(e.d) }, { h: "Details", v: e => e.t }, { h: "Debit", v: e => e.dr ? INR(e.dr) : "" }, { h: "Credit", v: e => e.cr ? INR(e.cr) : "" }, { h: "Balance", v: e => INR(e.bal) },
        { h: "", html: e => e.id ? `<button class="btn ghost sm dp" data-id="${e.id}">Delete</button>` : "" }], ev, { empty: "Nothing yet" })}</div>
      <div class="row end" style="margin-top:8px"><button class="btn" id="np">Record payment</button></div>`, {
      wide: true,
      onMount: (m, close) => {
        const again = () => { close(); reload(); };
        $$(".mk", m).forEach(b => b.onclick = () => { close(); openPayment({ id: c.customer_id, name: c.name }, invs, { invoice_id: b.dataset.id }); });
        $("#np", m).onclick = () => { close(); openPayment({ id: c.customer_id, name: c.name }, invs); };
        $$(".dp", m).forEach(b => b.onclick = async () => { if (!confirm("Delete this payment entry? The invoice balance goes back up.")) return; if (await run(sb.rpc("delete_payment", { p_id: b.dataset.id }), "Payment deleted") !== null) again(); });
      },
    });
  };
  const openBulkPayments = () => modal("Upload payments from Excel", `<p class="muted">Columns: <b>Customer</b> (exact name) or <b>Invoice no</b>, <b>Date</b>, <b>Amount</b>, <b>Mode</b>, <b>Reference</b>.</p>
    <div class="row" style="gap:8px"><button class="btn ghost" id="tpl">Download template</button><button class="btn" id="bp">Choose Excel / CSV</button></div><input id="bf" type="file" accept=".xlsx,.xls,.csv" hidden><div id="bo"></div>`, {
    wide: true,
    onMount: (m, close) => {
      $("#tpl", m).onclick = async () => { const X = await loadX(), ws = X.utils.aoa_to_sheet([["Customer", "Invoice no", "Date", "Amount", "Mode", "Reference"], ["Kerone Enterprises", "ELI/002", "2026-11-22", 5000, "UPI", "UTR123"]]); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Payments"); download("earthlabs-payments-template.xlsx", new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/octet-stream" })); };
      $("#bp", m).onclick = () => $("#bf", m).click();
      $("#bf", m).onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        let rows; try { rows = await readSheet(f); } catch (x) { return toast("Could not open that file: " + x.message, "err"); }
        const hi = Math.max(0, rows.findIndex(r => r.some(c => /amount/i.test(String(c))))), h = (rows[hi] || []).map(x => String(x).toLowerCase());
        const ci = { c: findCol(h, [/customer|party|name/]), i: findCol(h, [/invoice/]), d: findCol(h, [/date/]), a: findCol(h, [/amount|received/]), m: findCol(h, [/mode|method/]), r: findCol(h, [/ref|utr|cheque/]) };
        if (ci.a < 0 || (ci.c < 0 && ci.i < 0)) return toast("The file needs Amount and either Customer or Invoice no columns.", "err");
        const out = rows.slice(hi + 1).filter(r => r.some(x => String(x).trim())).map(r => ({ customer: String(ci.c >= 0 ? r[ci.c] : "").trim(), invoice_no: String(ci.i >= 0 ? r[ci.i] : "").trim(), paid_on: ci.d >= 0 ? toISO(r[ci.d]) || today() : today(), amount: toNum(r[ci.a]), mode: normMode(ci.m >= 0 ? r[ci.m] : ""), ref: String(ci.r >= 0 ? r[ci.r] : "").trim() })).filter(r => r.amount > 0);
        $("#bo", m).innerHTML = `<p><b>${out.length}</b> payments, total ${R(out.reduce((s, r) => s + r.amount, 0))}.</p><div style="max-height:240px;overflow:auto">${table([{ h: "Customer", v: r => r.customer || "–" }, { h: "Invoice", v: r => r.invoice_no || "–" }, { h: "Date", v: r => r.paid_on }, { h: "Amount", v: r => INR(r.amount) }, { h: "Mode", v: r => MODE[r.mode] }], out, { empty: "Nothing found" })}</div>
          <div class="row end" style="margin-top:8px"><button class="btn" id="bgo" ${out.length ? "" : "disabled"}>Import</button></div>`;
        $("#bgo", m).onclick = async () => {
          $("#bgo", m).disabled = true;
          const r = await run(sb.rpc("bulk_import_payments", { p_rows: out }), null);
          if (r) { toast(`${r.imported} payments imported` + (r.failed?.length ? `. Failed: ${r.failed.map(x => `row ${x.row}: ${x.error}`).join("; ")}` : ""), r.failed?.length ? "err" : undefined); close(); reload(); } else $("#bgo", m).disabled = false;
        };
      };
    },
  });

  // =================== EXPENSES ===================
  const expenses = async () => {
    const list = await get(sb.from("expenses").select("*").order("exp_date", { ascending: false }).limit(2000));
    if (SUB !== "all" && !CAT[SUB]) SUB = "all"; if (SUB === "all") SUB2 = "all";
    const payers = [...new Set(list.map(e => e.paid_by))], inMain = k => list.filter(e => k === "all" || e.category === k), inSub = k => inMain(k).filter(e => SUB2 === "all" || (e.subcategory || "Not specified") === SUB2);
    av.innerHTML = `<div class="tabs wrapt">${[["all", "All"], ...CATS].map(([k, t]) => `<button class="tab sm ${k === SUB ? "on" : ""}" data-s="${k}">${t} (${inMain(k).length})</button>`).join("")}</div>
      ${SUB !== "all" && (SUBS[SUB] || inMain(SUB).some(e => e.subcategory)) ? `<div class="tabs wrapt" id="sub2">${[["all", "All " + CAT[SUB].toLowerCase()], ...[...new Set([...(SUBS[SUB] || []), ...inMain(SUB).map(e => e.subcategory).filter(Boolean)])].map(v => [v, v]), ...(inMain(SUB).some(e => !e.subcategory) ? [["Not specified", "Not specified"]] : [])].map(([k, t]) => `<button class="tab sm ${k === SUB2 ? "on" : ""}" data-s2="${esc(k)}">${esc(t)} (${inMain(SUB).filter(e => k === "all" || (e.subcategory || "Not specified") === k).length})</button>`).join("")}</div>` : ""}
      <div class="toolbar"><button class="btn" id="sc">📷 Scan bill / photo</button><button class="btn ghost" id="ad">Add ${SUB === "all" ? "expense" : esc(CAT[SUB]).toLowerCase()}${SUB2 !== "all" ? " · " + esc(SUB2).toLowerCase() : ""}</button><button class="btn ghost" id="bx">Upload Excel</button><span class="grow"></span>
      <select id="fp"><option value="">Paid by anyone</option>${payers.map(p => `<option>${esc(p)}</option>`).join("")}</select></div><div id="ss"></div><div id="tb"></div>`;
    $$("[data-s]", av).forEach(b => b.onclick = () => { SUB = b.dataset.s; SUB2 = "all"; expenses(); });
    $$("[data-s2]", av).forEach(b => b.onclick = () => { SUB2 = b.dataset.s2; expenses(); });
    const draw = () => {
      const p = $("#fp", av).value, rows = inSub(SUB).filter(e => !p || e.paid_by === p), n = x => Number(x) || 0, tot = rows.reduce((s2, e) => s2 + n(e.amount), 0), mo = today().slice(0, 7);
      const vend = {}; rows.forEach(e => { const k = e.vendor || "(no vendor)"; vend[k] = (vend[k] || 0) + n(e.amount); });
      const st2 = {}; rows.forEach(e => { const k = e.subcategory || "Not specified"; (st2[k] ||= [0, 0]); st2[k][0] += n(e.amount); st2[k][1]++; }); const subTot = Object.entries(st2).sort((a2, b2) => b2[1][0] - a2[1][0]);
      const top = Object.entries(vend).sort((a2, b2) => b2[1] - a2[1]).slice(0, 5);
      const owed = rows.filter(e => e.paid_by.toLowerCase() !== "company" && !e.reimbursed).reduce((s2, e) => s2 + n(e.amount), 0);
      $("#ss", av).innerHTML = `<div class="stats">${stat(SUB === "all" ? "All expenses" : esc(CAT[SUB]) + (SUB2 !== "all" ? " · " + esc(SUB2) : ""), R(tot), `${rows.length} entries`)}${stat("This month", R(rows.filter(e => String(e.exp_date).startsWith(mo)).reduce((s2, e) => s2 + n(e.amount), 0)))}${stat("GST included", R(rows.reduce((s2, e) => s2 + n(e.gst_amount), 0)))}${stat("To pay back to partners", R(owed), "", owed ? "warn" : "")}</div>
        ${SUB !== "all" && SUB2 === "all" && subTot.length > 0 ? `<div class="card"><h3>${esc(CAT[SUB])} by sub-category</h3>${table([{ h: "Sub-category", v: r => r[0] }, { h: "Entries", v: r => r[1][1] }, { h: "Total", v: r => R(r[1][0]) }], subTot, { empty: "" })}</div>` : ""}
        ${top.length ? `<div class="card"><h3>Top vendors</h3>${table([{ h: "Vendor", v: r => r[0] }, { h: "Total", v: r => R(r[1]) }], top, { empty: "" })}</div>` : ""}`;
      $("#tb", av).innerHTML = table([{ h: "Date", v: e => dfmt(e.exp_date) }, { h: "Vendor", v: e => e.vendor || "–" }, { h: "Details", v: e => e.description || "" }, ...(SUB !== "all" && SUBS[SUB] ? [{ h: "Sub-category", v: e => e.subcategory || "–" }] : []), ...(SUB === "business_dev" || SUB === "marketing" ? [{ h: "For", v: e => e.prospect || "–" }] : []), ...(SUB === "all" ? [{ h: "Label", v: e => CAT[e.category] + (e.subcategory ? " · " + e.subcategory : "") }] : []),
        { h: "Amount", v: e => R(e.amount) }, { h: "Paid by", v: e => e.paid_by.toLowerCase() === "company" ? "Company" : e.paid_by + (e.reimbursed ? " (paid back)" : " (to pay back)") },
        { h: "", html: e => `${e.file_path ? `<button class="btn ghost sm vf" data-id="${e.id}">Bill</button> ` : ""}${e.paid_by.toLowerCase() !== "company" ? `<button class="btn ghost sm rb" data-id="${e.id}">${e.reimbursed ? "Undo paid back" : "Mark paid back"}</button> ` : ""}<button class="btn ghost sm ed" data-id="${e.id}">Edit</button> <button class="btn ghost sm dl" data-id="${e.id}">Delete</button>` }], rows, { empty: "Nothing here yet. Scan a bill, add one, or upload an Excel." });
      $$(".vf", av).forEach(b => b.onclick = async () => { const x = list.find(e => e.id === b.dataset.id), { data } = await sb.storage.from("expense-files").createSignedUrl(x.file_path, 300); data ? window.open(data.signedUrl, "_blank", "noopener") : toast("Could not open the file", "err"); });
      $$(".ed", av).forEach(b => b.onclick = () => openExpense(list.find(e => e.id === b.dataset.id)));
      $$(".rb", av).forEach(b => b.onclick = async () => { const x = list.find(e => e.id === b.dataset.id); if (await run(sb.rpc("set_reimbursed", { p_id: x.id, p_value: !x.reimbursed }), "Updated") !== null) reload(); });
      $$(".dl", av).forEach(b => b.onclick = async () => { if (!confirm("Delete this entry?")) return; if (await run(sb.rpc("delete_expense", { p_id: b.dataset.id }), "Deleted") !== null) reload(); });
    };
    draw(); $("#fp", av).onchange = draw;
    $("#sc", av).onclick = openScan; $("#ad", av).onclick = () => openExpense(SUB === "all" ? {} : { category: SUB, subcategory: SUB2 !== "all" && SUB2 !== "Not specified" ? SUB2 : "" }); $("#bx", av).onclick = () => openBulkExpenses(SUB === "all" ? "auto" : SUB);
  };

  // =================== OVERALL ACCOUNT ===================
  const account = async () => {
    av.innerHTML = `<div class="toolbar"><label>From <input type="date" id="df" value="${mAgo()}"></label><label>To <input type="date" id="dt" value="${today()}"></label>
      <select id="ty"><option value="">Money in and out</option><option value="in">Money in (received)</option><option value="out">Money out (expenses)</option></select>
      <select id="lb"><option value="">All labels</option>${CATS.map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select><span class="grow"></span><button class="btn ghost" id="dx">Download Excel</button></div><div id="ac"></div>`;
    let shown = [];
    const go = async () => {
      const df = $("#df", av).value, dt = $("#dt", av).value, ty = $("#ty", av).value, lb = $("#lb", av).value, ac = $("#ac", av);
      ac.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const [pays, exps, cust] = await Promise.all([get(sb.from("customer_payments").select("*").gte("paid_on", df).lte("paid_on", dt)), get(sb.from("expenses").select("*").gte("exp_date", df).lte("exp_date", dt)), get(sb.from("v_customer_balance").select("customer_id,name"))]);
        const nm = Object.fromEntries(cust.map(c => [c.customer_id, c.name])), n = x => Number(x) || 0;
        let tx = [...pays.map(p => ({ d: String(p.paid_on || ""), kind: "in", label: "Customer receipt", party: nm[p.customer_id] || "", text: `${MODE[p.mode] || p.mode || ""}${p.ref ? " · " + p.ref : ""}`, inn: n(p.amount), out: 0 })),
          ...exps.map(e => ({ d: String(e.exp_date || ""), kind: "out", label: CAT[e.category] || e.category, cat: e.category, party: e.vendor || "", text: [e.description, e.paid_by && e.paid_by.toLowerCase() !== "company" ? "paid by " + e.paid_by : ""].filter(Boolean).join(" · "), inn: 0, out: n(e.amount), by: e.paid_by }))]
          .filter(t => (!ty || t.kind === ty) && (!lb || t.cat === lb)).sort((a2, b2) => a2.d.localeCompare(b2.d));
        let bal = 0; tx.forEach(t => { bal += t.inn - t.out; t.bal = bal; });
        shown = tx.slice().reverse();
        const tin = tx.reduce((s2, t) => s2 + t.inn, 0), tout = tx.reduce((s2, t) => s2 + t.out, 0), pocket = tx.filter(t => t.kind === "out" && t.by && t.by.toLowerCase() !== "company").reduce((s2, t) => s2 + t.out, 0);
        const mon = {}; tx.forEach(t => { const k = t.d.slice(0, 7); (mon[k] ||= { inn: 0, out: 0 }); mon[k].inn += t.inn; mon[k].out += t.out; });
        const byLabel = CATS.map(([k, t]) => [t, tx.filter(x => x.cat === k).reduce((s2, x) => s2 + x.out, 0)]).filter(x => x[1] > 0);
        ac.innerHTML = `<div class="stats">${stat("Money in", R(tin), "Customer payments received", "good")}${stat("Money out", R(tout), "All expenses")}${stat("Net", R(tin - tout), "In minus out for this period", tin - tout >= 0 ? "good" : "bad")}${stat("Paid from partners' pockets", R(pocket), "Included in money out")}</div>
          <div class="card"><h3>Month by month</h3>${table([{ h: "Month", v: r => r[0] }, { h: "Received", v: r => R(r[1].inn) }, { h: "Spent", v: r => R(r[1].out) }, { h: "Net", v: r => R(r[1].inn - r[1].out) }], Object.entries(mon).sort((a2, b2) => b2[0].localeCompare(a2[0])), { empty: "No entries in this period" })}</div>
          ${byLabel.length ? `<div class="card"><h3>Spent by label</h3>${table([{ h: "Label", v: r => r[0] }, { h: "Amount", v: r => R(r[1]) }, { h: "Share", v: r => (tout ? (r[1] / tout * 100).toFixed(1) : 0) + "%" }], byLabel, { empty: "" })}</div>` : ""}
          <div class="card"><h3>All entries</h3>${table([{ h: "Date", v: t => dfmt(t.d) }, { h: "Type", v: t => t.kind === "in" ? "Received" : "Paid" }, { h: "Label", v: t => t.label }, { h: "Party", v: t => t.party || "–" }, { h: "Details", v: t => t.text }, { h: "In", v: t => t.inn ? INR(t.inn) : "" }, { h: "Out", v: t => t.out ? INR(t.out) : "" }, { h: "Running net", v: t => INR(t.bal) }], shown, { empty: "No entries in this period" })}</div>`;
      } catch (e) { ac.innerHTML = `<p class="dev">Could not load: ${esc(e.message)}</p>`; }
    };
    $$("input,select", $(".toolbar", av)).forEach(x => x.onchange = go);
    $("#dx", av).onclick = async () => {
      const X = await loadX(), ws = X.utils.aoa_to_sheet([["Date", "Type", "Label", "Party", "Details", "In", "Out", "Running net"], ...shown.slice().reverse().map(t => [t.d, t.kind === "in" ? "Received" : "Paid", t.label, t.party, t.text, t.inn || "", t.out || "", t.bal])]);
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Account"); download("earthlabs-account.xlsx", new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/octet-stream" }));
    };
    go();
  };

  // =================== ASSETS ===================
  const assets = async () => {
    const list = await get(sb.from("v_assets").select("*").order("purchase_date", { ascending: false }));
    const n = x => Number(x) || 0, sum = (a, f) => a.reduce((t, x) => t + n(f(x)), 0), live = list.filter(a => a.status === "in_use");
    const byT = ASSET_TYPES.map(([k, t]) => { const g = live.filter(a => a.asset_type === k); return [t, sum(g, a => a.qty), sum(g, a => a.cost), sum(g, a => a.book_value)]; }).filter(r => r[2] > 0 || r[1] > 0);
    av.innerHTML = `<div class="toolbar"><button class="btn" id="aa">Add asset</button><button class="btn ghost" id="ax">Upload Excel</button><span class="grow"></span><input id="q" type="search" placeholder="Search asset…"><select id="fs"><option value="in_use">In use</option><option value="sold">Sold</option><option value="scrapped">Scrapped</option><option value="">All</option></select></div>
      <div class="stats">${stat("Total investment", R(sum(list, a => a.cost)), `${list.length} assets`)}${stat("Book value (in use)", R(sum(live, a => a.book_value)), "Cost minus depreciation", "good")}${stat("Depreciation so far", R(sum(live, a => a.depreciation)))}${stat("Sold / scrapped", String(list.length - live.length))}</div>
      <div class="card"><h3>By type</h3>${table([{ h: "Type", v: r => r[0] }, { h: "Quantity", v: r => +Number(r[1]).toFixed(3) }, { h: "Cost", v: r => R(r[2]) }, { h: "Book value", v: r => R(r[3]) }], byT, { empty: "No assets yet" })}</div><div id="tb"></div>`;
    const draw = () => {
      const st = $("#fs", av).value, q = ($("#q", av).value || "").toLowerCase(), rows = list.filter(a => (!st || a.status === st) && (!q || (a.name + " " + (a.vendor || "") + " " + (a.location || "")).toLowerCase().includes(q)));
      $("#tb", av).innerHTML = table([{ h: "Asset", v: a => a.name }, { h: "Type", v: a => ATYPE[a.asset_type] }, { h: "Qty", v: a => +Number(a.qty).toFixed(3) }, { h: "Bought", v: a => dfmt(a.purchase_date) }, { h: "Vendor", v: a => a.vendor || "–" }, { h: "Cost", v: a => R(a.cost) },
        { h: "Dep. %/yr", v: a => a.dep_rate }, { h: "Book value", v: a => a.status === "in_use" ? R(a.book_value) : (a.status === "sold" ? "Sold" + (a.sale_value != null ? " " + R(a.sale_value) : "") : "Scrapped") }, { h: "Location", v: a => a.location || "–" },
        { h: "", html: a => `<button class="btn ghost sm ae" data-id="${a.id}">Edit</button> ${a.status === "in_use" ? `<button class="btn ghost sm ad" data-id="${a.id}">Sold / scrapped</button>` : `<button class="btn ghost sm au" data-id="${a.id}">Back in use</button>`} <button class="btn ghost sm ax2" data-id="${a.id}">Delete</button>` }], rows, { empty: "No assets here. Add machinery, drums or other investments." });
      $$(".ae", av).forEach(b => b.onclick = () => openAsset(list.find(a => a.id === b.dataset.id)));
      $$(".ad", av).forEach(b => b.onclick = () => openDispose(list.find(a => a.id === b.dataset.id)));
      $$(".au", av).forEach(b => b.onclick = async () => { if (await run(sb.rpc("set_asset_status", { p_id: b.dataset.id, p_status: "in_use", p_on: null, p_sale: null }), "Back in use") !== null) reload(); });
      $$(".ax2", av).forEach(b => b.onclick = async () => { const a = list.find(x => x.id === b.dataset.id); if (!confirm(`Delete "${a.name}"?${a.expense_id ? " The payment entry recorded with it is removed too." : ""}`)) return; if (await run(sb.rpc("delete_asset", { p_id: a.id }), "Deleted") !== null) reload(); });
    };
    draw(); $("#fs", av).onchange = draw; $("#q", av).oninput = draw;
    $("#aa", av).onclick = () => openAsset(); $("#ax", av).onclick = () => openBulkExpenses("asset");
  };
  const openAsset = (a = {}) => modal(a.id ? "Edit asset" : "Add asset", `<form id="asf" class="form-grid">
    <label class="full">Asset name<input name="name" required value="${esc(a.name || "")}" placeholder="e.g. Mixing tank 1000 L, HDPE drums 200 L"></label>
    <label>Type<select name="asset_type">${ASSET_TYPES.map(t => `<option value="${t[0]}" ${(a.asset_type || "machinery") === t[0] ? "selected" : ""}>${t[1]}</option>`).join("")}</select></label>
    <label>Quantity<input type="number" step="0.001" min="0.001" name="qty" required value="${a.qty ?? 1}"></label>
    <label>Purchase date<input type="date" name="purchase_date" required value="${esc(String(a.purchase_date || today()).slice(0, 10))}"></label>
    <label>Vendor<input name="vendor" value="${esc(a.vendor || "")}"></label>
    <label>Total cost paid (₹, incl. GST)<input type="number" step="0.01" min="0" name="cost" required value="${a.cost ?? ""}"></label>
    <label>of which GST (₹)<input type="number" step="0.01" min="0" name="gst_amount" value="${a.gst_amount ?? 0}"></label>
    <label>Depreciation % per year<input type="number" step="0.1" min="0" max="100" name="dep_rate" value="${a.dep_rate ?? ADEP.machinery}"></label>
    <label>Where it is kept<input name="location" value="${esc(a.location || "")}" placeholder="Plant, godown…"></label>
    ${a.id ? "" : `<label class="full row" style="gap:8px"><input type="checkbox" name="already_owned" id="own"> Already owned. Only add to the register (no payment recorded now)</label>
      <label id="pbw">Paid by<input name="paid_by" list="payers2" value="Company"><datalist id="payers2">${PAYERS.map(p => `<option>${p}</option>`).join("")}</datalist></label>
      <label id="pmw">Payment mode<select name="payment_mode">${MODES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`}
    <label class="full">Notes<input name="notes" value="${esc(a.notes || "")}"></label>
    <div class="full row end"><button class="btn" id="ass">Save asset</button></div></form>`, {
    onMount: (m, close) => {
      const ty = $("[name=asset_type]", m), dr = $("[name=dep_rate]", m), own = $("#own", m);
      if (!a.id) ty.onchange = () => { dr.value = ADEP[ty.value] ?? 0; };
      if (own) own.onchange = () => { $("#pbw", m).style.display = $("#pmw", m).style.display = own.checked ? "none" : ""; };
      $("#asf", m).onsubmit = async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target)); f.already_owned = !!f.already_owned;
        $("#ass", m).disabled = true;
        const r = await run(sb.rpc("save_asset", { p: { ...f, id: a.id || null } }), "Asset saved");
        $("#ass", m).disabled = false;
        if (r) { close(); reload(); }
      };
    },
  });
  const openDispose = a => modal("Sold or scrapped: " + a.name, `<form id="df2" class="form-grid"><label>What happened<select name="st"><option value="sold">Sold</option><option value="scrapped">Scrapped / written off</option></select></label>
    <label>Date<input type="date" name="on" value="${today()}" required></label><label>Sale value (₹, if sold)<input type="number" step="0.01" min="0" name="sale"></label>
    <div class="full row end"><button class="btn" id="dsv">Save</button></div></form>`, {
    onMount: (m, close) => { $("#df2", m).onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const r = await run(sb.rpc("set_asset_status", { p_id: a.id, p_status: f.st, p_on: f.on, p_sale: f.st === "sold" && f.sale !== "" ? Number(f.sale) : null }), "Updated"); if (r !== null) { close(); reload(); } }; },
  });

  // =================== EARLIER RECORDS ===================
  const openEarlierSale = async () => {
    let custs = []; try { custs = await get(sb.from("customers").select("id,name").order("name")); } catch (e) { return toast(e.message, "err"); }
    modal("Add an earlier sale", `<form id="esf" class="form-grid">
      <div class="notice full">A sale made before the system. It counts in sales, the party ledger and profit. It does <b>not</b> change stock.</div>
      <div class="full card" style="margin:0"><b>Have the invoice or purchase order?</b> <span class="muted small">Upload a photo or PDF and the details are filled in for you. The document is kept, so you can look at it when the customer orders again.</span>
        <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap"><button type="button" class="btn ghost" id="edpick">Choose photo / PDF</button><button type="button" class="btn ghost" id="edcam">Take photo</button></div>
        <input id="edf" type="file" accept="application/pdf,image/*" hidden><input id="edc" type="file" accept="image/*" capture="environment" hidden><p id="edst" class="muted small" style="margin:6px 0 0"></p><div id="edl" class="small"></div></div>
      <label>Date of sale<input type="date" name="sale_date" required value="${today()}"></label>
      <label>Type${sel("kind", [["company", "Company"], ["local", "Local"]], "company")}</label>
      <label class="full">Customer (pick, or type a new name)<input name="customer_name" list="escl" required placeholder="Customer name"><datalist id="escl">${custs.map(c => `<option value="${esc(c.name)}">`).join("")}</datalist></label>
      <label class="full">What was sold<input name="product" required placeholder="e.g. Herbal Hand Wash 500 mL"></label>
      <label>Quantity<input type="number" step="0.001" min="0" name="qty"></label><label>Unit<input name="unit" placeholder="bottles, sachets, L"></label>
      <label>Rate per unit (₹)<input type="number" step="0.01" min="0" name="rate"></label>
      <label>Sale amount before GST (₹)<input type="number" step="0.01" min="0.01" name="amount" required></label>
      <label>GST charged (₹, if any)<input type="number" step="0.01" min="0" name="gst_amount" value="0"></label>
      <label>Amount already received (₹)<input type="number" step="0.01" min="0" name="received" value="0"></label>
      <label>Received by${sel("mode", MODES, "cash")}</label>
      <label>Cost of goods (₹, only if you know it)<input type="number" step="0.01" min="0" name="cogs" value="0"></label>
      <label class="full">Notes<input name="notes"></label>
      <div class="full row end"><button class="btn" id="ess">Save earlier sale</button></div></form>`, {
      onMount: (m, close) => {
        let doc = { file_path: "", lines: null, doc_no: "", gstin: "", address: "" };
        const setv = (n, v) => { const el2 = $("[name=" + n + "]", m); if (el2 && v !== undefined && v !== null && v !== "") el2.value = v; };
        const stat2 = t => { $("#edst", m).textContent = t; };
        const onDoc = async file => {
          if (!file) return;
          if (file.size > 25 * 1024 * 1024) return toast("File is too large (max 25 MB)", "err");
          ["edpick", "edcam"].forEach(i => $("#" + i, m).disabled = true); stat2("Uploading…");
          const up = await compress(file), ext = (up.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, ""), path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
          const { error: ue } = await sb.storage.from("expense-files").upload(path, up, { contentType: up.type || undefined });
          if (ue) { stat2(""); ["edpick", "edcam"].forEach(i => $("#" + i, m).disabled = false); return toast("Upload failed: " + ue.message, "err"); }
          doc.file_path = path; stat2("Reading the document… about 10–20 seconds.");
          const { data } = await sb.functions.invoke("read-earlier-sale", { body: { path } });
          ["edpick", "edcam"].forEach(i => $("#" + i, m).disabled = false); const ex = data?.extracted;
          if (!ex) { stat2("The document is attached. " + (data?.error === "not_configured" ? "Automatic reading isn't switched on, so type the details." : "Could not read it" + (data?.message ? ": " + data.message : "") + ". Type the details.")); return; }
          const L = (ex.lines || []).filter(l => l && l.description); doc.lines = L; doc.doc_no = ex.doc_no || ""; doc.gstin = ex.customer_gstin || ""; doc.address = ex.customer_address || "";
          setv("customer_name", ex.customer_name); setv("sale_date", ex.doc_date);
          setv("product", L.length ? (L.length > 2 ? L.slice(0, 2).map(l => l.description).join(", ") + ` +${L.length - 2} more` : L.map(l => l.description).join(", ")) : "");
          const sub = ex.subtotal ?? (ex.total != null ? Number(ex.total) - Number(ex.gst_amount || 0) : null);
          if (L.length === 1) { setv("qty", L[0].qty); setv("unit", L[0].unit); setv("rate", L[0].rate); }
          setv("amount", sub != null ? Number(sub).toFixed(2) : ""); setv("gst_amount", ex.gst_amount ?? 0);
          if (ex.amount_received) { setv("received", ex.amount_received); setv("mode", ex.payment_mode); }
          $("#edl", m).innerHTML = L.length ? `<table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${L.map(l => `<tr><td>${esc(l.description)}</td><td>${l.qty ?? ""} ${esc(l.unit || "")}</td><td>${l.rate ?? ""}</td><td>${l.amount ?? ""}</td></tr>`).join("")}</tbody></table>` : "";
          stat2(`Read ${ex.doc_type ? ex.doc_type.replace("_", " ") : "document"}${ex.doc_no ? " " + ex.doc_no : ""}. Please check the details, then save.`);
        };
        $("#edpick", m).onclick = () => $("#edf", m).click(); $("#edcam", m).onclick = () => $("#edc", m).click();
        $("#edf", m).onchange = e => onDoc(e.target.files[0]); $("#edc", m).onchange = e => onDoc(e.target.files[0]);
        const q = $("[name=qty]", m), rt = $("[name=rate]", m), am = $("[name=amount]", m), calc = () => { if (q.value && rt.value) am.value = (Number(q.value) * Number(rt.value)).toFixed(2); };
        q.oninput = calc; rt.oninput = calc;
        $("#esf", m).onsubmit = async e => {
          e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), hit = custs.find(c => c.name.toLowerCase() === String(f.customer_name).trim().toLowerCase());
          $("#ess", m).disabled = true;
          const r = await run(sb.rpc("save_earlier_sale", { p: { ...f, customer_id: hit ? hit.id : null, file_path: doc.file_path || null, lines: doc.lines, doc_no: doc.doc_no || null, gstin: doc.gstin || null, address: doc.address || null } }), "Earlier sale saved");
          $("#ess", m).disabled = false; if (r) { close(); reload(); }
        };
      },
    });
  };
  const openEarlierProduction = async () => {
    let prods = []; try { prods = await get(sb.from("products").select("id,name,variant").order("name")); } catch (e) { return toast(e.message, "err"); }
    const lineRow = (t = "bottle", sz = "", f = "", sd = "") => `<div class="row epl" style="gap:6px;margin-bottom:6px;flex-wrap:wrap">${sel("pt", [["bottle", "Bottle"], ["sachet", "Sachet"], ["can", "Can / jar"]], t)}<input name="sz" type="number" step="0.1" min="0.1" placeholder="Size (mL)" value="${sz}" style="width:110px"><input name="fl" type="number" min="1" placeholder="Filled (nos)" value="${f}" style="width:120px"><input name="sd" type="number" min="0" placeholder="Already sold (nos)" value="${sd}" style="width:150px"><button type="button" class="btn ghost sm rml">✕</button></div>`;
    modal("Add earlier production", `<form id="epf" class="form-grid">
      <div class="notice full">Filled before the system. It counts in production totals. It does <b>not</b> use any raw material or packaging from current stock. Units you have already sold are taken off; the rest shows in Finished Goods Inventory.</div>
      <label>Date made<input type="date" name="d" required value="${today()}"></label>
      <label>Product<select name="p" required>${prods.map(p => `<option value="${p.id}">${esc(p.name)}${p.variant ? " · " + esc(p.variant) : ""}</option>`).join("")}</select></label>
      <div class="full"><div class="muted small" style="margin-bottom:4px">What was filled (add a line for each pack size)</div><div id="epl">${lineRow("bottle", 500)}${lineRow("sachet", 10)}</div><button type="button" class="btn ghost sm" id="epa">+ Add pack line</button><div id="ept" class="muted small" style="margin-top:6px"></div></div>
      <label class="full">Notes<input name="note" placeholder="e.g. trial batch for first customers"></label>
      <div class="full row end"><button class="btn" id="eps">Save earlier production</button></div></form>`, {
      onMount: (m, close) => {
        const rows = () => $$(".epl", m).map(r => ({ pack_type: $("[name=pt]", r).value, size_ml: Number($("[name=sz]", r).value), filled: Number($("[name=fl]", r).value), sold: Number($("[name=sd]", r).value) || 0 })).filter(x => x.filled > 0 || x.size_ml > 0);
        const upd = () => { const l = rows(), lit = l.reduce((s, x) => s + x.filled * x.size_ml / 1000, 0), sold = l.reduce((s, x) => s + x.sold, 0), tot = l.reduce((s, x) => s + x.filled, 0); $("#ept", m).textContent = l.length ? `Total ${lit.toFixed(1)} L filled · ${tot} units · ${sold} sold · ${tot - sold} in stock` : ""; };
        const wire = () => { $$(".epl", m).forEach(r => { $$("input", r).forEach(i => i.oninput = upd); $(".rml", r).onclick = () => { r.remove(); upd(); }; }); };
        $("#epa", m).onclick = () => { $("#epl", m).insertAdjacentHTML("beforeend", lineRow()); wire(); };
        wire(); upd();
        $("#epf", m).onsubmit = async e => {
          e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), l = rows();
          if (!l.length) return toast("Add at least one pack line", "err");
          $("#eps", m).disabled = true;
          const r = await run(sb.rpc("add_earlier_production", { p_product: f.p, p_date: f.d, p_lines: l, p_note: f.note || null }), "Earlier production saved");
          $("#eps", m).disabled = false; if (r) { close(); reload(); }
        };
      },
    });
  };
  const earlier = async () => {
    const [es, pb, ex] = await Promise.all([get(sb.from("earlier_sales").select("*, customers(name)").order("sale_date", { ascending: false })),
      get(sb.from("batches").select("id,batch_code,mfg_date,batch_size_l,observations,products(name,variant),filling_lines(pack_type,size_ml,filled,pre_sold)").like("batch_code", "PRE-%").order("mfg_date", { ascending: false })),
      get(sb.from("expenses").select("*").like("notes", "Before the system%").order("exp_date", { ascending: false }))]);
    const n = x => Number(x) || 0, sum = (a, f) => a.reduce((s2, x) => s2 + n(f(x)), 0);
    av.innerHTML = `<div class="notice">Use this page for things that happened <b>before you started using the system</b>. They show in your accounts and totals, but never change today's stock.</div>
      <div class="card"><div class="toolbar"><h3 style="margin:0">Earlier sales</h3><span class="grow"></span><button class="btn" id="aes">Add earlier sale</button></div>
        <div class="stats">${stat("Sales (before GST)", R(sum(es, e => e.amount)))}${stat("Received", R(sum(es, e => e.received)), "", "good")}${stat("Still to receive", R(sum(es, e => e.total - e.received)), "", sum(es, e => e.total - e.received) > 0.005 ? "warn" : "")}</div>
        ${table([{ h: "Date", v: e => dfmt(e.sale_date) }, { h: "Customer", v: e => e.customers?.name || "" }, { h: "Type", v: e => e.kind === "local" ? "Local" : "Company" }, { h: "Sold", v: e => e.product + (e.qty ? ` · ${n(e.qty)} ${e.unit || ""}` : "") },
          { h: "Total", v: e => R(e.total) }, { h: "Received", v: e => R(e.received) }, { h: "", html: e => `${e.file_path || (e.lines || []).length ? `<button class="btn ghost sm esv" data-id="${e.id}">Details</button> ` : ""}<button class="btn ghost sm esd" data-id="${e.id}">Delete</button>` }], es, { empty: "No earlier sales added yet." })}</div>
      <div class="card"><div class="toolbar"><h3 style="margin:0">Earlier production</h3><span class="grow"></span><button class="btn" id="aep">Add earlier production</button></div>
        ${table([{ h: "Date", v: b => dfmt(b.mfg_date) }, { h: "Reference", v: b => b.batch_code }, { h: "Product", v: b => (b.products?.name || "") + (b.products?.variant ? " · " + b.products.variant : "") }, { h: "Litres", v: b => n(b.batch_size_l).toFixed(1) + " L" },
          { h: "Filled", v: b => (b.filling_lines || []).map(l => `${n(l.filled)} × ${l.size_ml} mL ${l.pack_type}`).join(", ") }, { h: "Sold", v: b => sum(b.filling_lines || [], l => l.pre_sold) }, { h: "In stock", v: b => sum(b.filling_lines || [], l => l.filled - l.pre_sold) }], pb, { empty: "No earlier production added yet." })}</div>
      <div class="card"><div class="toolbar"><h3 style="margin:0">Earlier purchases (bought before the company was set up)</h3><span class="grow"></span><button class="btn" id="asc">📷 Scan bill</button><button class="btn ghost" id="aex">Add earlier purchase</button></div>
        <p class="muted small">Counts in what you have spent. Does not add to raw material stock, so current stock stays as it is.</p>
        ${table([{ h: "Date", v: e => dfmt(e.exp_date) }, { h: "Label", v: e => CAT[e.category] || e.category }, { h: "Paid to", v: e => e.vendor || "" }, { h: "Details", v: e => e.description || "" }, { h: "Amount", v: e => R(e.amount) }, { h: "Paid by", v: e => e.paid_by }], ex, { empty: "No earlier purchases added yet." })}
        <p class="muted small">To fix or remove one, open it in the Expenses tab.</p></div>`;
    $("#aes", av).onclick = openEarlierSale; $("#aep", av).onclick = openEarlierProduction;
    $("#aex", av).onclick = () => openExpense({ notes: EARLY_NOTE }, { note: "Bought before the system. This is for your accounts only and does <b>not</b> add to stock." }); $("#asc", av).onclick = () => openScan({ earlier: true });
    $$(".esv", av).forEach(b => b.onclick = () => { const e = es.find(x => x.id === b.dataset.id); modal("Earlier sale · " + (e.customers?.name || ""), `<p>${dfmt(e.sale_date)} · ${e.doc_no ? "Document " + esc(e.doc_no) + " · " : ""}${R(e.total)}</p>${(e.lines || []).length ? `<table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${e.lines.map(l => `<tr><td>${esc(l.description)}</td><td>${l.qty ?? ""} ${esc(l.unit || "")}</td><td>${l.rate ?? ""}</td><td>${l.amount ?? ""}</td></tr>`).join("")}</tbody></table>` : ""}${e.file_path ? `<div class="row end" style="margin-top:8px"><button class="btn" id="edv">Open the document</button></div>` : ""}`, { onMount: m => { const v = $("#edv", m); if (v) v.onclick = async () => { const { data } = await sb.storage.from("expense-files").createSignedUrl(e.file_path, 300); data ? window.open(data.signedUrl, "_blank", "noopener") : toast("Could not open the document", "err"); }; } }); });
    $$(".esd", av).forEach(b => b.onclick = async () => { if (!confirm("Delete this earlier sale and the payment recorded with it?")) return; if (await run(sb.rpc("delete_earlier_sale", { p_id: b.dataset.id }), "Deleted") !== null) reload(); });
  };

  // =================== BANK ===================
  const bank = async () => {
    const [txns, ib, cb] = await Promise.all([get(sb.from("bank_txns").select("*").order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(1500)), get(sb.from("v_invoice_balance").select("*")), get(sb.from("v_customer_balance").select("customer_id,name"))]);
    const cnt = s => txns.filter(t => t.status === s).length;
    av.innerHTML = `<div class="toolbar"><button class="btn" id="up">Upload bank statement</button><button class="btn ghost" id="am">Match again</button><span class="grow"></span><select id="fs"><option value="unmatched">To match (${cnt("unmatched")})</option><option value="matched">Matched (${cnt("matched")})</option><option value="ignored">Ignored (${cnt("ignored")})</option><option value="">All</option></select></div>
      <p class="muted small">Money received is matched to customer invoices; money paid out is matched to expenses. Anything not matched automatically is one click away.</p><input id="bf" type="file" accept=".xlsx,.xls,.csv" hidden><div id="tb"></div>`;
    const suggest = t => {
      if (t.credit > 0) {
        const hits = ib.filter(i => Math.abs(Number(i.balance) - t.credit) < 0.01 && Number(i.balance) > 0);
        const byName = hits.filter(i => (t.description || "").toLowerCase().includes(String(i.customer).toLowerCase().split(" ")[0]));
        const pick = byName.length === 1 ? byName[0] : hits.length === 1 ? hits[0] : null;
        return pick ? `<button class="btn sm ac" data-id="${t.id}" data-inv="${pick.id}">Match ${esc(pick.invoice_no)} · ${esc(pick.customer)}</button> ` : "";
      }
      return "";
    };
    const draw = () => {
      const s = $("#fs", av).value, rows = txns.filter(t => !s || t.status === s);
      $("#tb", av).innerHTML = table([{ h: "Date", v: t => dfmt(t.txn_date) }, { h: "Details", v: t => (t.description || "") + (t.ref ? " · " + t.ref : "") }, { h: "Paid out", v: t => t.debit > 0 ? INR(t.debit) : "" }, { h: "Received", v: t => t.credit > 0 ? INR(t.credit) : "" },
        { h: "Status", v: t => t.status === "matched" ? "Matched · " + (t.match_kind === "payment" ? "payment" : "expense") : t.status === "ignored" ? "Ignored" : "To match" },
        { h: "", html: t => t.status === "unmatched" ? `${suggest(t)}${t.credit > 0 ? `<button class="btn ghost sm mp" data-id="${t.id}">Customer payment</button> ` : `<button class="btn ghost sm me" data-id="${t.id}">Add as expense</button> `}<button class="btn ghost sm ig" data-id="${t.id}">Ignore</button>` : t.status === "ignored" ? `<button class="btn ghost sm ig" data-id="${t.id}" data-un="1">Undo</button>` : "" }], rows, { empty: "Nothing here. Upload a statement." });
      const tx = id => txns.find(t => t.id === id);
      $$(".ac", av).forEach(b => b.onclick = async () => { const t = tx(b.dataset.id), i = ib.find(x => x.id === b.dataset.inv); if (await run(sb.rpc("record_payment", { p: { customer_id: i.customer_id, invoice_id: i.id, amount: t.credit, paid_on: t.txn_date, mode: "bank", ref: t.ref || (t.description || "").slice(0, 60), bank_txn_id: t.id } }), "Matched and recorded") !== null) reload(); });
      $$(".mp", av).forEach(b => b.onclick = () => { const t = tx(b.dataset.id); pickCustomer(t); });
      $$(".me", av).forEach(b => b.onclick = () => { const t = tx(b.dataset.id); openExpense({ exp_date: t.txn_date, amount: t.debit, description: t.description || "", source: "bank", payment_mode: "bank" }, { bank_txn_id: t.id, note: "From the bank statement. Choose the label and save." }); });
      $$(".ig", av).forEach(b => b.onclick = async () => { if (await run(sb.rpc("set_bank_txn_ignored", { p_id: b.dataset.id, p_ignored: !b.dataset.un }), null) !== null) reload(); });
    };
    const pickCustomer = t => modal("Which customer paid " + R(t.credit) + "?", `<p class="muted small">${esc(t.description || "")}</p><label>Customer<select id="pc">${cb.map(c => `<option value="${c.customer_id}">${esc(c.name)}</option>`).join("")}</select></label><div class="row end" style="margin-top:8px"><button class="btn" id="pg">Continue</button></div>`, {
      onMount: (m, close) => { $("#pg", m).onclick = () => { const c = cb.find(x => x.customer_id === $("#pc", m).value); close(); openPayment({ id: c.customer_id, name: c.name }, ib.filter(i => i.customer_id === c.customer_id), { amount: t.credit, paid_on: t.txn_date, mode: "bank", ref: t.ref || "" }, { bank_txn_id: t.id, note: "From the bank statement" }); }; },
    });
    draw(); $("#fs", av).onchange = draw;
    $("#up", av).onclick = () => $("#bf", av).click();
    $("#am", av).onclick = async () => { const r = await run(sb.rpc("auto_match_bank"), null); if (r) { toast(`Matched ${r.payments} payments and ${r.expenses} expenses`); reload(); } };
    $("#bf", av).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      let p; try { p = parseBankRows(await readSheet(f)); } catch (x) { return toast("Could not open that file: " + x.message, "err"); }
      if (p.error) return toast(p.error, "err");
      modal("Bank statement", `<p><b>${p.out.length}</b> transactions found (${p.out[p.out.length - 1].date} to ${p.out[0].date}). Money in ${R(p.out.reduce((s, r) => s + r.credit, 0))} · money out ${R(p.out.reduce((s, r) => s + r.debit, 0))}.</p><p class="muted small">Rows already imported before are skipped automatically.</p><div class="row end"><button class="btn" id="go">Import and match</button></div>`, {
        onMount: (m, close) => {
          $("#go", m).onclick = async () => {
            $("#go", m).disabled = true; let added = 0, dup = 0;
            for (let i = 0; i < p.out.length; i += 400) {
              const r = await run(sb.rpc("import_bank_txns", { p_name: f.name, p_rows: p.out.slice(i, i + 400) }), null);
              if (!r) { $("#go", m).disabled = false; return; } added += r.added; dup += r.duplicates;
            }
            const am = await run(sb.rpc("auto_match_bank"), null);
            toast(`${added} added${dup ? `, ${dup} already there` : ""}. Auto-matched ${am ? am.payments + am.expenses : 0}.`); close(); reload();
          };
        },
      });
    };
  };

  // =================== PROFITABILITY ===================
  const profit = async () => {
    av.innerHTML = `<div class="toolbar"><label>From <input type="date" id="df" value="${mAgo()}"></label><label>To <input type="date" id="dt" value="${today()}"></label><select id="by"><option value="order">By order</option><option value="delivery">By delivery (challan)</option><option value="customer">By customer</option><option value="site">By site / plant</option></select></div><div id="pv"></div>`;
    const go = async () => {
      const df = $("#df", av).value, dt = $("#dt", av).value, by = $("#by", av).value, pv = $("#pv", av);
      pv.innerHTML = '<p class="muted">Calculating…</p>';
      try {
        const [lines, exps] = await Promise.all([get(sb.from("v_sale_lines").select("*").gte("dc_date", df).lte("dc_date", dt)), get(sb.from("expenses").select("*").gte("exp_date", df).lte("exp_date", dt))]);
        const oids = [...new Set(lines.map(l => l.order_id))];
        const det = oids.length ? ((await sb.rpc("order_cost_detail", { p_orders: oids })).data || []) : [];
        const detBy = {}; det.forEach(d => (detBy[d.order_id] ||= []).push(d));
        const n = x => Number(x) || 0, dcOrder = {}; lines.forEach(l => { dcOrder[l.challan_id] = l.order_id; });
        const ops = exps.filter(e => e.category !== "raw_material" && e.category !== "packaging" && e.category !== "asset");
        const dep = Number((await sb.rpc("asset_dep_between", { p_from: df, p_to: dt })).data) || 0;
        const rev = lines.reduce((s, l) => s + n(l.revenue), 0), cogs = lines.reduce((s, l) => s + n(l.cogs), 0), opx = ops.reduce((s, e) => s + n(e.amount) - n(e.gst_amount), 0);
        const keyOf = { order: l => l.order_id, delivery: l => l.challan_id, customer: l => l.customer_id, site: l => l.facility_id || "none" }[by];
        const nameOf = { order: l => `${l.order_no} · ${l.customer}`, delivery: l => `${l.dc_no}${l.invoice_no ? " / " + l.invoice_no : ""} · ${l.customer}`, customer: l => l.customer, site: l => l.facility }[by];
        const g = {};
        lines.forEach(l => { const k = keyOf(l); (g[k] ||= { key: k, name: nameOf(l), rev: 0, cogs: 0, exp: 0, oids: new Set() }); g[k].oids.add(l.order_id); g[k].rev += n(l.revenue); g[k].cogs += n(l.cogs); });
        const ordCust = {}; lines.forEach(l => { ordCust[l.order_id] = l.customer_id; });
        let linked = 0;
        ops.forEach(e => {
          const oid = e.order_id || dcOrder[e.challan_id], k = by === "delivery" ? e.challan_id : by === "order" ? oid : by === "customer" ? ordCust[oid] : null;
          if (k && g[k]) { g[k].exp += n(e.amount) - n(e.gst_amount); linked += n(e.amount) - n(e.gst_amount); }
        });
        const rows = Object.values(g).map(r => { const it = [...r.oids].flatMap(o => detBy[o] || []); return { ...r, gp: r.rev - r.cogs, np: r.rev - r.cogs - r.exp, miss: it.filter(i => i.basis === "missing"), est: it.filter(i => i.basis === "estimate") }; }).sort((a, b) => b.np - a.np);
        const allIt = det, missAll = [...new Set(allIt.filter(i => i.basis === "missing").map(i => i.item))], estAll = [...new Set(allIt.filter(i => i.basis === "estimate").map(i => i.item))];
        pv.innerHTML = `<div class="stats">${stat("Sales (before GST)", R(rev))}${stat("Material & packing cost", R(cogs), "Batch materials + packaging at last purchase rates")}${stat("Gross profit", R(rev - cogs), rev ? ((rev - cogs) / rev * 100).toFixed(1) + "% margin" : "", rev - cogs >= 0 ? "good" : "bad")}
          ${stat("Operating expenses (before GST)", R(opx), "Marketing, transport, utilities, salary, rent, other")}${stat("Depreciation on assets", R(dep), "Machinery, drums etc. spread over their life")}${stat("Net profit", R(rev - cogs - opx - dep), "After expenses and depreciation", rev - cogs - opx - dep >= 0 ? "good" : "bad")}</div>
          ${missAll.length ? `<div class="notice">⚠ Cost is incomplete: no rate yet for <b>${missAll.map(esc).join(", ")}</b>. Profit below is overstated until you upload their bills or open an order's <b>Cost details</b> and enter an estimated rate.</div>` : ""}${estAll.length ? `<div class="notice">≈ Includes your estimated rates for ${estAll.map(esc).join(", ")}. They are replaced automatically once a purchase bill is added.</div>` : ""}
          ${!lines.length ? '<div class="notice">No deliveries in this period yet. Profit is counted when a challan is issued.</div>' : ""}
          <div class="card"><h3>${{ order: "Profit by order", delivery: "Profit by delivery", customer: "Profit by customer", site: "Profit by site / plant" }[by]}</h3>
          ${table([{ h: by === "site" ? "Site" : by === "customer" ? "Customer" : by === "order" ? "Order" : "Delivery", v: r => r.name }, { h: "Sales", v: r => R(r.rev) }, { h: "Material & pack cost", v: r => R(r.cogs) }, { h: "Gross profit", v: r => R(r.gp) }, ...(by === "site" ? [] : [{ h: "Linked expenses", v: r => R(r.exp) }, { h: "Profit after expenses", v: r => R(r.np) }, { h: "Margin", v: r => r.rev ? (r.np / r.rev * 100).toFixed(1) + "%" : "–" }]), ...(by === "order" || by === "customer" ? [{ h: "Cost check", html: r => r.miss.length ? `<span class="dev">⚠ ${r.miss.length} rate${r.miss.length > 1 ? "s" : ""} missing</span>` : r.est.length ? "≈ Estimated" : "✓ Complete" }] : []), ...(by === "order" ? [{ h: "", html: r => `<button class="btn ghost sm ocd" data-k="${esc(String(r.key))}">Cost details</button>` }] : [])], rows, { empty: "Nothing to show" })}
          ${by === "site" ? '<p class="muted small">Site means the plant / facility where the delivered batch was made. Expenses are not split by site; see the overall net profit above.</p>' : `<p class="muted small">Linked expenses are those you tagged to an order or delivery. Other operating expenses (${R(opx - linked)}) are overheads, counted in the overall net profit only.</p>`}</div>`;
        const openCost = r => {
          const items = [...r.oids].flatMap(o => detBy[o] || []), ex = ops.filter(e => r.oids.has(e.order_id || dcOrder[e.challan_id]));
          const bas = { bill: "Purchase bill", estimate: "Your estimate", missing: "No rate yet" }, q3 = v => (+v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
          const sec = (title, arr) => arr.length ? `<h4>${title}</h4><table><thead><tr><th>Item</th><th>Used</th><th>Rate (₹ per unit)</th><th>Cost</th><th>Source</th></tr></thead><tbody>${arr.map(i => `<tr><td>${esc(i.item)}</td><td>${q3(i.qty)} ${esc(i.unit)}</td><td>${i.basis === "bill" ? R(i.rate) : `<input type="number" step="0.01" min="0" class="er" data-id="${i.rm_id}" data-o="${i.basis === "estimate" ? i.rate : ""}" value="${i.basis === "estimate" ? i.rate : ""}" placeholder="₹ per ${esc(i.unit)}" style="width:100px">`}</td><td>${R(i.cost)}</td><td>${bas[i.basis]}</td></tr>`).join("")}</tbody></table>` : "";
          const mc = items.filter(i => i.kind === "material").reduce((s, i) => s + n(i.cost), 0), pc = items.filter(i => i.kind === "packing").reduce((s, i) => s + n(i.cost), 0), xe = ex.reduce((s, e) => s + n(e.amount) - n(e.gst_amount), 0);
          const prof = r.rev - mc - pc - xe;
          modal("Cost details · " + r.name, `<div class="stats">${stat("Sales (before GST)", R(r.rev))}${stat("Material cost", R(mc))}${stat("Packing cost", R(pc))}${stat("Linked expenses", R(xe))}${stat("Profit", R(prof), r.rev ? (prof / r.rev * 100).toFixed(1) + "% margin" : "", prof >= 0 ? "good" : "bad")}</div>
            ${r.miss.length ? `<div class="notice">⚠ ${r.miss.length} item(s) have no rate, so their cost shows ₹0. Type an estimated rate below (use 0 for water), or upload the supplier bill.</div>` : ""}
            ${sec("Raw materials", items.filter(i => i.kind === "material"))}${sec("Packing", items.filter(i => i.kind === "packing"))}
            ${ex.length ? `<h4>Expenses tagged to this order</h4><table><thead><tr><th>Date</th><th>Label</th><th>Details</th><th>Amount</th></tr></thead><tbody>${ex.map(e => `<tr><td>${dfmt(e.exp_date)}</td><td>${esc(CAT[e.category] || e.category)}</td><td>${esc(e.description || "")}</td><td>${R(n(e.amount) - n(e.gst_amount))}</td></tr>`).join("")}</tbody></table>` : '<p class="muted small">No expenses are tagged to this order. Tag lunches, samples or travel to an order from the Expenses tab to include them here.</p>'}
            <div class="row end" style="gap:8px;margin-top:12px"><button class="btn" id="saveEst">Save estimated rates</button></div>`, { onMount: (m, close) => {
          $("#saveEst", m).onclick = async () => {
            const ch = $$(".er", m).filter(i => i.value !== i.dataset.o); if (!ch.length) { toast("No changes to save"); return; }
            for (const i of ch) { const ok = await run(sb.rpc("set_est_rate", { p_rm: i.dataset.id, p_rate: i.value === "" ? null : Number(i.value) })); if (ok == null) return; }
            toast("Rates saved"); close(); go();
          };
        } });
        };
        $$(".ocd", pv).forEach(b => b.onclick = () => openCost(rows.find(x => String(x.key) === b.dataset.k)));
      } catch (e) { pv.innerHTML = `<p class="dev">Could not calculate: ${esc(e.message)}</p>`; }
    };
    $$("input,select", $(".toolbar", av)).forEach(x => x.onchange = go); go();
  };

  try { await ({ overview, account, ledger, expenses, assets, earlier, bank, profit }[TAB])(); } catch (e) { fail(e); }
}
