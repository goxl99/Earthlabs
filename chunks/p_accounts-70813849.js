import{a as sb,e as esc,f as $,g as $$,h as num,i as dfmt,m as hasRole,o as toast,p as run,q as modal,s as table}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

const INR = n => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const R = n => "₹" + INR(n);
const CATS = [["raw_material", "Raw material"], ["packaging", "Packaging"], ["marketing", "Marketing"], ["transport", "Transport"], ["utilities", "Utilities"], ["salary", "Salary"], ["rent", "Rent"], ["other", "Other"]];
const CAT = Object.fromEntries(CATS);
const MODES = [["bank", "Bank transfer"], ["upi", "UPI"], ["cash", "Cash"], ["cheque", "Cheque"], ["other", "Other"]];
const MODE = Object.fromEntries(MODES);
const PAYERS = ["Company", "Gaurang", "Viraj"];
let TAB = "overview", SUB = "all";
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
  const c = { date: findCol(h, [/^date/, /date/]), vendor: findCol(h, [/vendor|party|payee|supplier|paid to|name/]), desc: findCol(h, [/desc|particular|narration|detail|item|material/]), cat: findCol(h, [/categ|type|head|label/]),
    amt: findCol(h, [/^amount/, /amount|total|value|\brs\b|₹/]), gst: findCol(h, [/gst|tax/]), by: findCol(h, [/paid by|by whom|payer|paid_by|\bby\b/]), mode: findCol(h, [/mode|method/]), notes: findCol(h, [/note|remark/]),
    qty: findCol(h, [/qty|quantity/]), rate: findCol(h, [/rate|price/]), unit: findCol(h, [/^unit|uom/]) };
  const start = hasHdr ? hi + 1 : 0;
  // no usable headings: work out the columns from what is inside them
  if (!hasHdr || c.date < 0 || c.amt < 0) {
    const sample = rows.slice(start).filter(filled).slice(0, 15), nc = Math.max(0, ...sample.map(r => r.length));
    const share = (j, f) => { const v = sample.map(r => r[j]).filter(x => String(x ?? "").trim() !== ""); return v.length ? v.filter(f).length / v.length : 0; };
    if (c.date < 0) c.date = [...Array(nc).keys()].find(j => share(j, x => !!toISO(x)) >= 0.6) ?? -1;
    const known = new Set([c.qty, c.rate, c.unit, c.gst, c.cat, c.by, c.mode, c.notes].filter(j => j >= 0)), qr = c.qty >= 0 && c.rate >= 0;
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
    const unit = String(g("unit") || "").trim(), base = String(g("desc") || "").trim();
    const err = !date ? "Date not understood" : !(amount > 0) ? "Amount missing" : "";
    out.push({ line: ri + 1, err, row: { exp_date: date, vendor: String(g("vendor") || "").trim(), description: base + (qty > 0 ? `${base ? " " : ""}(${+qty.toFixed(3)}${unit ? " " + unit : ""})` : ""),
      category: force && force !== "auto" ? force : normCat(g("cat") || g("desc") || g("vendor")), amount, gst_amount: gst, paid_by: by || "Company", payment_mode: normMode(g("mode")), notes: String(g("notes") || "").trim() } });
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
  const tabs = [["overview", "Overview"], ["account", "Overall account"], ["ledger", "Party ledger"], ["expenses", "Expenses"], ["bank", "Bank statement"], ["profit", "Profitability"]];
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
      <label>Category (label)${sel("category", CATS, x.category || "other")}</label>
      <label>Vendor / paid to<input name="vendor" value="${esc(x.vendor || "")}"></label>
      <label>Amount paid (₹, incl. GST)<input type="number" step="0.01" min="0.01" name="amount" required value="${x.amount ?? ""}"></label>
      <label>of which GST (₹)<input type="number" step="0.01" min="0" name="gst_amount" value="${x.gst_amount ?? 0}"></label>
      <label>Paid by<input name="paid_by" list="payers" value="${esc(x.paid_by || "Company")}"><datalist id="payers">${payers.map(p => `<option>${esc(p)}</option>`).join("")}</datalist></label>
      <label>Payment mode${sel("payment_mode", MODES, x.payment_mode || "bank")}</label>
      <label>For order (optional)<select name="order_id"><option value="">Not linked</option>${orders.map(r => `<option value="${r.id}" ${x.order_id === r.id ? "selected" : ""}>${esc(r.order_no)} · ${esc(r.customers?.name || "")}</option>`).join("")}</select></label>
      <label>For delivery / challan (optional)<select name="challan_id"><option value="">Not linked</option>${chs.map(r => `<option value="${r.id}" ${x.challan_id === r.id ? "selected" : ""}>${esc(r.dc_no)}</option>`).join("")}</select></label>
      <label class="full">Description<input name="description" value="${esc(x.description || "")}"></label>
      <label class="full">Notes<input name="notes" value="${esc(x.notes || "")}"></label>
      <div class="full row end"><button class="btn" id="es">Save expense</button></div></form>`, {
      onMount: (m, close) => {
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

  // ---------- scan a bill ----------
  const openScan = () => modal("Scan a bill or receipt", `<p class="muted">Take a photo or upload a PDF of any expense bill or purchase invoice. The details are read automatically. You then choose the label (raw material, packaging, marketing, transport…) and save.</p>
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
          return openExpense({ file_path: path, source: "scan" }, { note: "The photo is attached. Type the details." });
        }
        close();
        openExpense({ exp_date: ex.bill_date || today(), vendor: ex.vendor || "", description: [ex.description, ex.bill_no ? "Bill " + ex.bill_no : ""].filter(Boolean).join(" · "), category: ex.suggested_category || "other",
          amount: ex.total ?? "", gst_amount: ex.gst_amount ?? 0, payment_mode: ex.payment_mode || "bank", file_path: path, source: "scan" },
          { note: "Read from the bill. Check the amount, then choose the correct label and who paid before saving." });
      };
      $("#spick", m).onclick = () => $("#sf", m).click(); $("#scam", m).onclick = () => $("#sc", m).click();
      $("#sf", m).onchange = e => onFile(e.target.files[0]); $("#sc", m).onchange = e => onFile(e.target.files[0]);
    },
  });

  // ---------- bulk excel (expenses) ----------
  const openBulkExpenses = (preset = "auto") => modal("Upload from Excel", `<p class="muted">Upload any Excel or CSV list of bills or spends. Date, amount, vendor and description are found automatically, even if the headings differ. Optional columns: Category, GST, Paid by, Mode, Qty, Rate, Unit, Notes.</p>
    <label>This file is<select id="kind"><option value="auto">Work it out from each row (Category column)</option>${CATS.map(([k, t]) => `<option value="${k}" ${k === preset ? "selected" : ""}>${k === "other" ? "Other expense" : t}</option>`).join("")}</select></label>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn ghost" id="tpl">Download template</button><button class="btn" id="bp">Choose Excel / CSV</button></div><input id="bf" type="file" accept=".xlsx,.xls,.csv" hidden><div id="bo"></div>`, {
    wide: true,
    onMount: (m, close) => {
      let rows = null, fname = "";
      $("#tpl", m).onclick = async () => {
        const X = await loadX(), ws = X.utils.aoa_to_sheet([["Date", "Vendor", "Description", "Category", "Qty", "Unit", "Rate", "Amount", "GST", "Paid by", "Mode", "Notes"], ["2026-11-20", "Shree Transport", "Tempo to Surat", "Transport", "", "", "", 2500, 0, "Gaurang", "Cash", ""], ["2026-11-21", "ABC Chemicals", "SLES 70%", "Raw material", 100, "kg", 80, 8000, 1440, "Company", "Bank", ""], ["2026-11-22", "Meta Ads", "Instagram campaign", "Marketing", "", "", "", 5000, 900, "Company", "UPI", ""]]);
        const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Expenses");
        download("earthlabs-expenses-template.xlsx", new Blob([X.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/octet-stream" }));
      };
      const show = () => {
        const p = parseExpenseRows(rows, $("#kind", m).value);
        if (p.missing.length) { $("#bo", m).innerHTML = '<div class="notice err">Could not find a Date column and an Amount column in this file.</div>'; return; }
        const all = p.out.map((r, i) => ({ ...r, idx: i })), ok = all.filter(r => !r.err), bad = all.length - ok.length;
        const sums = CATS.map(([k, t]) => [t, ok.filter(r => r.row.category === k).reduce((s2, r) => s2 + r.row.amount, 0)]).filter(x => x[1] > 0);
        $("#bo", m).innerHTML = `<p style="margin-top:10px"><b>${ok.length}</b> rows ready${bad ? `, <b>${bad}</b> will be skipped` : ""}. Total ${R(ok.reduce((s2, r) => s2 + r.row.amount, 0))}${sums.length ? " · " + sums.map(x => `${x[0]} ${R(x[1])}`).join(" · ") : ""}.</p>
          <p class="muted small">You can change the label of any row before importing.</p>
          <div style="max-height:280px;overflow:auto">${table([{ h: "Line", v: r => r.line }, { h: "Date", v: r => r.row.exp_date || "–" }, { h: "Vendor", v: r => r.row.vendor }, { h: "Details", v: r => r.row.description },
            { h: "Label", html: r => r.err ? "–" : `<select class="rc" data-i="${r.idx}">${CATS.map(([k, t]) => `<option value="${k}" ${r.row.category === k ? "selected" : ""}>${t}</option>`).join("")}</select>` },
            { h: "Amount", v: r => INR(r.row.amount) }, { h: "Paid by", v: r => r.row.paid_by }, { h: "Check", v: r => r.err || "OK" }], all, { empty: "Nothing found" })}</div>
          <div class="row end" style="margin-top:8px"><button class="btn" id="bgo" ${ok.length ? "" : "disabled"}>Import ${ok.length} entries</button></div>`;
        $$(".rc", m).forEach(sl => sl.onchange = () => { all[+sl.dataset.i].row.category = sl.value; });
        $("#bgo", m).onclick = async () => {
          $("#bgo", m).disabled = true;
          const r = await run(sb.rpc("bulk_import_expenses", { p_rows: ok.map(x => x.row) }), null);
          if (r) { toast(`${r.imported ?? ok.length} entries imported` + (r.failed?.length ? `, ${r.failed.length} failed` : ""), r.failed?.length ? "err" : undefined); close(); reload(); } else $("#bgo", m).disabled = false;
        };
      };
      $("#bp", m).onclick = () => $("#bf", m).click();
      $("#kind", m).onchange = () => { if (rows) show(); };
      $("#bf", m).onchange = async e => {
        const f = e.target.files[0]; if (!f) return; fname = f.name;
        try { rows = await readSheet(f); } catch (x) { return toast("Could not open that file: " + x.message, "err"); }
        show();
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
    const [rm, ols, invs, pays, exps, sinv] = await Promise.all([
      get(sb.from("v_rm_value").select("*").order("name")), get(sb.from("v_sales_order_lines").select("order_id,qty,rate,gst_pct")), get(sb.from("tax_invoices").select("total").eq("status", "issued")),
      get(sb.from("customer_payments").select("amount")), get(sb.from("expenses").select("amount,category,paid_by,reimbursed")), get(sb.from("supplier_invoices").select("total")),
    ]);
    const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
    const stock = sum(rm, r => r.value), noRate = rm.filter(r => r.no_rate && Number(r.on_hand) > 0).length;
    const ordVal = sum(ols, l => l.qty * l.rate * (1 + l.gst_pct / 100)), billed = sum(invs, i => i.total), rec = sum(pays, p => p.amount);
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
    const [invs, pays] = await Promise.all([get(sb.from("v_invoice_balance").select("*").eq("customer_id", c.customer_id).order("invoice_date")), get(sb.from("customer_payments").select("*").eq("customer_id", c.customer_id).order("paid_on"))]);
    const invNo = Object.fromEntries(invs.map(i => [i.id, i.invoice_no]));
    const ev = [...invs.map(i => ({ d: i.invoice_date, t: "Invoice " + i.invoice_no, dr: Number(i.total), cr: 0 })), ...pays.map(p => ({ d: p.paid_on, t: `Payment received (${MODE[p.mode] || p.mode})${p.invoice_id ? " · " + (invNo[p.invoice_id] || "") : " · on account"}${p.ref ? " · " + p.ref : ""}`, dr: 0, cr: Number(p.amount), id: p.id }))].sort((a, b) => String(a.d).localeCompare(String(b.d)));
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
    if (SUB !== "all" && !CAT[SUB]) SUB = "all";
    const payers = [...new Set(list.map(e => e.paid_by))], inSub = k => list.filter(e => k === "all" || e.category === k);
    av.innerHTML = `<div class="tabs wrapt">${[["all", "All"], ...CATS].map(([k, t]) => `<button class="tab sm ${k === SUB ? "on" : ""}" data-s="${k}">${t} (${inSub(k).length})</button>`).join("")}</div>
      <div class="toolbar"><button class="btn" id="sc">📷 Scan bill / photo</button><button class="btn ghost" id="ad">Add ${SUB === "all" ? "expense" : esc(CAT[SUB]).toLowerCase()}</button><button class="btn ghost" id="bx">Upload Excel</button><span class="grow"></span>
      <select id="fp"><option value="">Paid by anyone</option>${payers.map(p => `<option>${esc(p)}</option>`).join("")}</select></div><div id="ss"></div><div id="tb"></div>`;
    $$("[data-s]", av).forEach(b => b.onclick = () => { SUB = b.dataset.s; expenses(); });
    const draw = () => {
      const p = $("#fp", av).value, rows = inSub(SUB).filter(e => !p || e.paid_by === p), n = x => Number(x) || 0, tot = rows.reduce((s2, e) => s2 + n(e.amount), 0), mo = today().slice(0, 7);
      const vend = {}; rows.forEach(e => { const k = e.vendor || "(no vendor)"; vend[k] = (vend[k] || 0) + n(e.amount); });
      const top = Object.entries(vend).sort((a2, b2) => b2[1] - a2[1]).slice(0, 5);
      const owed = rows.filter(e => e.paid_by.toLowerCase() !== "company" && !e.reimbursed).reduce((s2, e) => s2 + n(e.amount), 0);
      $("#ss", av).innerHTML = `<div class="stats">${stat(SUB === "all" ? "All expenses" : esc(CAT[SUB]), R(tot), `${rows.length} entries`)}${stat("This month", R(rows.filter(e => String(e.exp_date).startsWith(mo)).reduce((s2, e) => s2 + n(e.amount), 0)))}${stat("GST included", R(rows.reduce((s2, e) => s2 + n(e.gst_amount), 0)))}${stat("To pay back to partners", R(owed), "", owed ? "warn" : "")}</div>
        ${top.length ? `<div class="card"><h3>Top vendors</h3>${table([{ h: "Vendor", v: r => r[0] }, { h: "Total", v: r => R(r[1]) }], top, { empty: "" })}</div>` : ""}`;
      $("#tb", av).innerHTML = table([{ h: "Date", v: e => dfmt(e.exp_date) }, { h: "Vendor", v: e => e.vendor || "–" }, { h: "Details", v: e => e.description || "" }, ...(SUB === "all" ? [{ h: "Label", v: e => CAT[e.category] }] : []),
        { h: "Amount", v: e => R(e.amount) }, { h: "Paid by", v: e => e.paid_by.toLowerCase() === "company" ? "Company" : e.paid_by + (e.reimbursed ? " (paid back)" : " (to pay back)") },
        { h: "", html: e => `${e.file_path ? `<button class="btn ghost sm vf" data-id="${e.id}">Bill</button> ` : ""}${e.paid_by.toLowerCase() !== "company" ? `<button class="btn ghost sm rb" data-id="${e.id}">${e.reimbursed ? "Undo paid back" : "Mark paid back"}</button> ` : ""}<button class="btn ghost sm ed" data-id="${e.id}">Edit</button> <button class="btn ghost sm dl" data-id="${e.id}">Delete</button>` }], rows, { empty: "Nothing here yet. Scan a bill, add one, or upload an Excel." });
      $$(".vf", av).forEach(b => b.onclick = async () => { const x = list.find(e => e.id === b.dataset.id), { data } = await sb.storage.from("expense-files").createSignedUrl(x.file_path, 300); data ? window.open(data.signedUrl, "_blank", "noopener") : toast("Could not open the file", "err"); });
      $$(".ed", av).forEach(b => b.onclick = () => openExpense(list.find(e => e.id === b.dataset.id)));
      $$(".rb", av).forEach(b => b.onclick = async () => { const x = list.find(e => e.id === b.dataset.id); if (await run(sb.rpc("set_reimbursed", { p_id: x.id, p_value: !x.reimbursed }), "Updated") !== null) reload(); });
      $$(".dl", av).forEach(b => b.onclick = async () => { if (!confirm("Delete this entry?")) return; if (await run(sb.rpc("delete_expense", { p_id: b.dataset.id }), "Deleted") !== null) reload(); });
    };
    draw(); $("#fp", av).onchange = draw;
    $("#sc", av).onclick = openScan; $("#ad", av).onclick = () => openExpense(SUB === "all" ? {} : { category: SUB }); $("#bx", av).onclick = () => openBulkExpenses(SUB === "all" ? "auto" : SUB);
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
        const n = x => Number(x) || 0, dcOrder = {}; lines.forEach(l => { dcOrder[l.challan_id] = l.order_id; });
        const ops = exps.filter(e => e.category !== "raw_material" && e.category !== "packaging");
        const rev = lines.reduce((s, l) => s + n(l.revenue), 0), cogs = lines.reduce((s, l) => s + n(l.cogs), 0), opx = ops.reduce((s, e) => s + n(e.amount) - n(e.gst_amount), 0);
        const keyOf = { order: l => l.order_id, delivery: l => l.challan_id, customer: l => l.customer_id, site: l => l.facility_id || "none" }[by];
        const nameOf = { order: l => `${l.order_no} · ${l.customer}`, delivery: l => `${l.dc_no}${l.invoice_no ? " / " + l.invoice_no : ""} · ${l.customer}`, customer: l => l.customer, site: l => l.facility }[by];
        const g = {};
        lines.forEach(l => { const k = keyOf(l); (g[k] ||= { name: nameOf(l), rev: 0, cogs: 0, exp: 0 }); g[k].rev += n(l.revenue); g[k].cogs += n(l.cogs); });
        const ordCust = {}; lines.forEach(l => { ordCust[l.order_id] = l.customer_id; });
        let linked = 0;
        ops.forEach(e => {
          const oid = e.order_id || dcOrder[e.challan_id], k = by === "delivery" ? e.challan_id : by === "order" ? oid : by === "customer" ? ordCust[oid] : null;
          if (k && g[k]) { g[k].exp += n(e.amount) - n(e.gst_amount); linked += n(e.amount) - n(e.gst_amount); }
        });
        const rows = Object.values(g).map(r => ({ ...r, gp: r.rev - r.cogs, np: r.rev - r.cogs - r.exp })).sort((a, b) => b.np - a.np);
        const noCost = lines.filter(l => n(l.cogs) === 0).length;
        pv.innerHTML = `<div class="stats">${stat("Sales (before GST)", R(rev))}${stat("Material & packing cost", R(cogs), "Batch materials + packaging at last purchase rates")}${stat("Gross profit", R(rev - cogs), rev ? ((rev - cogs) / rev * 100).toFixed(1) + "% margin" : "", rev - cogs >= 0 ? "good" : "bad")}
          ${stat("Operating expenses (before GST)", R(opx), "Marketing, transport, utilities, salary, rent, other")}${stat("Net profit", R(rev - cogs - opx), "", rev - cogs - opx >= 0 ? "good" : "bad")}</div>
          ${noCost ? `<div class="notice">${noCost} delivered line(s) show zero material cost because the raw materials used have no purchase bill yet. Upload supplier bills (Stock → Bills) to get true margins.</div>` : ""}
          ${!lines.length ? '<div class="notice">No deliveries in this period yet. Profit is counted when a challan is issued.</div>' : ""}
          <div class="card"><h3>${{ order: "Profit by order", delivery: "Profit by delivery", customer: "Profit by customer", site: "Profit by site / plant" }[by]}</h3>
          ${table([{ h: by === "site" ? "Site" : by === "customer" ? "Customer" : by === "order" ? "Order" : "Delivery", v: r => r.name }, { h: "Sales", v: r => R(r.rev) }, { h: "Material & pack cost", v: r => R(r.cogs) }, { h: "Gross profit", v: r => R(r.gp) }, ...(by === "site" ? [] : [{ h: "Linked expenses", v: r => R(r.exp) }, { h: "Profit after expenses", v: r => R(r.np) }])], rows, { empty: "Nothing to show" })}
          ${by === "site" ? '<p class="muted small">Site means the plant / facility where the delivered batch was made. Expenses are not split by site; see the overall net profit above.</p>' : `<p class="muted small">Linked expenses are those you tagged to an order or delivery. Other operating expenses (${R(opx - linked)}) are overheads, counted in the overall net profit only.</p>`}</div>`;
      } catch (e) { pv.innerHTML = `<p class="dev">Could not calculate: ${esc(e.message)}</p>`; }
    };
    $$("input,select", $(".toolbar", av)).forEach(x => x.onchange = go); go();
  };

  try { await ({ overview, account, ledger, expenses, bank, profit }[TAB])(); } catch (e) { fail(e); }
}
