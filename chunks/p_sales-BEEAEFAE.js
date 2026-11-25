import{a as sb,e as esc,f as $,g as $$,h as num,i as dfmt,m as hasRole,o as toast,p as run,q as modal,s as table}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

const STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];
const CO_KEYS = [["co_legal_name","Company name"],["co_address","Address"],["co_gstin","GSTIN"],["co_pan","PAN"],["co_state","State"],["co_state_code","State code"],["co_email","Email"],["co_bank_account_name","Bank account name"],["co_bank_name","Bank"],["co_bank_account_no","Account number"],["co_bank_ifsc","IFSC"],["co_terms","Extra terms (printed on documents)"]];
const INR = n => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const Q = n => String(+Number(n).toFixed(3));
const wa = text => window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
// ---------- send an invoice / challan by WhatsApp or email ----------
export const phoneOf = p => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "0") d = d.slice(1); if (d.length === 10) d = "91" + d; return d.length >= 11 && d.length <= 15 ? d : ""; };
const askTo = (channel, name) => new Promise(res => {
  const wa_ = channel === "wa"; let done = false;
  modal(wa_ ? "WhatsApp number" : "Email address", `<p class="muted">${esc(name || "This customer")} has no ${wa_ ? "phone number" : "email"} saved. Enter one to send now. To save it for next time, add it under Customers.</p><label class="full">${wa_ ? "WhatsApp number (with or without +91)" : "Email address"}<input id="sto" ${wa_ ? 'type="tel" placeholder="98765 43210"' : 'type="email" placeholder="name@company.com"'}></label><div class="row end" style="margin-top:12px"><button class="btn" id="stgo">${wa_ ? "Open WhatsApp" : "Open email"}</button></div>`,
    { onMount: (m, close) => { $("#stgo", m).onclick = () => { const v = $("#sto", m).value.trim(), ok = wa_ ? phoneOf(v) : /^\S+@\S+\.\S+$/.test(v) && v; if (!ok) { toast(wa_ ? "Enter a valid mobile number" : "Enter a valid email", "err"); return; } done = true; close(); res(ok); }; const obs = new MutationObserver(() => { if (!document.body.contains(m) && !done) { done = true; res(""); obs.disconnect(); } }); obs.observe(document.body, { childList: true }); } });
});
const LABEL = { invoice: "Tax invoice", challan: "Delivery challan", proforma: "Proforma invoice" };
const toB64 = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); };
// Sends the PDF as an email attachment through the send-doc-email function. Returns { ok } or { error, message }.
export const emailDoc = async (kind, d, meta, to) => {
  try {
    const r = await makePdf(kind, d, { ...meta, asBlob: true });
    const { data, error } = await sb.functions.invoke("send-doc-email", { body: { to, subject: `${LABEL[kind]} ${meta.no} – ${d.seller?.name || "EarthLabs"}`, text: docMessage(kind, d, meta, ""), filename: r.name, pdf_base64: await toB64(r.blob), cc: d.seller?.email || "" } });
    if (error) return { error: "failed", message: error.message };
    return data || { error: "failed", message: "No answer from the email service" };
  } catch (e) { return { error: "failed", message: e.message || String(e) }; }
};
export const docMessage = (kind, d, meta, link) => {
  const t = d.totals || {}, lines = (d.lines || []).map(l => `• ${l.desc || l.description}: ${Q(l.qty)}${kind === "invoice" && l.rate != null ? " × ₹" + INR(l.rate) : ""}`);
  const head = `${LABEL[kind]} ${meta.no} dated ${dfmt(meta.date)}`;
  const extra = kind === "proforma" ? [`*Total ₹${INR(t.total)}*`] : kind === "invoice" ? [`Taxable ₹${INR(t.taxable)} + GST ₹${INR((t.cgst || 0) + (t.sgst || 0) + (t.igst || 0))}`, `*Total ₹${INR(t.total)}*`, d.bank?.account_no ? `Bank: ${d.bank.bank} A/c ${d.bank.account_no} IFSC ${d.bank.ifsc}` : ""] : [meta.vehicle ? `Vehicle: ${meta.vehicle}` : "", meta.transporter ? `Transporter: ${meta.transporter}` : "", meta.lr_no ? `LR no: ${meta.lr_no}` : ""];
  return [`Dear ${d.buyer?.name || "Sir/Madam"},`, "", `Please find your ${head} from ${d.seller?.name || "EarthLabs"}.`, ...lines, ...extra.filter(Boolean), "", ...(link ? [`Download the PDF: ${link}`, "(Link works for 60 days)"] : ["The PDF is attached to this email."]), "", `Thank you,`, d.seller?.name || ""].join("\n");
};
export const sendDoc = async (channel, kind, d, meta, cust) => {
  let to = channel === "wa" ? phoneOf(cust?.phone || d.buyer?.phone) : String(cust?.email || d.buyer?.email || "").trim();
  if (!to) { to = await askTo(channel, cust?.name); if (!to) return; }
  if (channel === "em") {
    toast("Sending email…"); const r = await emailDoc(kind, d, meta, to);
    if (r.ok) { toast("Emailed to " + to); return; }
    if (r.error !== "not_configured") toast("Could not email directly (" + r.message + "). Opening your email app instead.", "err");
  }
  const w = channel === "wa" ? window.open("", "_blank") : null;
  try {
    const r = await makePdf(kind, d, { ...meta, asBlob: true });
    const path = `${kind}/${r.name.replace(/\.pdf$/, "")}-${Date.now()}.pdf`;
    const up = await sb.storage.from("sent-docs").upload(path, r.blob, { contentType: "application/pdf" });
    if (up.error) throw up.error;
    const su = await sb.storage.from("sent-docs").createSignedUrl(path, 60 * 24 * 3600);
    if (su.error) throw su.error;
    const text = docMessage(kind, d, meta, su.data.signedUrl);
    if (channel === "wa") { const url = "https://wa.me/" + to + "?text=" + encodeURIComponent(text); if (w) w.location.href = url; else window.open(url, "_blank"); }
    else location.href = `mailto:${to}?subject=${encodeURIComponent(LABEL[kind] + " " + meta.no + " – " + (d.seller?.name || "EarthLabs"))}&body=${encodeURIComponent(text)}`;
  } catch (e) { if (w) w.close(); toast("Could not prepare the document: " + (e.message || e), "err"); }
};
const STATUS = { open: "Open", part_delivered: "Part delivered", delivered: "Delivered", cancelled: "Cancelled" };
let TAB = "orders";

// ---------- amount in words (Indian system) ----------
const ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
const below100 = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
const below1000 = n => (n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? below100(n % 100) : "");
export function inWords(amount) {
  let r = Math.floor(Math.abs(amount)), p = Math.round((Math.abs(amount) - r) * 100);
  if (p === 100) { r += 1; p = 0; }
  const parts = [];
  const cr = Math.floor(r / 10000000); r %= 10000000;
  const la = Math.floor(r / 100000); r %= 100000;
  const th = Math.floor(r / 1000); r %= 1000;
  if (cr) parts.push(below1000(cr) + " Crore");
  if (la) parts.push(below100(la) + " Lakh");
  if (th) parts.push(below100(th) + " Thousand");
  if (r) parts.push(below1000(r));
  let s = parts.length ? parts.join(" ") : "Zero";
  s = "Rupees " + s;
  if (p) s += " and " + below100(p) + " Paise";
  return s + " Only";
}

// ---------- PDF ----------
async function logoData() {
  try {
    const b = await (await fetch("logo.png")).blob();
    return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(""); f.readAsDataURL(b); });
  } catch { return ""; }
}
const TITLES = { proforma: "PROFORMA INVOICE", challan: "DELIVERY CHALLAN", invoice: "TAX INVOICE" };
export async function makePdf(kind, d, meta) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("./jspdf.es.min-DDG3QBYI.js"), import("./jspdf.plugin.autotable-XRWHD7BR.js")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = 595, H = 842, M = 30, teal = [19, 89, 90], tint = [236, 244, 244], grey = [95, 95, 95], line = [200, 210, 210];
  const logo = await logoData();
  const inter = d.inter_state, t = d.totals || {};
  const NO = { invoice: "Invoice no.", challan: "Challan no.", proforma: "Proforma no." }[kind];
  const ensure = (y, need) => { if (y + need > H - 50) { doc.addPage(); return 40; } return y; };

  // ---- header ----
  if (logo) { try { doc.addImage(logo, "PNG", M, 22, 62, 42); } catch {} }
  doc.setTextColor(...teal); doc.setFont("helvetica", "bold"); doc.setFontSize(14.5);
  doc.text(d.seller.name || "", M + 72, 38);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...grey);
  let y = 49;
  doc.splitTextToSize(d.seller.address || "", 262).forEach(x => { doc.text(x, M + 72, y); y += 9.5; });
  doc.text(`GSTIN ${d.seller.gstin || ""}   |   PAN ${d.seller.pan || ""}`, M + 72, y); if (d.seller.email) { y += 9.5; doc.text(d.seller.email, M + 72, y); }
  y = Math.max(y + 10, 76);
  doc.setFillColor(...teal); doc.rect(W - M - 190, 22, 190, 26, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(12.5);
  doc.text({ invoice: "TAX INVOICE", challan: "DELIVERY CHALLAN", proforma: "PROFORMA INVOICE" }[kind], W - M - 95, 39.5, { align: "center" });
  doc.setTextColor(...grey); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text(kind === "challan" ? "Goods movement document - not a tax invoice" : kind === "proforma" ? "Not a tax invoice - for payment / confirmation" : "ORIGINAL FOR RECIPIENT", W - M, 58, { align: "right" });
  doc.setDrawColor(...teal); doc.setLineWidth(1.2); doc.line(M, y, W - M, y); y += 8;

  // ---- parties and document details ----
  const b = d.buyer, ship = b.ship_to && b.ship_to !== b.address ? b.ship_to : null;
  const info = [
    [NO, meta.no], ["Date", dfmt(meta.date)], ...(d.po_no ? [["Buyer's PO / ref", d.po_no]] : []), ["Order no.", d.order_no],
    ...(kind === "invoice" && d.challan_ref ? [["Challan", `${d.challan_ref.no}, ${dfmt(d.challan_ref.date)}`]] : []),
    ...(kind === "invoice" && d.proforma_ref ? [["Proforma", d.proforma_ref.no]] : []),
    ["Place of supply", `${d.place_of_supply.state || ""} (${d.place_of_supply.code})`],
    ...(kind === "challan" ? [["Vehicle no.", meta.vehicle || "-"], ["Transporter", meta.transporter || "-"], ["LR / docket", meta.lr_no || "-"]] : []),
  ];
  const partyText = x => [x.name, x.address, x.gstin ? "GSTIN: " + x.gstin : "GSTIN: Unregistered", `State: ${x.state || ""} (${x.state_code || ""})`,
    x.contact ? "Contact: " + x.contact : "", x.phone ? "Phone: " + x.phone : ""].filter(Boolean).join("\n");
  autoTable(doc, {
    startY: y, theme: "grid", margin: { left: M, right: M },
    styles: { fontSize: 8.2, cellPadding: 5, textColor: 30, lineColor: line, lineWidth: 0.6 },
    head: [["BILL TO", ship ? "SHIP TO" : "DELIVER TO", "DOCUMENT DETAILS"]],
    headStyles: { fillColor: tint, textColor: teal, fontSize: 7.5, fontStyle: "bold" },
    body: [[{ content: partyText(b) }, { content: ship ? `${b.name}\n${ship}\nState: ${b.state || ""} (${b.state_code || ""})` : "Same as billing address" }, { content: info.map(r => r[0] + ": " + r[1]).join("\n") }]],
    columnStyles: { 0: { cellWidth: 190 }, 1: { cellWidth: 160 } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ---- items ----
  const tbl = { theme: "grid", margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 4, textColor: 30, lineColor: line, lineWidth: 0.6 },
    headStyles: { fillColor: teal, textColor: 255, fontSize: 7.8, halign: "center" }, alternateRowStyles: { fillColor: [248, 251, 251] }, showHead: "everyPage" };
  let totQty = 0;
  if (kind === "challan") {
    const by = Object.fromEntries(d.lines.map(l => [l.order_line_id, l]));
    const rows = (d.batches || []).map((x, i) => { totQty += Number(x.qty); return [i + 1, by[x.order_line_id]?.desc || "", by[x.order_line_id]?.hsn || "", x.batch_code, x.pack, Q(x.qty)]; });
    autoTable(doc, { ...tbl, startY: y, head: [["#", "Description of goods", "HSN", "Batch no.", "Pack", "Qty"]], body: rows,
      foot: [["", "Total quantity", "", "", "", Q(totQty)]], footStyles: { fillColor: tint, textColor: teal, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 24, halign: "center" }, 2: { halign: "center" }, 5: { halign: "right", fontStyle: "bold" } } });
  } else {
    const head = inter ? [["#", "Description of goods", "HSN", "Qty", "Rate", "Taxable value", "IGST %", "IGST amt", "Total"]]
      : [["#", "Description of goods", "HSN", "Qty", "Rate", "Taxable value", "CGST", "SGST", "Total"]];
    const rows = d.lines.map(l => { totQty += Number(l.qty); return inter
      ? [l.n, l.desc, l.hsn, Q(l.qty), INR(l.rate), INR(l.taxable), l.gst_pct + "%", INR(l.igst), INR(l.total)]
      : [l.n, l.desc, l.hsn, Q(l.qty), INR(l.rate), INR(l.taxable), `${l.gst_pct / 2}%\n${INR(l.cgst)}`, `${l.gst_pct / 2}%\n${INR(l.sgst)}`, INR(l.total)]; });
    autoTable(doc, { ...tbl, startY: y, head, body: rows,
      foot: [["", "Total", "", Q(totQty), "", INR(t.taxable), inter ? "" : INR(t.cgst), inter ? INR(t.igst) : INR(t.sgst), INR(t.total)]],
      footStyles: { fillColor: tint, textColor: teal, fontStyle: "bold", fontSize: 7.8 },
      columnStyles: { 0: { cellWidth: 20, halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "center" }, 7: { halign: "right" }, 8: { halign: "right", fontStyle: "bold" } } });
  }
  y = doc.lastAutoTable.finalY + 10;

  // ---- totals / words / bank ----
  if (kind !== "challan") {
    y = ensure(y, 150);
    const lx = M, lw = 300, rx = W - M - 215;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...teal); doc.text("AMOUNT IN WORDS", lx, y + 8);
    doc.setTextColor(30); doc.setFontSize(9);
    let wy = y + 21; doc.splitTextToSize(inWords(t.total), lw).forEach(x => { doc.text(x, lx, wy); wy += 11; });
    if (d.bank && d.bank.account_no) {
      wy += 8; doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...teal); doc.text("BANK DETAILS", lx, wy); wy += 11;
      doc.setFont("helvetica", "normal"); doc.setTextColor(30);
      [["Account name", d.bank.account_name], ["Bank", d.bank.bank], ["Account no.", d.bank.account_no], ["IFSC", d.bank.ifsc]].forEach(([k, v]) => { doc.text(`${k}: ${v || ""}`, lx, wy); wy += 10.5; });
    }
    const tot = [["Taxable value", INR(t.taxable)], ...(inter ? [["IGST", INR(t.igst)]] : [["CGST", INR(t.cgst)], ["SGST", INR(t.sgst)]]), ["GRAND TOTAL (Rs.)", INR(t.total)]];
    autoTable(doc, { startY: y, theme: "grid", margin: { left: rx }, tableWidth: 215, body: tot, styles: { fontSize: 9, cellPadding: 5, lineColor: line, lineWidth: 0.6 },
      columnStyles: { 0: { fontStyle: "bold", textColor: grey }, 1: { halign: "right", fontStyle: "bold" } },
      didParseCell: h => { if (h.row.index === tot.length - 1) { h.cell.styles.fillColor = teal; h.cell.styles.textColor = 255; h.cell.styles.fontSize = 10.5; } } });
    y = Math.max(wy, doc.lastAutoTable.finalY) + 12;
  }

  // ---- terms ----
  const terms = kind === "challan" ? ["Goods received in good condition and correct quantity unless noted below.", "This challan is issued for movement of goods; the tax invoice follows separately."]
    : kind === "proforma" ? ["This is a proforma invoice and not a tax invoice. A tax invoice is issued at dispatch.", "Goods are dispatched against payment / confirmation as agreed.", "Prices are valid for 7 days from the date above unless agreed otherwise."]
    : ["Goods once sold will not be taken back except for manufacturing defects reported within 7 days.", "Interest may be charged on overdue payments as agreed.", "Subject to Vadodara jurisdiction."];
  if (d.terms_extra && kind !== "challan") terms.push(d.terms_extra);
  y = ensure(y, 40 + terms.length * 10);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...teal); doc.text("TERMS & CONDITIONS", M, y); y += 10;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(...grey);
  terms.forEach((x, i) => doc.splitTextToSize(`${i + 1}. ${x}`, W - 2 * M).forEach(r => { doc.text(r, M, y); y += 9.5; }));

  // ---- computer-generated note (no signature needed) ----
  y = ensure(y + 14, 30);
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...grey);
  doc.text("This is a computer-generated document and does not require a signature.", M, y);

  // ---- footer on every page ----
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`${meta.no}  |  Computer generated document, no signature required`, M, H - 20);
    doc.text(`Page ${i} of ${n}`, W - M, H - 20, { align: "right" });
  }
  const fname = meta.no.replace(/[\\/]/g, "-") + ".pdf";
  if (meta.asBlob) return { blob: doc.output("blob"), name: fname };
  doc.save(fname);
}

// ---------- page ----------
export async function salesPage(el) {
  const canWrite = hasRole("qc_officer", "admin"), isAdmin = hasRole("admin");
  if (!canWrite) { el.innerHTML = '<p class="muted">Sales & Invoicing is for QA/QC and admin.</p>'; return; }
  el.innerHTML = '<p class="muted">Loading…</p>';
  const [c1, c2, c3, c4, c5, c6] = await Promise.all([
    sb.from("customers").select("*").order("name"),
    sb.from("sales_orders").select("*, customers(name, customer_type)").order("created_at", { ascending: false }),
    sb.from("v_sales_order_lines").select("*").order("line_no"),
    sb.from("proformas").select("id,pi_no,order_id,pi_date,data").order("created_at", { ascending: false }),
    sb.from("challans").select("id,dc_no,order_id,dc_date,vehicle,transporter,lr_no,status,data").order("created_at", { ascending: false }),
    sb.from("tax_invoices").select("id,invoice_no,order_id,challan_id,invoice_date,data,taxable,tax,total,status").order("created_at", { ascending: false }),
  ]);
  const err = [c1, c2, c3, c4, c5, c6].find(x => x.error);
  if (err) { el.innerHTML = `<p class="dev">Could not load: ${esc(err.error.message)}</p>`; return; }
  const customers = c1.data || [], orders = c2.data || [], olines = c3.data || [], pis = c4.data || [], dcs = c5.data || [], invs = c6.data || [];
  const linesOf = id => olines.filter(l => l.order_id === id);
  const valueOf = id => linesOf(id).reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.gst_pct) / 100), 0);
  const tabs = [["orders", "Orders"], ["customers", "Customers"], ["docs", "Documents"], ...(isAdmin ? [["register", "Invoices & collections"]] : []), ...(isAdmin ? [["settings", "Company details"]] : [])];
  const nv = window.__nav; if (nv && nv.page === "sales") { window.__nav = null; if (nv.tab) TAB = nv.tab; }
  if (!tabs.some(([k]) => k === TAB)) TAB = "orders";
  el.innerHTML = `<div class="tabs wrapt">${tabs.map(([k, t]) => `<button class="tab ${k === TAB ? "on" : ""}" data-k="${k}">${t}</button>`).join("")}</div><div id="sv"></div>`;
  $$(".tab", el).forEach(b => b.onclick = () => { TAB = b.dataset.k; salesPage(el); });
  const reload = tab => { if (tab) TAB = tab; salesPage(el); };
  const autoOn = ((await sb.from("app_settings").select("value").eq("key", "auto_email_docs").maybeSingle()).data || {}).value === "on";
  const autoMail = async (kind, id, orderId) => {
    if (!autoOn || !id || id === true) return;
    try {
      const tbl = { challan: "challans", invoice: "tax_invoices", proforma: "proformas" }[kind];
      const { data: row } = await sb.from(tbl).select("*").eq("id", id).single(); if (!row) return;
      const cu = customers.find(x => x.id === orders.find(o => o.id === orderId)?.customer_id), d = row.data;
      const to = String(cu?.email || d.buyer?.email || "").trim();
      if (!to) { toast(`No email saved for ${cu?.name || "the customer"}, so it was not emailed`, "err"); return; }
      const meta = kind === "invoice" ? { no: row.invoice_no, date: row.invoice_date } : kind === "proforma" ? { no: row.pi_no, date: row.pi_date } : { no: row.dc_no, date: row.dc_date, vehicle: row.vehicle, transporter: row.transporter, lr_no: row.lr_no };
      const r = await emailDoc(kind, d, meta, to);
      toast(r.ok ? `${LABEL[kind]} ${meta.no} emailed to ${to}` : r.error === "not_configured" ? "Automatic email is not set up yet. Use the Email button instead." : "Could not email: " + r.message, r.ok ? undefined : "err");
    } catch (e) { toast("Could not email: " + (e.message || e), "err"); }
  };
  const sv = $("#sv", el);

  // ----- customer form -----
  const openCustomer = (c = {}, after = null, note = "") => modal(c.id ? "Edit customer" : "Add customer", `<form id="cf" class="form-grid">
    <label>Name<input name="name" required value="${esc(c.name || "")}"></label>
    <label>Type<select name="customer_type">${[["distributor", "Distributor"], ["dealer", "Dealer"], ["direct", "Direct customer"]].map(([v, t]) => `<option value="${v}" ${(c.customer_type || "direct") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label>GSTIN<input name="gstin" maxlength="15" value="${esc(c.gstin || "")}" placeholder="Optional for unregistered"></label>
    <label>State<select name="state"><option value="">Select…</option>${STATES.map(s => `<option ${c.state === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    ${note ? `<div class="notice full">${note}</div>` : ""}
    <label class="full">Billing address<textarea name="address" rows="2">${esc(c.address || "")}</textarea></label>
    <label class="full">Ship-to address (if different)<textarea name="ship_to_address" rows="2">${esc(c.ship_to_address || "")}</textarea></label>
    <label>Contact person<input name="contact_name" value="${esc(c.contact_name || "")}"></label>
    <label>Phone<input name="phone" value="${esc(c.phone || "")}"></label>
    <label class="full">Email<input name="email" type="email" value="${esc(c.email || "")}"></label>
    <div class="full row end"><button class="btn" id="cs">Save</button></div></form>`, {
    onMount: (m, close) => {
      $("#cf", m).onsubmit = async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        if (f.gstin) f.state = f.state || "";
        $("#cs", m).disabled = true;
        const r = await run(sb.rpc("save_customer", { p: { ...f, id: c.id || null } }), "Customer saved");
        $("#cs", m).disabled = false;
        if (r) {
          close();
          if (after) { customers.push({ id: r, name: f.name, customer_type: f.customer_type, gstin: f.gstin, state: f.state }); after(r); } else reload("customers");
        }
      };
    },
  });

  // ----- new order -----
  const openOrder = (pre = {}) => {
    const lines = pre.lines?.length ? pre.lines.map(l => ({ description: l.description || "", qty: l.qty ?? "", rate: l.rate ?? "", gst_pct: l.gst_pct ?? 18, hsn: l.hsn || "" })) : [{ description: "", qty: "", rate: "", gst_pct: 18 }];
    modal("New order", `<form id="of" class="form-grid">
      ${pre.note ? `<div class="notice full">${pre.note}</div>` : ""}
      <label>Customer<select name="customer_id" required><option value="">Select…</option>${customers.map(c => `<option value="${c.id}" ${c.id === pre.customer_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label>Customer PO / reference<input name="customer_po_no" value="${esc(pre.po || "")}"></label>
      <label>Order date<input type="date" name="order_date" value="${esc(pre.date || new Date().toISOString().slice(0, 10))}"></label>
      <label class="row"><input type="checkbox" name="needs_proforma" checked> Proforma invoice needed first</label>
      <label class="full">Notes<input name="notes"></label>
      <div class="full" id="ol"></div>
      <div class="full row"><button type="button" class="btn ghost sm" id="oadd">＋ Add item</button><button type="button" class="btn ghost sm" id="onewc">＋ New customer</button></div>
      <div class="full row end"><button class="btn" id="os">Save order</button></div></form>`, {
      wide: true,
      onMount: (m, close) => {
        const draw = () => {
          $("#ol", m).innerHTML = `<table class="tbl edit"><thead><tr><th>Item description</th><th>Qty</th><th>Rate (₹, excl. GST)</th><th>GST %</th><th></th></tr></thead><tbody>${lines.map((l, i) => `<tr data-i="${i}">
            <td><input data-f="description" value="${esc(l.description)}"></td><td><input data-f="qty" type="number" step="any" min="0" value="${l.qty}"></td>
            <td><input data-f="rate" type="number" step="any" min="0" value="${l.rate}"></td><td><input data-f="gst_pct" type="number" step="any" min="0" value="${l.gst_pct}"></td>
            <td><button type="button" class="btn ghost sm del">✕</button></td></tr>`).join("")}</tbody></table>`;
        };
        draw();
        $("#ol", m).addEventListener("input", e => { const tr = e.target.closest("tr[data-i]"); if (tr) lines[tr.dataset.i][e.target.dataset.f] = e.target.value; });
        $("#ol", m).addEventListener("click", e => { const d = e.target.closest(".del"); if (!d) return; lines.splice(d.closest("tr").dataset.i, 1); if (!lines.length) lines.push({ description: "", qty: "", rate: "", gst_pct: 18 }); draw(); });
        $("#oadd", m).onclick = () => { lines.push({ description: "", qty: "", rate: "", gst_pct: 18 }); draw(); };
        $("#onewc", m).onclick = () => { close(); openCustomer(); };
        $("#of", m).onsubmit = async e => {
          e.preventDefault();
          const fd = new FormData(e.target), f = Object.fromEntries(fd);
          const ok = lines.filter(l => l.description.trim() && Number(l.qty) > 0 && l.rate !== "" && Number(l.rate) >= 0);
          if (!ok.length || ok.length !== lines.length) return toast("Every item needs a description, quantity and rate", "err");
          $("#os", m).disabled = true;
          const r = await run(sb.rpc("create_sales_order", {
            p_header: { customer_id: f.customer_id, customer_po_no: f.customer_po_no, order_date: f.order_date, notes: f.notes, needs_proforma: fd.has("needs_proforma"), po_file_path: pre.file || null },
            p_lines: ok.map(l => ({ description: l.description, hsn: l.hsn || null, qty: Number(l.qty), rate: Number(l.rate), gst_pct: Number(l.gst_pct) })),
          }), "Order saved");
          $("#os", m).disabled = false;
          if (r) { close(); reload("orders"); }
        };
      },
    });
  };

  // ----- new order from customer's purchase order -----
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
  const openFromPO = () => modal("New order from purchase order", `<p class="muted">Upload the customer's purchase order (PDF or photo). The customer, PO number and items are read automatically for you to check.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="ppick">Choose PDF / photo</button><button class="btn ghost" id="pcam">Take photo</button></div>
    <input id="pf" type="file" accept="application/pdf,image/*" hidden><input id="pc" type="file" accept="image/*" capture="environment" hidden><p id="pst" class="muted small"></p>`, {
    onMount: (m, close) => {
      const status = t => { $("#pst", m).textContent = t; };
      const onFile = async file => {
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) return toast("File is too large (max 25 MB)", "err");
        ["ppick", "pcam"].forEach(i => $("#" + i, m).disabled = true);
        status("Uploading…");
        const up = await compress(file), ext = (up.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
        const { error: ue } = await sb.storage.from("customer-pos").upload(path, up, { contentType: up.type || undefined });
        const enable = () => ["ppick", "pcam"].forEach(i => $("#" + i, m).disabled = false);
        if (ue) { status(""); enable(); return toast("Upload failed: " + ue.message, "err"); }
        status("Reading the purchase order… about 10–20 seconds.");
        const { data } = await sb.functions.invoke("read-po", { body: { path } });
        const ex = data?.extracted;
        if (!ex) {
          status(""); enable();
          return toast(data?.error === "not_configured" ? "Automatic reading isn't switched on yet. Use New order and type it in." : "Could not read it" + (data?.message ? ": " + data.message : ""), "err");
        }
        const g = (ex.gstin || "").toUpperCase().trim(), nm = (ex.buyer_name || "").toLowerCase().trim();
        const hit = customers.find(c => g && (c.gstin || "").toUpperCase() === g) || customers.find(c => nm && c.name.toLowerCase().trim() === nm);
        const pre = { po: ex.po_no || "", date: ex.po_date || "", file: path, lines: ex.lines || [], note: "Read from the purchase order. Please check every item, quantity and rate before saving." };
        close();
        if (hit) openOrder({ ...pre, customer_id: hit.id });
        else openCustomer({ name: ex.buyer_name || "", gstin: ex.gstin || "", address: ex.address || "", ship_to_address: ex.ship_to_address || "", state: STATES.find(s => s.toLowerCase() === String(ex.state || "").toLowerCase()) || "",
          contact_name: ex.contact_name || "", phone: ex.phone || "", email: ex.email || "", customer_type: "direct" },
          id => openOrder({ ...pre, customer_id: id }), "This customer is new. Check the details, save, and the order opens next.");
      };
      $("#ppick", m).onclick = () => $("#pf", m).click(); $("#pcam", m).onclick = () => $("#pc", m).click();
      $("#pf", m).onchange = e => onFile(e.target.files[0]); $("#pc", m).onchange = e => onFile(e.target.files[0]);
    },
  });

  // ----- challan -----
  const openChallan = async (o) => {
    const { data: fg, error } = await sb.from("v_finished_goods").select("*").gt("available", 0).order("batch_code");
    if (error) return toast(error.message, "err");
    const pend = linesOf(o.id).filter(l => Number(l.qty) - Number(l.delivered_qty) > 0);
    if (!pend.length) return toast("Everything on this order is already delivered", "err");
    if (!fg.length) return toast("There is no finished stock available to dispatch yet", "err");
    const key = g => `${g.batch_id}|${g.pack_type}|${g.size_ml}`;
    const rows = [{ line: pend[0].id, k: "", qty: "" }];
    modal(`Delivery challan – ${o.order_no}`, `<form id="df" class="form-grid">
      <label>Date<input type="date" name="dc_date" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label>Vehicle no.<input name="vehicle"></label><label>Transporter<input name="transporter"></label><label>LR / docket no.<input name="lr_no"></label>
      <label class="full">Remarks<input name="remarks"></label>
      <div class="full" id="dl"></div>
      <div class="full row"><button type="button" class="btn ghost sm" id="dadd">＋ Add batch line</button></div>
      <p class="muted small full">Issuing the challan takes the goods out of finished-goods stock. A tax invoice can be raised from it afterwards.</p>
      <div class="full row end"><button class="btn" id="ds">Issue challan</button></div></form>`, {
      wide: true,
      onMount: (m, close) => {
        const draw = () => {
          $("#dl", m).innerHTML = `<table class="tbl edit"><thead><tr><th>Order item (left to deliver)</th><th>Batch / pack (available)</th><th>Qty</th><th></th></tr></thead><tbody>${rows.map((r, i) => `<tr data-i="${i}">
            <td><select data-f="line">${pend.map(l => `<option value="${l.id}" ${r.line === l.id ? "selected" : ""}>${esc(l.description)} (${Q(Number(l.qty) - Number(l.delivered_qty))})</option>`).join("")}</select></td>
            <td><select data-f="k"><option value="">Select…</option>${fg.map(g => `<option value="${key(g)}" ${r.k === key(g) ? "selected" : ""}>${esc(g.batch_code)} – ${esc(g.product_name)} – ${g.size_ml} mL ${esc(g.pack_type)} (${Q(g.available)})</option>`).join("")}</select></td>
            <td><input data-f="qty" type="number" step="any" min="0" value="${r.qty}"></td><td><button type="button" class="btn ghost sm del">✕</button></td></tr>`).join("")}</tbody></table>`;
        };
        draw();
        $("#dl", m).addEventListener("input", e => { const tr = e.target.closest("tr[data-i]"); if (tr) rows[tr.dataset.i][e.target.dataset.f] = e.target.value; });
        $("#dl", m).addEventListener("click", e => { const d = e.target.closest(".del"); if (!d) return; rows.splice(d.closest("tr").dataset.i, 1); if (!rows.length) rows.push({ line: pend[0].id, k: "", qty: "" }); draw(); });
        $("#dadd", m).onclick = () => { rows.push({ line: pend[0].id, k: "", qty: "" }); draw(); };
        $("#df", m).onsubmit = async e => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          const ok = rows.filter(r => r.k && Number(r.qty) > 0);
          if (!ok.length || ok.length !== rows.length) return toast("Every line needs a batch and a quantity above zero", "err");
          const payload = ok.map(r => { const [b, p, s] = r.k.split("|"); return { order_line_id: r.line, batch_id: b, pack_type: p, size_ml: Number(s), qty: Number(r.qty) }; });
          $("#ds", m).disabled = true;
          const id = await run(sb.rpc("create_challan", { p_order: o.id, p_header: f, p_lines: payload }), "Challan issued");
          $("#ds", m).disabled = false;
          if (id) { close(); await autoMail("challan", id, o.id); reload("orders"); }
        };
      },
    });
  };

  const invText = (i) => { const d = i.data; return [`*Tax invoice ${i.invoice_no}* – ${d.seller.name}`, `Date: ${dfmt(i.invoice_date)}`, `To: ${d.buyer.name}`,
    ...d.lines.map(l => `• ${l.desc}: ${Q(l.qty)} × ₹${INR(l.rate)}`), `Taxable ₹${INR(d.totals.taxable)} + GST ₹${INR(i.tax)}`, `*Total ₹${INR(i.total)}*`,
    d.bank?.account_no ? `Bank: ${d.bank.bank} A/c ${d.bank.account_no} IFSC ${d.bank.ifsc}` : ""].filter(Boolean).join("\n"); };

  // ----- order detail -----
  const openDetail = o => {
    const L = linesOf(o.id), pi = pis.find(p => p.order_id === o.id), D = dcs.filter(c => c.order_id === o.id), I = invs.filter(i => i.order_id === o.id);
    const left = L.reduce((s, l) => s + Math.max(0, Number(l.qty) - Number(l.delivered_qty)), 0);
    const live = o.status !== "cancelled";
    modal(`${o.order_no} – ${esc(o.customers?.name || "")}`, `
      <p class="muted small">${o.source === "epdms" ? "From EPDMS" : "Entered here"} · ${dfmt(o.order_date)}${o.customer_po_no ? " · Ref " + esc(o.customer_po_no) : ""} · <b>${STATUS[o.status]}</b></p>
      ${o.epdms_invoice_no ? `<p class="dev small">⚠ EPDMS already shows invoice ${esc(o.epdms_invoice_no)} for this order. Check before issuing another.</p>` : ""}
      <table class="tbl"><thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>GST</th><th>Delivered</th></tr></thead><tbody>${L.map(l => `<tr><td>${esc(l.description)}</td><td>${esc(l.hsn)}</td><td>${Q(l.qty)}</td><td>₹${INR(l.rate)}</td><td>${l.gst_pct}%</td><td>${Q(l.delivered_qty)}</td></tr>`).join("")}</tbody></table>
      <p><b>Order value incl. GST: ₹${INR(valueOf(o.id))}</b></p>
      <h4>Documents</h4>
      <div class="row wrap" id="dd">
        ${pi ? `<button class="btn ghost sm" data-a="pi">Proforma ${esc(pi.pi_no)} – PDF</button>` : (live && canWrite ? '<button class="btn ghost sm" data-a="mkpi">Make proforma (optional)</button>' : "")}
        ${live && left > 0 ? '<button class="btn sm" data-a="mkdc">Create delivery challan</button>' : ""}
      </div>
      ${D.length ? `<table class="tbl"><thead><tr><th>Challan</th><th>Date</th><th>Tax invoice</th></tr></thead><tbody>${D.map(c => { const inv = I.find(i => i.challan_id === c.id); return `<tr><td>${esc(c.dc_no)} <button class="btn ghost sm" data-a="dc" data-id="${c.id}">PDF</button> <button class="btn ghost sm" data-a="dcwa" data-id="${c.id}">WhatsApp</button> <button class="btn ghost sm" data-a="dcem" data-id="${c.id}">Email</button></td><td>${dfmt(c.dc_date)}</td>
        <td>${inv ? `${esc(inv.invoice_no)} · ₹${INR(inv.total)} <button class="btn ghost sm" data-a="inv" data-id="${inv.id}">PDF</button> <button class="btn ghost sm" data-a="wa" data-id="${inv.id}">WhatsApp</button> <button class="btn ghost sm" data-a="em" data-id="${inv.id}">Email</button>` : `<button class="btn sm" data-a="mkinv" data-id="${c.id}">Make tax invoice</button>`}</td></tr>`; }).join("")}</tbody></table>` : '<p class="muted small">No challan yet. A challan is needed before a tax invoice.</p>'}
      ${live && !D.length ? '<div class="row end"><button class="btn ghost sm" data-a="cancel">Cancel order</button></div>' : ""}`, {
      wide: true,
      onMount: (m, close) => {
        m.addEventListener("click", async e => {
          const b = e.target.closest("[data-a]"); if (!b) return;
          const a = b.dataset.a, id = b.dataset.id;
          if (a === "pi") return makePdf("proforma", pi.data, { no: pi.pi_no, date: pi.pi_date });
          if (a === "dc") { const c = D.find(x => x.id === id); return makePdf("challan", c.data, { no: c.dc_no, date: c.dc_date, vehicle: c.vehicle, transporter: c.transporter, lr_no: c.lr_no }); }
          if (a === "inv") { const i = I.find(x => x.id === id); return makePdf("invoice", i.data, { no: i.invoice_no, date: i.invoice_date }); }
          const cu = customers.find(x => x.id === o.customer_id), dm = c => ({ no: c.dc_no, date: c.dc_date, vehicle: c.vehicle, transporter: c.transporter, lr_no: c.lr_no });
          if (a === "wa" || a === "em") { const i = I.find(x => x.id === id); return sendDoc(a, "invoice", i.data, { no: i.invoice_no, date: i.invoice_date }, cu); }
          if (a === "dcwa" || a === "dcem") { const c = D.find(x => x.id === id); return sendDoc(a === "dcwa" ? "wa" : "em", "challan", c.data, dm(c), cu); }
          if (a === "mkpi") { const r = await run(sb.rpc("create_proforma", { p_order: o.id }), "Proforma created"); if (r) { close(); await autoMail("proforma", r, o.id); reload("orders"); } }
          if (a === "mkdc") { close(); openChallan(o); }
          if (a === "mkinv") { const r = await run(sb.rpc("create_tax_invoice", { p_challan: id }), "Tax invoice created"); if (r) { close(); await autoMail("invoice", r, o.id); reload("orders"); } }
          if (a === "cancel") { if (confirm("Cancel this order?") && await run(sb.rpc("cancel_sales_order", { p_order: o.id }), "Order cancelled")) { close(); reload("orders"); } }
        });
      },
    });
  };

  const fetchEpdms = async btn => {
    btn.disabled = true; btn.textContent = "Fetching…";
    const { data, error } = await sb.functions.invoke("sync-epdms-orders", { body: {} });
    btn.disabled = false; btn.textContent = "Fetch from EPDMS";
    if (error || data?.error) {
      const msg = data?.error === "not_configured" ? "EPDMS connection is not set up yet (secret missing)." : (data?.message || data?.error || error?.message || "Failed");
      return toast(msg, "err");
    }
    toast(`EPDMS: ${data.orders_new} new order(s), ${data.customers_new} new customer(s), ${data.orders_skipped} already here`);
    reload("orders");
  };

  // ----- tabs -----
  if (TAB === "orders") {
    sv.innerHTML = `<div class="toolbar"><input id="q" type="search" placeholder="Search order, customer or reference…"><select id="ch"><option value="">All customers</option><option value="channel">Distributors & dealers</option><option value="direct">Direct sales</option></select><select id="st"><option value="">All status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <button class="btn" id="no">＋ New order</button><button class="btn" id="npo">＋ From purchase order</button><button class="btn ghost" id="fe">Fetch from EPDMS</button></div><div id="tb"></div>`;
    const draw = () => {
      const t = ($("#q").value || "").toLowerCase(), s = $("#st").value, ch = $("#ch").value;
      $("#tb").innerHTML = table([
        { h: "Order", v: o => o.order_no }, { h: "Date", v: o => dfmt(o.order_date) }, { h: "Customer", v: o => o.customers?.name || "" },
        { h: "Source", v: o => o.source === "epdms" ? "EPDMS" : "Manual" }, { h: "Ref", v: o => o.customer_po_no || "–" },
        { h: "Value (incl. GST)", v: o => "₹" + INR(valueOf(o.id)) }, { h: "Status", v: o => STATUS[o.status] },
        { h: "Docs", v: o => [pis.some(p => p.order_id === o.id) ? "PI" : "", dcs.some(c => c.order_id === o.id) ? "DC" : "", invs.some(i => i.order_id === o.id) ? "INV" : ""].filter(Boolean).join(" · ") || "–" },
        { h: "", html: o => `<button class="btn ghost sm op" data-id="${o.id}">Open</button>` },
      ], orders.filter(o => (!s || o.status === s) && (!ch || (ch === "direct") === (o.customers?.customer_type === "direct")) && (!t || (o.order_no + (o.customers?.name || "") + (o.customer_po_no || "")).toLowerCase().includes(t))), { empty: "No orders yet. Add one, or fetch from EPDMS." });
      $$(".op", sv).forEach(b => b.onclick = () => openDetail(orders.find(x => x.id === b.dataset.id)));
    };
    draw(); $("#q").oninput = draw; $("#st").onchange = draw; $("#ch").onchange = draw;
    $("#no").onclick = () => customers.length ? openOrder() : (toast("Add a customer first", "err"), openCustomer());
    $("#npo").onclick = openFromPO;
    $("#fe").onclick = e => fetchEpdms(e.target);
  } else if (TAB === "customers") {
    sv.innerHTML = `<div class="toolbar"><input id="q" type="search" placeholder="Search customer…"><select id="ch"><option value="">All customers</option><option value="channel">Distributors & dealers</option><option value="direct">Direct customers</option></select><button class="btn" id="nc">＋ Add customer</button></div><div id="tb"></div>`;
    const draw = () => {
      const t = ($("#q").value || "").toLowerCase(), ch = $("#ch").value;
      $("#tb").innerHTML = table([
        { h: "Name", v: c => c.name }, { h: "Type", v: c => ({ distributor: "Distributor", dealer: "Dealer", direct: "Direct" })[c.customer_type] || "" },
        { h: "GSTIN", v: c => c.gstin || "–" }, { h: "State", v: c => c.state || c.location || "–" }, { h: "Phone", v: c => c.phone || "–" },
        { h: "EPDMS", v: c => c.epdms_partner_id ? "✔ " + c.epdms_partner_id : "–" },
        { h: "", html: c => `<button class="btn ghost sm ec" data-id="${c.id}">Edit</button>` },
      ], customers.filter(c => (!t || c.name.toLowerCase().includes(t)) && (!ch || (ch === "direct") === (c.customer_type === "direct"))), { empty: "No customers yet." });
      $$(".ec", sv).forEach(b => b.onclick = () => openCustomer(customers.find(x => x.id === b.dataset.id)));
    };
    draw(); $("#q").oninput = draw; $("#ch").onchange = draw; $("#nc").onclick = () => openCustomer();
  } else if (TAB === "register" && isAdmin) {
    sv.innerHTML = '<p class="muted">Loading…</p>';
    const { invoiceRegister } = await import("./p_register-E38B8046.js");
    await invoiceRegister(sv);
  } else if (TAB === "docs") {
    const rows = [
      ...invs.map(i => ({ t: "Tax invoice", no: i.invoice_no, date: i.invoice_date, o: i.order_id, amt: i.total, pdf: () => makePdf("invoice", i.data, { no: i.invoice_no, date: i.invoice_date }), send: ch => sendDoc(ch, "invoice", i.data, { no: i.invoice_no, date: i.invoice_date }, customers.find(x => x.id === orders.find(o => o.id === i.order_id)?.customer_id)) })),
      ...dcs.map(c => ({ t: "Challan", no: c.dc_no, date: c.dc_date, o: c.order_id, amt: null, pdf: () => makePdf("challan", c.data, { no: c.dc_no, date: c.dc_date, vehicle: c.vehicle, transporter: c.transporter, lr_no: c.lr_no }), send: ch => sendDoc(ch, "challan", c.data, { no: c.dc_no, date: c.dc_date, vehicle: c.vehicle, transporter: c.transporter, lr_no: c.lr_no }, customers.find(x => x.id === orders.find(o => o.id === c.order_id)?.customer_id)) })),
      ...pis.map(p => ({ t: "Proforma", no: p.pi_no, date: p.pi_date, o: p.order_id, amt: p.data.totals.total, pdf: () => makePdf("proforma", p.data, { no: p.pi_no, date: p.pi_date }) })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    sv.innerHTML = '<div id="tb"></div>';
    $("#tb").innerHTML = table([
      { h: "Type", v: r => r.t }, { h: "Number", v: r => r.no }, { h: "Date", v: r => dfmt(r.date) },
      { h: "Customer", v: r => orders.find(o => o.id === r.o)?.customers?.name || "" }, { h: "Amount", v: r => r.amt == null ? "–" : "₹" + INR(r.amt) },
      { h: "", html: r => `<button class="btn ghost sm pd" data-no="${esc(r.no)}">PDF</button>${r.send ? ` <button class="btn ghost sm sd" data-ch="wa" data-no="${esc(r.no)}">WhatsApp</button> <button class="btn ghost sm sd" data-ch="em" data-no="${esc(r.no)}">Email</button>` : ""}` },
    ], rows, { empty: "No documents yet." });
    $$(".pd", sv).forEach(b => b.onclick = () => rows.find(r => r.no === b.dataset.no).pdf());
    $$(".sd", sv).forEach(b => b.onclick = () => rows.find(r => r.no === b.dataset.no).send(b.dataset.ch));
  } else {
    const { data: st } = await sb.from("app_settings").select("*").or("key.like.co_%,key.eq.auto_email_docs");
    const cur = Object.fromEntries((st || []).map(r => [r.key, r.value]));
    sv.innerHTML = `<form id="sf" class="form-grid">${CO_KEYS.map(([k, t]) => `<label class="${k === "co_address" || k === "co_terms" ? "full" : ""}">${t}<input name="${k}" value="${esc(cur[k] || "")}"></label>`).join("")}
      <label class="full">Email customers automatically<select name="auto_email_docs"><option value="off" ${cur.auto_email_docs !== "on" ? "selected" : ""}>No, I will send manually</option><option value="on" ${cur.auto_email_docs === "on" ? "selected" : ""}>Yes: when a proforma, challan or tax invoice is made, email it to the customer with the PDF attached</option></select></label>
      <div class="full row end"><button class="btn">Save</button></div></form><p class="muted small">These details print on every proforma, challan and tax invoice. Invoice numbers run ELI/001, ELI/002…</p>`;
    $("#sf").onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (await run(sb.from("app_settings").upsert(Object.entries(f).map(([key, value]) => ({ key, value }))), "Saved")) reload("settings");
    };
  }
}
