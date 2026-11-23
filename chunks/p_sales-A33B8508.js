import{a as sb,e as esc,f as $,g as $$,h as num,i as dfmt,m as hasRole,o as toast,p as run,q as modal,s as table}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

const STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];
const CO_KEYS = [["co_legal_name","Company name"],["co_address","Address"],["co_gstin","GSTIN"],["co_pan","PAN"],["co_state","State"],["co_state_code","State code"],["co_email","Email"],["co_bank_account_name","Bank account name"],["co_bank_name","Bank"],["co_bank_account_no","Account number"],["co_bank_ifsc","IFSC"],["co_terms","Extra terms (printed on documents)"]];
const INR = n => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const Q = n => String(+Number(n).toFixed(3));
const wa = text => window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
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
  const W = 595, M = 36, teal = [19, 89, 90];
  const logo = await logoData();
  if (logo) { try { doc.addImage(logo, "PNG", M, 24, 60, 40); } catch {} }
  doc.setTextColor(...teal); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(d.seller.name || "", M + 70, 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(60);
  let y = 52;
  doc.splitTextToSize(d.seller.address || "", 330).forEach(t => { doc.text(t, M + 70, y); y += 10; });
  doc.text(`GSTIN: ${d.seller.gstin || ""}   PAN: ${d.seller.pan || ""}`, M + 70, y); y += 10;
  if (d.seller.email) { doc.text(d.seller.email, M + 70, y); y += 10; }
  doc.setTextColor(...teal); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(TITLES[kind], W - M, 40, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40);
  y = Math.max(y, 80) + 6;
  doc.setDrawColor(...teal); doc.line(M, y, W - M, y); y += 8;

  const b = d.buyer, right = [
    [kind === "invoice" ? "Invoice no." : kind === "challan" ? "Challan no." : "Proforma no.", meta.no],
    ["Date", dfmt(meta.date)],
    ...(d.po_no ? [["Customer PO / ref", d.po_no]] : []),
    ["Order no.", d.order_no],
    ...(kind === "invoice" && d.challan_ref ? [["Challan", `${d.challan_ref.no} (${dfmt(d.challan_ref.date)})`]] : []),
    ...(kind === "invoice" && d.proforma_ref ? [["Proforma", d.proforma_ref.no]] : []),
    ...(kind === "challan" && meta.vehicle ? [["Vehicle", meta.vehicle]] : []),
    ...(kind === "challan" && meta.transporter ? [["Transporter", meta.transporter]] : []),
    ...(kind === "challan" && meta.lr_no ? [["LR no.", meta.lr_no]] : []),
    ["Place of supply", `${d.place_of_supply.state || ""} (${d.place_of_supply.code})`],
  ];
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 8.5, cellPadding: 4, textColor: 30, lineColor: [200, 200, 200] },
    head: [["Bill to / Ship to", "Document details"]], headStyles: { fillColor: teal, textColor: 255 },
    body: [[
      { content: [b.name, b.address, b.gstin ? "GSTIN: " + b.gstin : "", `State: ${b.state || ""} (${b.state_code})`,
        b.contact ? "Contact: " + b.contact : "", b.phone ? "Phone: " + b.phone : ""].filter(Boolean).join("\n") },
      { content: right.map(r => r[0] + ": " + r[1]).join("\n") },
    ]],
    columnStyles: { 0: { cellWidth: 270 } },
  });
  y = doc.lastAutoTable.finalY + 10;

  const inter = d.inter_state;
  if (kind === "challan") {
    const byLine = Object.fromEntries(d.lines.map(l => [l.order_line_id, l]));
    const rows = (d.batches || []).map((x, i) => [i + 1, byLine[x.order_line_id]?.desc || "", byLine[x.order_line_id]?.hsn || "", x.batch_code, x.pack, Q(x.qty)]);
    autoTable(doc, { startY: y, theme: "grid", head: [["#", "Description of goods", "HSN", "Batch", "Pack", "Qty"]], body: rows,
      headStyles: { fillColor: teal, textColor: 255 }, styles: { fontSize: 8.5, cellPadding: 4 }, columnStyles: { 0: { cellWidth: 24 }, 5: { halign: "right" } } });
    y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(8.5); doc.text("Goods delivered in good condition. This challan is not a tax invoice; the tax invoice follows.", M, y); y += 14;
  } else {
    const head = inter ? [["#", "Description", "HSN", "Qty", "Rate", "Taxable", "IGST %", "IGST", "Total"]]
      : [["#", "Description", "HSN", "Qty", "Rate", "Taxable", "CGST", "SGST", "Total"]];
    const rows = d.lines.map(l => inter
      ? [l.n, l.desc, l.hsn, Q(l.qty), INR(l.rate), INR(l.taxable), l.gst_pct + "%", INR(l.igst), INR(l.total)]
      : [l.n, l.desc, l.hsn, Q(l.qty), INR(l.rate), INR(l.taxable), `${l.gst_pct / 2}%  ${INR(l.cgst)}`, `${l.gst_pct / 2}%  ${INR(l.sgst)}`, INR(l.total)]);
    autoTable(doc, { startY: y, theme: "grid", head, body: rows, headStyles: { fillColor: teal, textColor: 255, fontSize: 8 }, styles: { fontSize: 8, cellPadding: 3.5 },
      columnStyles: { 0: { cellWidth: 20 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } } });
    y = doc.lastAutoTable.finalY + 8;
    const t = d.totals;
    const tot = [["Taxable value", INR(t.taxable)], ...(inter ? [["IGST", INR(t.igst)]] : [["CGST", INR(t.cgst)], ["SGST", INR(t.sgst)]]), ["Grand total (Rs.)", INR(t.total)]];
    autoTable(doc, { startY: y, theme: "plain", body: tot, margin: { left: W - M - 220 }, tableWidth: 220, styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } } });
    y = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.splitTextToSize("Amount in words: " + inWords(t.total), W - 2 * M).forEach(s => { doc.text(s, M, y); y += 11; });
    doc.setFont("helvetica", "normal"); y += 4;
    if (d.bank && d.bank.account_no) {
      doc.setFontSize(8.5);
      doc.text(`Bank details: ${d.bank.account_name || ""} | ${d.bank.bank || ""} | A/c ${d.bank.account_no} | IFSC ${d.bank.ifsc || ""}`, M, y); y += 14;
    }
    if (kind === "proforma") { doc.setFontSize(8.5); doc.text("This is a proforma invoice, not a tax invoice. Goods are dispatched against payment as agreed.", M, y); y += 12; }
    if (d.terms_extra) { doc.setFontSize(8); doc.splitTextToSize("Terms: " + d.terms_extra, W - 2 * M).forEach(s => { doc.text(s, M, y); y += 10; }); }
  }
  y = Math.max(y + 24, 740);
  doc.setFontSize(8.5); doc.setTextColor(60);
  doc.text("Received by (sign & stamp)", M, y);
  doc.text("For " + (d.seller.name || ""), W - M, y, { align: "right" });
  doc.text("Authorised signatory", W - M, y + 40, { align: "right" });
  doc.save(meta.no.replace(/[\\/]/g, "-") + ".pdf");
}

// ---------- page ----------
export async function salesPage(el) {
  const canWrite = hasRole("qc_officer", "admin"), isAdmin = hasRole("admin");
  if (!canWrite) { el.innerHTML = '<p class="muted">Sales & Invoicing is for QA/QC and admin.</p>'; return; }
  el.innerHTML = '<p class="muted">Loading…</p>';
  const [c1, c2, c3, c4, c5, c6] = await Promise.all([
    sb.from("customers").select("*").order("name"),
    sb.from("sales_orders").select("*, customers(name)").order("created_at", { ascending: false }),
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
  const tabs = [["orders", "Orders"], ["customers", "Customers"], ["docs", "Documents"], ...(isAdmin ? [["settings", "Company details"]] : [])];
  if (!tabs.some(([k]) => k === TAB)) TAB = "orders";
  el.innerHTML = `<div class="tabs wrapt">${tabs.map(([k, t]) => `<button class="tab ${k === TAB ? "on" : ""}" data-k="${k}">${t}</button>`).join("")}</div><div id="sv"></div>`;
  $$(".tab", el).forEach(b => b.onclick = () => { TAB = b.dataset.k; salesPage(el); });
  const reload = tab => { if (tab) TAB = tab; salesPage(el); };
  const sv = $("#sv", el);

  // ----- customer form -----
  const openCustomer = (c = {}) => modal(c.id ? "Edit customer" : "Add customer", `<form id="cf" class="form-grid">
    <label>Name<input name="name" required value="${esc(c.name || "")}"></label>
    <label>Type<select name="customer_type">${[["distributor", "Distributor"], ["dealer", "Dealer"], ["direct", "Direct customer"]].map(([v, t]) => `<option value="${v}" ${(c.customer_type || "direct") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label>GSTIN<input name="gstin" maxlength="15" value="${esc(c.gstin || "")}" placeholder="Optional for unregistered"></label>
    <label>State<select name="state"><option value="">Select…</option>${STATES.map(s => `<option ${c.state === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <label class="full">Address<textarea name="address" rows="2">${esc(c.address || "")}</textarea></label>
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
        if (r) { close(); reload("customers"); }
      };
    },
  });

  // ----- new order -----
  const openOrder = () => {
    const lines = [{ description: "", qty: "", rate: "", gst_pct: 18 }];
    modal("New order", `<form id="of" class="form-grid">
      <label>Customer<select name="customer_id" required><option value="">Select…</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
      <label>Customer PO / reference<input name="customer_po_no"></label>
      <label>Order date<input type="date" name="order_date" value="${new Date().toISOString().slice(0, 10)}"></label>
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
            p_header: { customer_id: f.customer_id, customer_po_no: f.customer_po_no, order_date: f.order_date, notes: f.notes, needs_proforma: fd.has("needs_proforma") },
            p_lines: ok.map(l => ({ description: l.description, qty: Number(l.qty), rate: Number(l.rate), gst_pct: Number(l.gst_pct) })),
          }), "Order saved");
          $("#os", m).disabled = false;
          if (r) { close(); reload("orders"); }
        };
      },
    });
  };

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
          if (id) { close(); reload("orders"); }
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
      ${D.length ? `<table class="tbl"><thead><tr><th>Challan</th><th>Date</th><th>Tax invoice</th></tr></thead><tbody>${D.map(c => { const inv = I.find(i => i.challan_id === c.id); return `<tr><td>${esc(c.dc_no)} <button class="btn ghost sm" data-a="dc" data-id="${c.id}">PDF</button></td><td>${dfmt(c.dc_date)}</td>
        <td>${inv ? `${esc(inv.invoice_no)} · ₹${INR(inv.total)} <button class="btn ghost sm" data-a="inv" data-id="${inv.id}">PDF</button> <button class="btn ghost sm" data-a="wa" data-id="${inv.id}">WhatsApp</button>` : `<button class="btn sm" data-a="mkinv" data-id="${c.id}">Make tax invoice</button>`}</td></tr>`; }).join("")}</tbody></table>` : '<p class="muted small">No challan yet. A challan is needed before a tax invoice.</p>'}
      ${live && !D.length ? '<div class="row end"><button class="btn ghost sm" data-a="cancel">Cancel order</button></div>' : ""}`, {
      wide: true,
      onMount: (m, close) => {
        m.addEventListener("click", async e => {
          const b = e.target.closest("[data-a]"); if (!b) return;
          const a = b.dataset.a, id = b.dataset.id;
          if (a === "pi") return makePdf("proforma", pi.data, { no: pi.pi_no, date: pi.pi_date });
          if (a === "dc") { const c = D.find(x => x.id === id); return makePdf("challan", c.data, { no: c.dc_no, date: c.dc_date, vehicle: c.vehicle, transporter: c.transporter, lr_no: c.lr_no }); }
          if (a === "inv") { const i = I.find(x => x.id === id); return makePdf("invoice", i.data, { no: i.invoice_no, date: i.invoice_date }); }
          if (a === "wa") return wa(invText(I.find(x => x.id === id)));
          if (a === "mkpi") { if (await run(sb.rpc("create_proforma", { p_order: o.id }), "Proforma created")) { close(); reload("orders"); } }
          if (a === "mkdc") { close(); openChallan(o); }
          if (a === "mkinv") { if (await run(sb.rpc("create_tax_invoice", { p_challan: id }), "Tax invoice created")) { close(); reload("orders"); } }
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
    sv.innerHTML = `<div class="toolbar"><input id="q" type="search" placeholder="Search order, customer or reference…"><select id="st"><option value="">All status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <button class="btn" id="no">＋ New order</button><button class="btn ghost" id="fe">Fetch from EPDMS</button></div><div id="tb"></div>`;
    const draw = () => {
      const t = ($("#q").value || "").toLowerCase(), s = $("#st").value;
      $("#tb").innerHTML = table([
        { h: "Order", v: o => o.order_no }, { h: "Date", v: o => dfmt(o.order_date) }, { h: "Customer", v: o => o.customers?.name || "" },
        { h: "Source", v: o => o.source === "epdms" ? "EPDMS" : "Manual" }, { h: "Ref", v: o => o.customer_po_no || "–" },
        { h: "Value (incl. GST)", v: o => "₹" + INR(valueOf(o.id)) }, { h: "Status", v: o => STATUS[o.status] },
        { h: "Docs", v: o => [pis.some(p => p.order_id === o.id) ? "PI" : "", dcs.some(c => c.order_id === o.id) ? "DC" : "", invs.some(i => i.order_id === o.id) ? "INV" : ""].filter(Boolean).join(" · ") || "–" },
        { h: "", html: o => `<button class="btn ghost sm op" data-id="${o.id}">Open</button>` },
      ], orders.filter(o => (!s || o.status === s) && (!t || (o.order_no + (o.customers?.name || "") + (o.customer_po_no || "")).toLowerCase().includes(t))), { empty: "No orders yet. Add one, or fetch from EPDMS." });
      $$(".op", sv).forEach(b => b.onclick = () => openDetail(orders.find(x => x.id === b.dataset.id)));
    };
    draw(); $("#q").oninput = draw; $("#st").onchange = draw;
    $("#no").onclick = () => customers.length ? openOrder() : (toast("Add a customer first", "err"), openCustomer());
    $("#fe").onclick = e => fetchEpdms(e.target);
  } else if (TAB === "customers") {
    sv.innerHTML = `<div class="toolbar"><input id="q" type="search" placeholder="Search customer…"><button class="btn" id="nc">＋ Add customer</button></div><div id="tb"></div>`;
    const draw = () => {
      const t = ($("#q").value || "").toLowerCase();
      $("#tb").innerHTML = table([
        { h: "Name", v: c => c.name }, { h: "Type", v: c => ({ distributor: "Distributor", dealer: "Dealer", direct: "Direct" })[c.customer_type] || "" },
        { h: "GSTIN", v: c => c.gstin || "–" }, { h: "State", v: c => c.state || c.location || "–" }, { h: "Phone", v: c => c.phone || "–" },
        { h: "EPDMS", v: c => c.epdms_partner_id ? "✔ " + c.epdms_partner_id : "–" },
        { h: "", html: c => `<button class="btn ghost sm ec" data-id="${c.id}">Edit</button>` },
      ], customers.filter(c => !t || c.name.toLowerCase().includes(t)), { empty: "No customers yet." });
      $$(".ec", sv).forEach(b => b.onclick = () => openCustomer(customers.find(x => x.id === b.dataset.id)));
    };
    draw(); $("#q").oninput = draw; $("#nc").onclick = () => openCustomer();
  } else if (TAB === "docs") {
    const rows = [
      ...invs.map(i => ({ t: "Tax invoice", no: i.invoice_no, date: i.invoice_date, o: i.order_id, amt: i.total, pdf: () => makePdf("invoice", i.data, { no: i.invoice_no, date: i.invoice_date }) })),
      ...dcs.map(c => ({ t: "Challan", no: c.dc_no, date: c.dc_date, o: c.order_id, amt: null, pdf: () => makePdf("challan", c.data, { no: c.dc_no, date: c.dc_date, vehicle: c.vehicle, transporter: c.transporter, lr_no: c.lr_no }) })),
      ...pis.map(p => ({ t: "Proforma", no: p.pi_no, date: p.pi_date, o: p.order_id, amt: p.data.totals.total, pdf: () => makePdf("proforma", p.data, { no: p.pi_no, date: p.pi_date }) })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    sv.innerHTML = '<div id="tb"></div>';
    $("#tb").innerHTML = table([
      { h: "Type", v: r => r.t }, { h: "Number", v: r => r.no }, { h: "Date", v: r => dfmt(r.date) },
      { h: "Customer", v: r => orders.find(o => o.id === r.o)?.customers?.name || "" }, { h: "Amount", v: r => r.amt == null ? "–" : "₹" + INR(r.amt) },
      { h: "", html: r => `<button class="btn ghost sm pd" data-no="${esc(r.no)}">PDF</button>` },
    ], rows, { empty: "No documents yet." });
    $$(".pd", sv).forEach(b => b.onclick = () => rows.find(r => r.no === b.dataset.no).pdf());
  } else {
    const { data: st } = await sb.from("app_settings").select("*").like("key", "co_%");
    const cur = Object.fromEntries((st || []).map(r => [r.key, r.value]));
    sv.innerHTML = `<form id="sf" class="form-grid">${CO_KEYS.map(([k, t]) => `<label class="${k === "co_address" || k === "co_terms" ? "full" : ""}">${t}<input name="${k}" value="${esc(cur[k] || "")}"></label>`).join("")}
      <div class="full row end"><button class="btn">Save</button></div></form><p class="muted small">These details print on every proforma, challan and tax invoice. Invoice numbers run ELI/001, ELI/002…</p>`;
    $("#sf").onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (await run(sb.from("app_settings").upsert(Object.entries(f).map(([key, value]) => ({ key, value }))), "Saved")) reload("settings");
    };
  }
}
