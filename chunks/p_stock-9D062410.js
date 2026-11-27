import{a as sb,e as esc,f as $,g as $$,h as num,i as dfmt,j as dtfmt,m as hasRole,o as toast,p as run,q as modal,s as table}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// All quantities are in each raw material's base unit (mL, L, g or kg), as set in Master Data.
const SMALL = u => u === "mL" || u === "g";
const PCS = u => u === "pcs";
const dig = u => (SMALL(u) || PCS(u)) ? 0 : 3;
// weight and volume are treated as 1 g = 1 mL (as in the formulations); packaging is counted in pcs
const FAMILY = u => PCS(u) ? ["pcs"] : [u, ...["kg", "g", "L", "mL"].filter(x => x !== u)];
const toBase = (q, from, base) => PCS(base) ? q : q * (SMALL(from) ? 1 : 1000) / (SMALL(base) ? 1 : 1000);
const rnd = (q, u) => PCS(u) ? Math.ceil(q - 1e-9) : SMALL(u) ? Math.ceil(q - 1e-9) : Math.ceil(q * 1000 - 1e-9) / 1000;
const PACK = { bottle: "Bottle", sachet: "Sachet", pack: "Pack", box: "Box", carrier_box: "Carrier box", other: "Other packaging" };
const TY = r => r.category === "packaging" ? (PACK[r.pack_type] || "Packaging") : "Raw material";
const INR = n => n == null || n === "" ? "–" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const UNITS = ["kg", "g", "L", "mL", "pcs"];
const normUnit = u => { const x = String(u || "").trim().toLowerCase();
  return /^(kg|kgs|kilo|kilogram|kilograms)$/.test(x) ? "kg" : /^(g|gm|gms|gram|grams)$/.test(x) ? "g"
    : /^(l|ltr|ltrs|lt|litre|litres|liter|liters)$/.test(x) ? "L" : /^(ml|millilitre|milliliter)$/.test(x) ? "mL"
    : /^(pcs|pc|nos|no|piece|pieces|unit|units|each)$/.test(x) ? "pcs" : ""; };
const nn = v => v === "" || v == null || isNaN(Number(v)) ? null : Number(v);
const fmt = (q, u) => {
  const n = Number(q) || 0;
  if (PCS(u)) return `${num(n, 0)} pcs`;
  const big = SMALL(u) && Math.abs(n) >= 1000 ? ` (${num(n / 1000, 2)} ${u === "mL" ? "L" : "kg"})` : "";
  return `${num(n, SMALL(u) ? 0 : 3)} ${esc(u)}${big}`;
};
const MOVE = { receipt: "Received", adjustment: "Adjustment", consumption: "Used in batch" };
const PO_STATUS = { ordered: "Ordered", partial: "Part received", received: "Received", cancelled: "Cancelled" };
const TABS = [["stock", "Stock"], ["rawmat", "Raw material"], ["pack", "Packaging material"], ["reorder", "Reorder"], ["orders", "Purchase orders"], ["bills", "Bills"], ["capacity", "FG capacity & planner"], ["products", "Products & range"], ["budget", "Costing budget"], ["pricing", "Products & pricing"]];
const LABTABS = ["bills", "products", "budget", "pricing"];   // visible to admin and QA/QC only
const wa = text => window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
let TAB = "stock";
let FLT = "";   // packaging type chosen by clicking a row in the "Stock in hand by type" box

export async function stockPage(el) {
  const canB = hasRole("qc_officer", "admin");
  const [st, mv, rm, pq, cp, cf, bl, lp, vv, rs, fl, gp] = await Promise.all([
    sb.from("raw_material_status").select("*").order("name"),
    sb.from("raw_material_stock").select("*, raw_materials(name,unit), batches(temp_ref,batch_code)")
      .order("created_at", { ascending: false }).limit(100),
    sb.from("raw_materials").select("*").eq("active", true).order("name"),
    sb.from("purchase_orders").select("*, purchase_order_lines(*, raw_materials(name,unit))")
      .order("created_at", { ascending: false }).limit(60),
    sb.from("v_product_rm_capacity").select("*"),
    sb.from("app_settings").select("*"),
    canB ? sb.from("supplier_invoices").select("*, supplier_invoice_lines(*, raw_materials(name,unit))")
      .order("created_at", { ascending: false }).limit(150) : Promise.resolve({ data: [] }),
    canB ? sb.from("v_last_purchase").select("*") : Promise.resolve({ data: [] }),
    canB ? sb.from("v_rm_value").select("raw_material_id,rate,rate_unit,value,no_rate") : Promise.resolve({ data: [] }),
    canB ? sb.from("v_rm_rate_stats").select("*") : Promise.resolve({ data: [] }),
    sb.from("raw_material_flow").select("*"),                     // received / used / corrections per item (needs db/stock_flow.sql)
    sb.rpc("stock_gaps"),                                         // packaging used in filling but not yet taken off stock
  ]);
  const RS = Object.fromEntries((rs.error ? [] : rs.data || []).map(r => [r.raw_material_id, r]));   // average / low / high rate per item (needs db/rate_stats.sql)
  if (st.error || pq.error) {
    el.innerHTML = '<div class="notice err">Raw material stock and purchasing are not fully set up in the database yet. ' +
      'Ask the administrator to run db/raw_material_inventory.sql and db/raw_material_purchasing.sql, then reload.</div>';
    return;
  }
  const S = st.data || [], moves = mv.data || [], mats = rm.data || [], pos = pq.data || [], cap = cp.data || [];
  const cfg = Object.fromEntries((cf.data || []).map(r => [r.key, r.value]));
  const cover = Number(cfg.rm_cover_batches || 2), refL = Number(cfg.rm_ref_batch_l || 25);
  const company = cfg.company_name || "EarthLabs";
  const canOrder = hasRole("qc_officer", "admin"), isAdmin = hasRole("admin");
  const VAL = Object.fromEntries((vv.data || []).map(r => [r.raw_material_id, r]));
  const BILLS = bl.data || [], billsOk = !bl.error, lastP = Object.fromEntries((lp.data || []).map(r => [r.raw_material_id, r]));
  const tabsList = TABS.filter(([k]) => !LABTABS.includes(k) || canOrder);
  const nv = window.__nav; if (nv && nv.page === "stock") { window.__nav = null; if (nv.tab) TAB = nv.tab; }
  if (LABTABS.includes(TAB) && !canOrder) TAB = "stock";
  const byId = Object.fromEntries(mats.map(m => [m.id, m]));
  const isLow = r => r.below_min || r.below_cover;
  const why = r => [r.below_min ? "below minimum" : "", r.below_cover ? `under ${cover} batches of cover` : ""].filter(Boolean).join(", ");
  const nLow = S.filter(isLow).length;

  el.innerHTML = `<div class="tabs wrapt">${tabsList.map(([k, t]) =>
    `<button class="tab ${k === TAB ? "on" : ""}" data-k="${k}">${t}${k === "reorder" && nLow ? ` <b class="dev">(${nLow})</b>` : ""}</button>`).join("")}</div><div id="sp"></div>`;
  $$(".tab", el).forEach(b => b.onclick = () => { TAB = b.dataset.k; stockPage(el); });
  const reload = tab => { if (tab) TAB = tab; stockPage(el); };
  const sp = $("#sp", el);

  // ---------- shared: place-an-order modal (used by Reorder, Orders and Planner) ----------
  const openPO = (prefill = [], supplierHint = "") => {
    const lines = prefill.map(l => ({ id: l.id, qty: l.qty }));
    if (!lines.length) lines.push({ id: "", qty: "" });
    const suppliers = [...new Set([...pos.map(p => p.supplier), ...BILLS.map(b => b.supplier)])];
    modal("Place purchase order", `<form id="pof" class="form-grid">
      <label>Supplier<input name="supplier" list="sup" required value="${esc(supplierHint)}"><datalist id="sup">${suppliers.map(s => `<option value="${esc(s)}">`).join("")}</datalist></label>
      <label>Expected delivery<input type="date" name="expected_date"></label>
      <label class="full">Notes<input name="notes" placeholder="Optional"></label>
      <div class="full" id="pol"></div>
      <div class="full row"><button type="button" class="btn ghost sm" id="poadd">＋ Add line</button></div>
      <div class="full row end"><button class="btn" id="pos">Place order</button></div></form>`, {
      wide: true,
      onMount: (m, close) => {
        const draw = () => {
          $("#pol", m).innerHTML = `<table class="tbl edit"><thead><tr><th>Raw material</th><th>Quantity</th><th>Unit</th><th></th></tr></thead><tbody>${
            lines.map((l, i) => `<tr data-i="${i}"><td><select data-f="id"><option value="">Select…</option>${
              mats.map(x => `<option value="${x.id}" ${x.id === l.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></td>
              <td><input data-f="qty" type="number" step="any" min="0" value="${l.qty ?? ""}"></td>
              <td>${esc(byId[l.id]?.unit || "")}</td><td><button type="button" class="btn ghost sm del">✕</button></td></tr>`).join("")}</tbody></table>`;
        };
        draw();
        $("#pol", m).addEventListener("input", e => {
          const tr = e.target.closest("tr[data-i]"); if (!tr) return;
          lines[tr.dataset.i][e.target.dataset.f] = e.target.value;
          if (e.target.dataset.f === "id") draw();
        });
        $("#pol", m).addEventListener("click", e => {
          const d = e.target.closest(".del"); if (!d) return;
          lines.splice(d.closest("tr").dataset.i, 1); if (!lines.length) lines.push({ id: "", qty: "" }); draw();
        });
        $("#poadd", m).onclick = () => { lines.push({ id: "", qty: "" }); draw(); };
        $("#pof", m).onsubmit = async e => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.target));
          const ok = lines.filter(l => l.id && Number(l.qty) > 0);
          if (!ok.length || ok.length !== lines.length) return toast("Every line needs a raw material and a quantity above zero", "err");
          if (new Set(ok.map(l => l.id)).size !== ok.length) return toast("Each raw material can appear only once", "err");
          $("#pos", m).disabled = true;
          const r = await run(sb.rpc("create_purchase_order", {
            p_supplier: f.supplier, p_expected: f.expected_date || null, p_notes: f.notes || null,
            p_lines: ok.map(l => ({ raw_material_id: l.id, qty: Number(l.qty) })),
          }), "Purchase order placed");
          $("#pos", m).disabled = false;
          if (r) { close(); reload("orders"); }
        };
      },
    });
  };
  const poPdf = async p => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("./jspdf.es.min-DDG3QBYI.js"), import("./jspdf.plugin.autotable-XRWHD7BR.js")]);
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const W = 595, M = 30, teal = [19, 89, 90], tint = [236, 244, 244], grey = [95, 95, 95], ln = [200, 210, 210];
    let logo = "";
    try { const b = await (await fetch("logo.png")).blob(); logo = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(""); f.readAsDataURL(b); }); } catch {}
    if (logo) { try { doc.addImage(logo, "PNG", M, 22, 62, 42); } catch {} }
    const nm = cfg.co_legal_name || company;
    doc.setTextColor(...teal); doc.setFont("helvetica", "bold"); doc.setFontSize(14.5); doc.text(nm, M + 72, 38);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...grey);
    let y = 49; doc.splitTextToSize(cfg.co_address || "", 262).forEach(x => { doc.text(x, M + 72, y); y += 9.5; });
    if (cfg.co_gstin) { doc.text(`GSTIN ${cfg.co_gstin}${cfg.co_pan ? "   |   PAN " + cfg.co_pan : ""}`, M + 72, y); y += 9.5; }
    if (cfg.co_email) { doc.text(cfg.co_email, M + 72, y); y += 9.5; }
    y = Math.max(y + 4, 76);
    doc.setFillColor(...teal); doc.rect(W - M - 190, 22, 190, 26, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.text("PURCHASE ORDER", W - M - 95, 39.5, { align: "center" });
    doc.setDrawColor(...teal); doc.setLineWidth(1.2); doc.line(M, y, W - M, y); y += 8;
    autoTable(doc, { startY: y, theme: "grid", margin: { left: M, right: M }, styles: { fontSize: 8.4, cellPadding: 5, textColor: 30, lineColor: ln, lineWidth: 0.6 },
      head: [["SUPPLIER", "ORDER DETAILS"]], headStyles: { fillColor: tint, textColor: teal, fontSize: 7.5 },
      body: [[p.supplier, [`PO no.: ${p.po_no}`, `Date: ${dfmt(p.created_at)}`, p.expected_date ? `Required by: ${dfmt(p.expected_date)}` : ""].filter(Boolean).join("\n")]], columnStyles: { 0: { cellWidth: 300 } } });
    y = doc.lastAutoTable.finalY + 10;
    autoTable(doc, { startY: y, theme: "grid", margin: { left: M, right: M }, styles: { fontSize: 8.6, cellPadding: 5, textColor: 30, lineColor: ln, lineWidth: 0.6 },
      head: [["#", "Item", "Quantity", "Unit"]], headStyles: { fillColor: teal, textColor: 255, halign: "center" }, alternateRowStyles: { fillColor: [248, 251, 251] },
      body: p.purchase_order_lines.map((l, i) => [i + 1, l.raw_materials?.name || "", num(l.qty_ordered, dig(l.raw_materials?.unit)), l.raw_materials?.unit || ""]),
      columnStyles: { 0: { cellWidth: 26, halign: "center" }, 2: { halign: "right", fontStyle: "bold" }, 3: { cellWidth: 60, halign: "center" } } });
    y = doc.lastAutoTable.finalY + 14;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...teal); doc.text("NOTES", M, y); y += 10;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...grey);
    [p.notes, "Please confirm price, availability and delivery date on receipt of this order.", "Quote this PO number on your delivery challan and invoice.", "Deliver to the address above unless told otherwise."].filter(Boolean)
      .forEach((x, i) => doc.splitTextToSize(`${i + 1}. ${x}`, W - 2 * M).forEach(t => { doc.text(t, M, y); y += 10; }));
    y += 14; doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...grey);
    doc.text("This is a computer-generated document and does not require a signature.", M, y);
    doc.setFontSize(7); doc.setTextColor(150); doc.text(`${p.po_no}  |  Computer generated document`, M, 822);
    doc.save(p.po_no.replace(/[\\/]/g, "-") + ".pdf");
  };
  const poText = p => [`*Purchase order ${p.po_no}* – ${company}`, `Supplier: ${p.supplier}`,
    p.expected_date ? `Expected by: ${dfmt(p.expected_date)}` : null, "",
    ...p.purchase_order_lines.map(l => `• ${l.raw_materials?.name}: ${num(l.qty_ordered, dig(l.raw_materials?.unit))} ${l.raw_materials?.unit}`),
    p.notes ? "" : null, p.notes ? `Notes: ${p.notes}` : null].filter(x => x !== null).join("\n");

  // ---------- Stock tab ----------
  // ---------- Stock flow: received vs used vs in hand, catch-up banner, physical count, item history ----------
  const FL = Object.fromEntries((fl.error ? [] : fl.data || []).map(r => [r.raw_material_id, r]));
  const GAPS = gp.error ? [] : gp.data || [];
  // rate per the item's own unit: latest bill rate, else the estimate (same basis as the stat cards)
  const KU = { kg: 1, g: 0.001, L: 1, mL: 0.001, pcs: 1 };
  const rateU = r => { const v = VAL[r.raw_material_id];
    if (v?.rate) { const x = KU[v.rate_unit], y = KU[r.unit]; if (x && y) return Number(v.rate) / (x / y); }
    const e = byId[r.raw_material_id]?.est_rate; return e != null ? Number(e) : null; };
  const drawGaps = box => {
    if (!box || !canOrder || !GAPS.length) return;
    box.innerHTML = `<div class="notice err"><b>Stock in hand is overstated.</b> Filling was recorded for these packaging items but never taken off stock: ${
      GAPS.map(g => `<b>${esc(g.name)}</b> ${fmt(g.missing, g.unit)}`).join(" · ")}.
      This happens when filling was entered before packaging stock was being tracked.
      ${isAdmin ? '<div class="row" style="margin-top:8px"><button class="btn" id="gapfix">Take these off stock now</button></div>' : " Ask the administrator to take them off stock."}</div>`;
    const b = $("#gapfix", box); if (b) b.onclick = async () => {
      if (!confirm("Take these quantities off stock now?\n" + GAPS.map(g => g.name + ": " + num(g.missing, 0) + " " + g.unit).join("\n") + "\n\nEach one is recorded against its batch as a 'Filling catch-up' entry and stays in the history.")) return;
      b.disabled = true;
      const n = await run(sb.rpc("fix_stock_gaps", { p_reason: "filling was recorded before packaging stock was tracked" }), "Missing deductions posted");
      b.disabled = false; if (n) reload();
    };
  };
  const openCount = r => {
    const fam = FAMILY(r.unit);
    modal("Count stock – " + r.name, `<form id="cf" class="form-grid">
      <div class="notice full">The system shows <b>${fmt(r.on_hand, r.unit)}</b> in hand. Enter what is really there. One correcting entry for the difference is added, and the earlier history stays as it is.</div>
      <label>Counted quantity<input name="q" type="number" step="any" min="0" required></label>
      <label>Unit<select name="u">${fam.map(u => `<option>${u}</option>`).join("")}</select></label>
      <label class="full">Note<input name="note" required placeholder="e.g. bill was dated September, part used before the app; counted on the shelf"></label>
      <div class="full muted small" id="cdiff"></div>
      <div class="full row end"><button class="btn" id="cfs">Save count</button></div></form>`, {
      onMount: (m, close) => {
        const calc = () => { const q = nn($("[name=q]", m).value); if (q == null || q < 0) { $("#cdiff", m).textContent = ""; return null; }
          const base = toBase(q, $("[name=u]", m).value, r.unit), d = base - Number(r.on_hand);
          $("#cdiff", m).innerHTML = Math.abs(d) < 0.0005 ? "This matches the system." : `This will ${d > 0 ? "add" : "remove"} <b>${fmt(Math.abs(d), r.unit)}</b>.`; return base; };
        $("#cf", m).oninput = calc;
        $("#cf", m).onsubmit = async e => {
          e.preventDefault(); const base = calc(), note = $("[name=note]", m).value.trim();
          if (base == null) return toast("Enter the counted quantity", "err");
          if (!note) return toast("Add a note explaining the count", "err");
          $("#cfs", m).disabled = true;
          const d = await run(sb.rpc("set_stock_count", { p_rm: r.raw_material_id, p_counted: +base.toFixed(3), p_note: note }), "Stock count saved");
          $("#cfs", m).disabled = false; if (d) { close(); reload(); }
        };
      } });
  };
  const openHist = async r => {
    const { data, error } = await sb.from("raw_material_stock").select("*, batches(temp_ref,batch_code)")
      .eq("raw_material_id", r.raw_material_id).order("created_at", { ascending: true }).limit(500);
    if (error) return toast(error.message, "err");
    let bal = 0; const rows = (data || []).map(x => ({ ...x, bal: (bal += Number(x.qty)) })).reverse();
    modal("Full history – " + r.name, '<div id="hh"></div>', { wide: true, onMount: m => {
      $("#hh", m).innerHTML = table([
        { h: "Date", v: x => dtfmt(x.created_at) }, { h: "Type", v: x => MOVE[x.movement] || x.movement },
        { h: "Quantity", html: x => `<b class="${x.qty < 0 ? "dev" : "okc"}">${x.qty > 0 ? "+" : ""}${num(x.qty, 3)} ${esc(r.unit)}</b>` },
        { h: "In hand after", v: x => fmt(x.bal, r.unit) },
        { h: "Batch", html: x => x.batch_id ? `<a href="#/batch/${x.batch_id}">${esc(x.batches?.batch_code || x.batches?.temp_ref || "batch")}</a>` : "–" },
        { h: "Supplier", v: x => x.supplier || "–" },
        { h: "Note", v: x => (x.reversed_by ? "[Corrected / undone] " : x.reverses_id ? "[Correction] " : "") + (x.note || "") },
      ], rows, { empty: "No movements yet." });
    } });
  };

  const tStock = () => {
    sp.innerHTML = `
    <div class="toolbar"><input id="q" type="search" placeholder="Search item…">
      <select id="ty"><option value="">All items</option><option value="raw">Raw materials</option><option value="packaging">Packaging</option></select>
      ${canOrder ? '<button class="btn" id="addb">＋ Add stock</button>' : ""}${isAdmin ? ' <button class="btn ghost" id="nib">＋ New item</button>' : ""}</div>
    <div id="gapb"></div>
    ${isAdmin ? `<div class="card hide" id="nic"><h3>New item (raw material or packaging)</h3>
      <form id="nif" class="form-grid">
        <label>Item name<input name="name" required></label>
        <label>Type<select name="type" id="nity"><option value="raw">Raw material</option>${Object.entries(PACK).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <label>Unit<select name="unit" id="niun"><option>kg</option><option>g</option><option>L</option><option>mL</option></select></label>
        <label>Opening stock in hand (optional)<input name="qty" type="number" step="any" min="0"></label>
        <div><button class="btn" id="nisb">Save item</button> <button type="button" class="btn ghost" id="nic2">Cancel</button></div>
      </form></div>` : ""}
    ${canOrder ? `<div class="card hide" id="addc"><h3>Add stock</h3>
      <form id="sf" class="form-grid">
        <label>Raw material<select name="raw_material_id" id="rmsel" required><option value="">Select…</option>
          ${mats.map(m => `<option value="${m.id}">${esc(m.name)}${m.category === "packaging" ? " (" + (PACK[m.pack_type] || "packaging") + ")" : ""}</option>`).join("")}</select></label>
        <label>Entry type<select name="movement"><option value="receipt">Received (add stock)</option>
          ${isAdmin ? '<option value="adjustment">Stock-take correction (+ or −)</option>' : ""}</select></label>
        <label>Quantity<input name="qty" type="number" step="any" required></label>
        <label>Unit<select name="unit" id="usel"><option>kg</option><option>g</option><option>L</option><option>mL</option></select></label>
        <label>Lot no.<input name="lot_no"></label><label>Supplier<input name="supplier"></label>
        <label>Expiry date<input name="expiry_date" type="date"></label>
        <label>Note<input name="note" placeholder="Required for corrections"></label>
        <div><button class="btn" id="sfb">Save</button> <button type="button" class="btn ghost" id="sfc">Cancel</button></div>
      </form></div>` : ""}
    ${isAdmin ? `<form id="rf" class="card form-grid"><label>Low-stock rule: keep at least this many batches in stock
      <input name="rm_cover_batches" type="number" step="any" min="0" value="${cover}"></label>
      <label>…of this batch size (L)<input name="rm_ref_batch_l" type="number" step="any" min="1" value="${refL}"></label>
      <div class="row end"><button class="btn ghost">Save rule</button></div></form>` : ""}
    <div class="stats" id="tv"></div>
    <h3>Stock in hand by type</h3><div id="hb"></div>
    <h3>Current stock</h3><div id="lv"></div>
    <h3>Recent movements</h3><div id="mv"></div>
    <p class="muted small">An item is flagged Low when it is below its minimum level or can't cover ${cover} batches of ${refL} L.
    Stock is deducted with actual quantities when a batch is sent to QA/QC and returned if it is sent back or rejected. Packaging is deducted when filling is recorded.<br>
    <b>Stock in hand = Received − Used ± corrections.</b> Billed or ordered quantities are never the same as stock in hand: click a type in the box above, or open the Raw material / Packaging material tabs, to see the split for each item.</p>`;
    if (canB) {
      const val = r => Number(VAL[r.raw_material_id]?.value) || 0, rawV = S.filter(r => r.category !== "packaging").reduce((t, r) => t + val(r), 0), pkV = S.filter(r => r.category === "packaging").reduce((t, r) => t + val(r), 0);
      const noRate = S.filter(r => Number(r.on_hand) > 0 && (VAL[r.raw_material_id]?.no_rate ?? true)).length, neg = S.filter(r => Number(r.on_hand) < 0).length;
      const inHandRm = S.filter(r => r.category !== "packaging" && Number(r.on_hand) > 0).length, inHandPk = S.filter(r => r.category === "packaging" && Number(r.on_hand) > 0).length;
      $("#tv").innerHTML = `<div class="stat good"><div class="stat-l">Raw material at site (value)</div><div class="stat-v">${INR(rawV)}</div><div class="stat-s">Quantity on hand × latest purchase rate</div></div>
        <div class="stat"><div class="stat-l">Packaging at site (value)</div><div class="stat-v">${INR(pkV)}</div></div>
        <div class="stat"><div class="stat-l">Total stock value</div><div class="stat-v">${INR(rawV + pkV)}</div>${noRate ? `<div class="stat-s">${noRate} item(s) in stock have no purchase rate yet</div>` : ""}</div>
        <div class="stat"><div class="stat-l">Stock in hand (items)</div><div class="stat-v">${inHandRm + inHandPk}</div><div class="stat-s">${inHandRm} raw material${inHandRm === 1 ? "" : "s"} · ${inHandPk} packaging item${inHandPk === 1 ? "" : "s"} with stock on hand</div></div>
        ${neg ? `<div class="stat bad"><div class="stat-l">Items below zero</div><div class="stat-v">${neg}</div><div class="stat-s">Stock not recorded. Add the bills or correct the entries.</div></div>` : ""}`;
    }
    {
      // Stock in hand grouped by type: what the bills ordered, what was used, opening stock / corrections, and what is left (with approximate value).
      // Ordered and in-hand are valued at the same rate (latest bill rate, or your estimate where there is no bill yet), so the two always agree.
      const hasFlow = !fl.error;
      const G = {}, order = ["Raw material", ...Object.values(PACK)];
      S.forEach(r => {
        const f = FL[r.raw_material_id] || {}, rec = Number(f.received_total) || 0, used = Number(f.used_total) || 0, adj = Number(f.adjust_total) || 0, oh = Number(r.on_hand) || 0;
        if (!rec && !used && !adj && !oh) return;
        const k = TY(r), g = G[k] || (G[k] = { n: 0, rec: 0, used: 0, adj: 0, oh: 0, recV: 0, ohV: 0, noRate: 0 });
        const sc = k === "Raw material" && SMALL(r.unit) ? 1 / 1000 : 1, rt = canB ? rateU(r) : null;
        if (oh > 0) g.n++;
        g.rec += rec * sc; g.used += used * sc; g.adj += adj * sc; g.oh += oh * sc;
        if (rt != null) { g.recV += rec * rt; g.ohV += oh * rt; } else if (canB && (oh || rec)) g.noRate++;
      });
      const rows = order.filter(k => G[k]).map(k => ({ t: k, ...G[k] }));
      const tot = rows.reduce((a, r) => ({ n: a.n + r.n, v: a.v + r.ohV, rv: a.rv + r.recV }), { n: 0, v: 0, rv: 0 });
      const qf = (t, v) => t === "Raw material" ? `${num(v, 2)} kg / L` : `${num(v, 0)} pcs`;
      $("#hb").innerHTML = table([
        { h: "Type", html: r => hasFlow ? `<a href="#" class="tl" data-t="${esc(r.t)}" title="See each item"><b>${esc(r.t)}</b> ›</a>` : `<b>${esc(r.t)}</b>` },
        ...(hasFlow ? [
          { h: "Ordered (from bills)", html: r => `${qf(r.t, r.rec)}${canB && r.recV ? `<br><small class="muted">${INR(r.recV)}</small>` : ""}` },
          { h: "Used in batches & filling", v: r => r.used ? "− " + qf(r.t, r.used) : "–" },
          { h: "Opening stock / corrections", html: r => r.adj ? `<span class="${r.adj < 0 ? "dev" : ""}">${r.adj > 0 ? "+" : "−"} ${qf(r.t, Math.abs(r.adj))}</span>` : "–" },
        ] : []),
        { h: "Stock in hand now", html: r => `<b class="${r.oh < 0 ? "dev" : ""}">${qf(r.t, r.oh)}</b><br><small class="muted">${r.n} item${r.n === 1 ? "" : "s"} in stock</small>` },
        ...(canB ? [{ h: "Value in hand (approx.)", html: r => `<b>${INR(r.ohV)}</b>${r.noRate ? `<br><small class="dev">${r.noRate} item(s) have no rate yet</small>` : ""}` }] : []),
      ], rows, { empty: "Nothing in stock yet." }) + (canB && rows.length ? `<p class="muted small">Total stock in hand: <b>${tot.n}</b> items · <b>${INR(tot.v)}</b>${hasFlow ? ` (from <b>${INR(tot.rv)}</b> ordered on bills)` : ""}.
        <b>In hand = Ordered − Used ± Opening stock / corrections.</b> Values use the latest bill rate, or your estimate where there is no bill yet. Raw material litres and kg are added together (1 kg = 1 L, as in the formulations). Finished goods that are delivered do not change this: raw material and packaging are used up when a batch is made and when it is filled.</p>` : "");
      $$(".tl", $("#hb", sp)).forEach(a => a.onclick = e => { e.preventDefault(); const t = a.dataset.t;
        if (t === "Raw material") TAB = "rawmat"; else { TAB = "pack"; FLT = t; } stockPage(el); });
    }
    const drawLevels = () => {
      const term = ($("#q").value || "").toLowerCase(), ty = $("#ty").value;
      $("#lv").innerHTML = table([
        { h: "Item", v: r => r.name }, { h: "Type", v: r => TY(r) },
        { h: "Received to date", v: r => FL[r.raw_material_id] ? fmt(FL[r.raw_material_id].received_total, r.unit) : "–" },
        { h: "Used so far", v: r => FL[r.raw_material_id] ? (Number(FL[r.raw_material_id].used_total) ? fmt(FL[r.raw_material_id].used_total, r.unit) : "–") : "–" },
        { h: "Stock in hand now", html: r => { const adj = Number(FL[r.raw_material_id]?.adjust_total) || 0;
            return `<b class="${r.on_hand <= 0 ? "dev" : ""}">${fmt(r.on_hand, r.unit)}</b>${adj ? `<br><small class="muted">incl. ${adj > 0 ? "+" : "−"}${fmt(Math.abs(adj), r.unit)} stock-take</small>` : ""}`; } },
        ...(canB ? [{ h: "Latest rate", html: r => { const v = VAL[r.raw_material_id], e = byId[r.raw_material_id]?.est_rate;
            return v?.rate ? `${INR(v.rate)} / ${esc(v.rate_unit)}` : e != null ? `${INR(e)} / ${esc(r.unit)}<br><small class="dev">estimate – no bill yet</small>` : "No bill yet"; } },
          { h: "Average rate", html: r => { const a = RS[r.raw_material_id]; return a ? `<b>${INR(a.avg_rate)}</b> / ${esc(a.unit)}<br><small class="muted">${a.bills > 1 ? `low ${INR(a.min_rate)} · high ${INR(a.max_rate)} · ` : ""}${a.bills} bill${a.bills === 1 ? "" : "s"}</small>` : "–"; } },
          { h: "Value", html: r => { const v = VAL[r.raw_material_id]; if (!v) return "–"; return v.no_rate ? (Number(v.value) > 0 ? `${INR(v.value)}<br><small class="dev">estimate</small>` : "–") : INR(v.value); } },
          { h: "", html: r => `<button class="btn ghost sm ar" data-id="${r.raw_material_id}">Add rate</button>` }] : []),
        { h: "Open order (not yet received)", v: r => r.on_order > 0 ? fmt(r.on_order, r.unit) : "–" },
        { h: "Minimum", v: r => r.min_level > 0 ? fmt(r.min_level, r.unit) : "–" },
        { h: "Cover", v: r => r.batches_cover == null ? "–" : num(r.batches_cover, 1) + " batches" },
        { h: "Status", html: r => r.on_hand < 0 ? '<span class="dev">⚠ Negative – check entries</span>'
            : r.on_hand === 0 || Number(r.on_hand) === 0 ? '<span class="dev">✖ Out of stock</span>'
            : isLow(r) ? `<span class="dev">⚠ Low – ${why(r)}</span>` : '<span class="okc">✔ OK</span>' },
        ...(isAdmin ? [{ h: "", html: r => `<button class="btn ghost sm ct" data-id="${r.raw_material_id}">Count stock</button> <button class="btn ghost sm mn" data-id="${r.raw_material_id}">Set minimum</button>` }] : []),
      ], S.filter(r => (!term || r.name.toLowerCase().includes(term)) && (!ty || (ty === "raw" ? r.category !== "packaging" : r.category === "packaging"))), { empty: "No items yet." });
      $$(".mn", sp).forEach(b => b.onclick = () => {
        const r = S.find(x => x.raw_material_id === b.dataset.id);
        modal("Minimum stock – " + r.name, `<form id="mf" class="form-grid"><label>Minimum level (${esc(r.unit)})
          <input name="min" type="number" step="any" min="0" value="${r.min_level}"></label>
          <div class="full row end"><button class="btn">Save</button></div></form>`, {
          onMount: (m, close) => {
            $("#mf", m).onsubmit = async e => {
              e.preventDefault();
              const v = Number(new FormData(e.target).get("min"));
              if (!(v >= 0)) return toast("Enter zero or more", "err");
              if (await run(sb.from("raw_materials").update({ min_level: v }).eq("id", r.raw_material_id), "Minimum saved")) { close(); reload(); }
            };
          } });
      });
    // ---------- Add a rate: from a bill (file attached, counts in the average) or a market estimate ----------
    const openRate = r => {
      const m0 = byId[r.raw_material_id] || {}, UN = r.category === "packaging" ? ["pcs"] : ["kg", "g", "L", "mL"], today = new Date().toISOString().slice(0, 10);
      const def = UN.includes(r.unit) ? r.unit : UN[0];
      modal("Add rate – " + r.name, `<form id="rf2" class="form-grid">
        <label class="full">What are you adding?<select name="mode" id="rmode"><option value="bill">A price from a bill (attach the bill)</option>${isAdmin ? '<option value="est">A market estimate – no bill yet</option>' : ""}</select></label>
        <label>Rate (₹ per unit)<input name="rate" type="number" step="any" min="0" required></label>
        <label>Per<select name="unit">${UN.map(u => `<option ${u === def ? "selected" : ""}>${u}</option>`).join("")}</select></label>
        <div class="full muted small" id="rhelp"></div>
        <div id="rbill" class="full form-grid">
          <label>Supplier<input name="supplier" required></label><label>Bill no.<input name="invoice_no"></label>
          <label>Bill date<input name="invoice_date" type="date" value="${today}"></label>
          <label>Quantity on the bill<input name="qty" type="number" step="any" min="0" placeholder="Used to weight the average"></label>
          <label class="full">Bill file (photo or PDF)<input name="file" type="file" accept="application/pdf,image/*"></label>
          <label class="full">Note<input name="notes" placeholder="e.g. market rate was high this week"></label>
        </div>
        <div class="full row end"><button class="btn" id="rsave">Save rate</button></div></form>`, {
        onMount: (m, close) => {
          const sync = () => { const bill = $("#rmode", m).value === "bill"; $("#rbill", m).classList.toggle("hide", !bill);
            $$("#rbill [name=supplier]", m).forEach(i => i.required = bill);
            $("#rhelp", m).textContent = bill ? "This records the price only. It does not add stock. Every bill price is counted in the average rate, so prices that move with the market are averaged out."
              : "An estimate is used for costing until a bill is added. It is not part of the average, and a bill price replaces it."; };
          $("#rmode", m).onchange = sync; sync();
          $("#rf2", m).onsubmit = async e => {
            e.preventDefault(); const f = new FormData(e.target), rate = Number(f.get("rate")), unit = f.get("unit");
            if (!(rate > 0)) return toast("Enter a rate above zero", "err");
            $("#rsave", m).disabled = true;
            if (f.get("mode") === "est") {
              // estimate is stored per the item's own unit
              let per = rate; try { const k = { kg: 1, g: 0.001, L: 1, mL: 0.001, pcs: 1 }; if (k[unit] && k[r.unit]) per = rate / (k[unit] / k[r.unit]); } catch (_) {}
              const ok = await run(sb.rpc("set_est_rate", { p_rm: r.raw_material_id, p_rate: per }), "Estimate saved");
              if (ok == null) { $("#rsave", m).disabled = false; return; } close(); reload(); return;
            }
            const qty = f.get("qty") === "" ? null : Number(f.get("qty")), file = f.get("file");
            let path = null, fname = null;
            if (file && file.size) {
              if (file.size > 15 * 1024 * 1024) { $("#rsave", m).disabled = false; return toast("File is too large (max 15 MB)", "err"); }
              const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
              path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`; fname = file.name;
              const { error: ue } = await sb.storage.from("supplier-bills").upload(path, file, { contentType: file.type || undefined });
              if (ue) { $("#rsave", m).disabled = false; return toast("Upload failed: " + ue.message, "err"); }
            }
            const header = { supplier: f.get("supplier"), invoice_no: f.get("invoice_no"), invoice_date: f.get("invoice_date") || null, file_path: path, file_name: fname, notes: f.get("notes"), total: qty ? +(qty * rate).toFixed(2) : null, subtotal: qty ? +(qty * rate).toFixed(2) : null };
            const lines = [{ raw_material_id: r.raw_material_id, description: r.name, qty, unit, rate, amount: qty ? +(qty * rate).toFixed(2) : null }];
            const ok = await run(sb.rpc("save_supplier_invoice", { p_header: header, p_lines: lines }), "Rate saved");
            if (ok == null) { if (path) await sb.storage.from("supplier-bills").remove([path]); $("#rsave", m).disabled = false; return; }
            close(); reload();
          };
        } });
    };
    $$(".ar", sp).forEach(b => b.onclick = () => openRate(S.find(x => x.raw_material_id === b.dataset.id)));
    $$(".ct", sp).forEach(b => b.onclick = () => openCount(S.find(x => x.raw_material_id === b.dataset.id)));
    };
    $("#mv").innerHTML = table([
      { h: "Date", v: r => dtfmt(r.created_at) },
      { h: "Raw material", v: r => r.raw_materials?.name || "" },
      { h: "Type", v: r => MOVE[r.movement] || r.movement },
      { h: "Quantity", html: r => `<b class="${r.qty < 0 ? "dev" : "okc"}">${r.qty > 0 ? "+" : ""}${num(r.qty, 3)} ${esc(r.raw_materials?.unit || "")}</b>` },
      { h: "Lot", v: r => r.lot_no || "–" }, { h: "Supplier", v: r => r.supplier || "–" },
      { h: "Expiry", v: r => r.expiry_date ? dfmt(r.expiry_date) : "–" },
      { h: "Batch", html: r => r.batch_id ? `<a href="#/batch/${r.batch_id}">${esc(r.batches?.batch_code || r.batches?.temp_ref || "batch")}</a>` : "–" },
      { h: "Note", v: r => (r.reversed_by ? "[Corrected / undone] " : r.reverses_id ? "[Correction] " : "") + (r.note || "") },
      ...(isAdmin ? [{ h: "", html: r => !r.batch_id && !r.reverses_id && !r.reversed_by ? `<button class="btn ghost sm fxc" data-id="${r.id}">Correct</button> <button class="btn ghost sm fxu" data-id="${r.id}">Undo</button>` : "" }] : []),
    ], moves, { empty: "No stock movements yet. Use “Add stock” to record what you have." });
    const openFix = (r, mode) => modal(mode === "undo" ? "Undo this stock entry" : "Correct the quantity", `<form id="fx" class="form-grid">
      <div class="notice full">${esc(r.raw_materials?.name || "")} · ${MOVE[r.movement] || r.movement} · ${num(r.qty, 3)} ${esc(r.raw_materials?.unit || "")} on ${dtfmt(r.created_at)}${r.note ? " · " + esc(r.note) : ""}</div>
      ${mode === "undo" ? "" : `<label>Correct quantity (${esc(r.raw_materials?.unit || "")})<input name="q" type="number" step="any" required value="${r.qty}"></label>`}
      <label class="${mode === "undo" ? "full" : ""}">Reason<input name="reason" required placeholder="e.g. typed 100 instead of 10"></label>
      <p class="muted small full">The original entry stays in the history. A correcting entry is added so the audit trail is kept.</p>
      <div class="full row end"><button class="btn" id="fxs">${mode === "undo" ? "Undo entry" : "Save correction"}</button></div></form>`, {
      onMount: (m, close) => { $("#fx", m).onsubmit = async e => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); $("#fxs", m).disabled = true;
        const res = mode === "undo" ? await run(sb.rpc("reverse_stock_entry", { p_id: r.id, p_reason: f.reason }), "Entry undone")
          : await run(sb.rpc("correct_stock_entry", { p_id: r.id, p_new_qty: Number(f.q), p_reason: f.reason }), "Quantity corrected");
        $("#fxs", m).disabled = false; if (res) { close(); reload(); }
      }; } });
    $$(".fxc", sp).forEach(b => b.onclick = () => openFix(moves.find(x => x.id === b.dataset.id), "fix"));
    $$(".fxu", sp).forEach(b => b.onclick = () => openFix(moves.find(x => x.id === b.dataset.id), "undo"));
    drawLevels(); $("#q").oninput = drawLevels; $("#ty").onchange = drawLevels; drawGaps($("#gapb", sp));
    if (isAdmin) $("#rf").onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      if (await run(sb.from("app_settings").upsert([{ key: "rm_cover_batches", value: String(f.rm_cover_batches) },
        { key: "rm_ref_batch_l", value: String(f.rm_ref_batch_l) }]), "Rule saved")) reload();
    };
    if (isAdmin) {
      $("#nib").onclick = () => $("#nic").classList.toggle("hide");
      $("#nic2").onclick = () => $("#nic").classList.add("hide");
      $("#nity").onchange = () => { $("#niun").innerHTML = ($("#nity").value === "raw" ? ["kg", "g", "L", "mL"] : ["pcs"]).map(u => `<option>${u}</option>`).join(""); };
      $("#nif").onsubmit = async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target)), nm = (f.name || "").trim(), q = Number(f.qty) || 0;
        if (!nm) return toast("Enter the item name", "err");
        $("#nisb").disabled = true;
        const { data: ins, error } = await sb.from("raw_materials").insert({ name: nm, unit: f.unit,
          ...(f.type === "raw" ? { category: "raw", pack_type: null } : { category: "packaging", pack_type: f.type }) }).select().single();
        if (error) { $("#nisb").disabled = false; return toast(error.message, "err"); }
        if (q > 0) await run(sb.from("raw_material_stock").insert({ raw_material_id: ins.id, movement: "receipt", qty: q, note: "Opening stock" }), "Item and opening stock saved");
        else toast("Item added");
        $("#nisb").disabled = false; reload();
      };
    }
    if (!canOrder) return;
    $("#addb").onclick = () => $("#addc").classList.toggle("hide");
    $("#sfc").onclick = () => $("#addc").classList.add("hide");
    $("#rmsel").onchange = () => {
      const m = byId[$("#rmsel").value];
      $("#usel").innerHTML = (m ? FAMILY(m.unit) : ["kg", "g", "L", "mL"]).map(u => `<option>${u}</option>`).join("");
    };
    $("#sf").onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target)), m = byId[f.raw_material_id], q = Number(f.qty);
      if (!m || !q) return toast("Choose a material and enter a quantity", "err");
      if (f.movement === "receipt" && q <= 0) return toast("Received quantity must be more than zero", "err");
      if (f.movement === "adjustment" && !f.note) return toast("Add a note explaining the correction", "err");
      $("#sfb").disabled = true;
      const ok = await run(sb.from("raw_material_stock").insert({
        raw_material_id: m.id, movement: f.movement, qty: +toBase(q, f.unit, m.unit).toFixed(3),
        lot_no: f.lot_no || null, supplier: f.supplier || null, expiry_date: f.expiry_date || null, note: f.note || null,
      }), "Stock saved");
      $("#sfb").disabled = false; if (ok) reload();
    };
  };

  // ---------- Raw material / Packaging material tabs: per item ordered, used, in hand ----------
  const tKind = kind => {
    const isRaw = kind === "raw";
    if (fl.error) { sp.innerHTML = '<div class="notice err">The ordered / used split is not set up in the database yet. Ask the administrator to run db/stock_flow.sql, then reload.</div>'; return; }
    sp.innerHTML = `<p class="muted small"><b>Ordered</b> = what your bills added to stock. <b>Used</b> = what batches${isRaw ? "" : " and filling"} have taken off.
      <b>In hand = Ordered − Used ± opening stock / corrections.</b> Open purchase orders are not stock until received.</p>
      <div class="toolbar"><input id="fq" type="search" placeholder="Search ${isRaw ? "raw material" : "packaging"}…">${isRaw ? "" :
        `<select id="fty"><option value="">All packaging</option>${Object.values(PACK).map(t => `<option ${t === FLT ? "selected" : ""}>${t}</option>`).join("")}</select>`}</div>
      <div id="gapb"></div><div class="stats" id="fs"></div><div id="fl"></div>`;
    drawGaps($("#gapb", sp));
    if (!isRaw) $("#fty", sp).onchange = () => { FLT = $("#fty", sp).value; draw(); };
    const draw = () => {
      const term = ($("#fq", sp).value || "").toLowerCase(), ty = isRaw ? "" : ($("#fty", sp).value || "");
      const rows = S.filter(r => (r.category === "packaging") !== isRaw && (!term || r.name.toLowerCase().includes(term)) && (!ty || TY(r) === ty))
        .map(r => { const f = FL[r.raw_material_id] || {}, rt = canB ? rateU(r) : null, rec = Number(f.received_total) || 0, used = Number(f.used_total) || 0, oh = Number(r.on_hand) || 0;
          return { ...r, ...f, on_hand: r.on_hand, on_order: r.on_order, rt, recV: rt != null ? rec * rt : 0, usedV: rt != null ? used * rt : 0, ohV: rt != null ? oh * rt : 0 }; });
      if (canB) { const t = rows.reduce((a, r) => ({ rec: a.rec + r.recV, used: a.used + r.usedV, oh: a.oh + r.ohV }), { rec: 0, used: 0, oh: 0 });
        $("#fs", sp).innerHTML = `<div class="stat"><div class="stat-l">Ordered from bills (value)</div><div class="stat-v">${INR(t.rec)}</div></div>
          <div class="stat"><div class="stat-l">Used (value)</div><div class="stat-v">${INR(t.used)}</div></div>
          <div class="stat good"><div class="stat-l">In hand now (value)</div><div class="stat-v">${INR(t.oh)}</div><div class="stat-s">${rows.length} item${rows.length === 1 ? "" : "s"} shown · latest bill rate, or your estimate</div></div>`; }
      $("#fl", sp).innerHTML = table([
        { h: "Item", html: r => `<b>${esc(r.name)}</b>${isRaw ? "" : `<br><small class="muted">${esc(TY(r))}</small>`}` },
        { h: "Ordered (from bills)", html: r => (Number(r.received_total) ? fmt(r.received_total, r.unit) : "–") + (canB && r.recV ? `<br><small class="muted">${INR(r.recV)}</small>` : "") },
        { h: "Used", html: r => Number(r.used_total) ? "− " + fmt(r.used_total, r.unit) + (canB && r.usedV ? `<br><small class="muted">${INR(r.usedV)}</small>` : "") : "–" },
        { h: "Opening stock / corrections", html: r => { const a = Number(r.adjust_total) || 0; return a ? `<span class="${a < 0 ? "dev" : ""}">${a > 0 ? "+" : "−"} ${fmt(Math.abs(a), r.unit)}</span>` : "–"; } },
        { h: "In hand now", html: r => `<b class="${Number(r.on_hand) <= 0 ? "dev" : ""}">${fmt(r.on_hand, r.unit)}</b>` },
        ...(canB ? [{ h: "Value in hand (approx.)", html: r => r.rt == null ? '<small class="dev">no rate yet</small>' : `<b>${INR(r.ohV)}</b>` }] : []),
        { h: "Open order", v: r => r.on_order > 0 ? fmt(r.on_order, r.unit) : "–" },
        { h: "Status", html: r => Number(r.on_hand) < 0 ? '<span class="dev">⚠ Negative – check entries</span>' : Number(r.on_hand) === 0 ? '<span class="dev">✖ Out of stock</span>'
            : isLow(r) ? `<span class="dev">⚠ Low – ${why(r)}</span>` : '<span class="okc">✔ OK</span>' },
        { h: "", html: r => `<button class="btn ghost sm hi" data-id="${r.raw_material_id}">History</button>${isAdmin ? ` <button class="btn ghost sm ct" data-id="${r.raw_material_id}">Count stock</button>` : ""}` },
      ], rows, { empty: isRaw ? "No raw materials." : "No packaging items." });
      $$(".hi", sp).forEach(b => b.onclick = () => openHist(S.find(x => x.raw_material_id === b.dataset.id)));
      $$(".ct", sp).forEach(b => b.onclick = () => openCount(S.find(x => x.raw_material_id === b.dataset.id)));
    };
    draw(); $("#fq", sp).oninput = draw;
  };

  // ---------- Reorder tab ----------
  const tReorder = () => {
    const low = S.filter(isLow);
    if (!low.length) { sp.innerHTML = '<div class="notice">Nothing is low right now. Items appear here when they fall below their minimum or can\'t cover ' + cover + " batches of " + refL + " L.</div>"; return; }
    sp.innerHTML = `<p class="muted small">Suggested quantity brings each item up to its target (the larger of its minimum and ${cover} batches of ${refL} L), after counting what is already on order. Adjust quantities, tick what to buy, then place the order or share it.</p>
      <div id="rl"></div>
      <div class="row end"><button class="btn ghost" id="rwa">Share on WhatsApp</button>${canOrder ? '<button class="btn" id="rpo">Create purchase order</button>' : ""}</div>`;
    $("#rl").innerHTML = table([
      { h: "", html: r => `<input type="checkbox" class="rsel" data-id="${r.raw_material_id}" ${r.suggested_order > 0 ? "checked" : ""}>` },
      { h: "Item", html: r => `${esc(r.name)}<br><small class="muted">${TY(r)}</small>` },
      { h: "On hand", v: r => fmt(r.on_hand, r.unit) },
      { h: "On order", v: r => r.on_order > 0 ? fmt(r.on_order, r.unit) : "–" },
      { h: "Why low", v: r => why(r) },
      { h: "Last bought", html: r => { const p = lastP[r.raw_material_id]; return p ? `${esc(p.supplier)}<br><small class="muted">${p.rate != null ? INR(p.rate) + "/" + esc(p.unit || r.unit) + " · " : ""}${p.invoice_date ? dfmt(p.invoice_date) : ""}</small>` : "–"; } },
      { h: "Order qty", html: r => `<input type="number" step="any" min="0" class="rqty" data-id="${r.raw_material_id}" style="width:120px" value="${rnd(r.suggested_order, r.unit)}"> ${esc(r.unit)}` },
    ], low, { empty: "" });
    const picked = () => $$(".rsel", sp).filter(c => c.checked).map(c => ({
      id: c.dataset.id, qty: Number($(`.rqty[data-id="${c.dataset.id}"]`, sp).value) })).filter(l => l.qty > 0);
    $("#rwa").onclick = () => {
      const l = picked(); if (!l.length) return toast("Tick at least one item with a quantity", "err");
      wa([`*Raw material order request* – ${company}`, "", ...l.map(x => `• ${byId[x.id]?.name}: ${num(x.qty, dig(byId[x.id]?.unit))} ${byId[x.id]?.unit}`)].join("\n"));
    };
    if (canOrder) $("#rpo").onclick = () => {
      const l = picked(); if (!l.length) return toast("Tick at least one item with a quantity", "err");
      const cnt = {}; l.forEach(x => { const p = lastP[x.id]; if (p) cnt[p.supplier] = (cnt[p.supplier] || 0) + 1; });
      openPO(l, Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || "");
    };
  };

  // ---------- Purchase orders tab ----------
  const tOrders = () => {
    sp.innerHTML = `<div class="toolbar">${canOrder ? '<button class="btn" id="npo">＋ New purchase order</button>' : ""}</div><div id="ol"></div>`;
    $("#ol").innerHTML = table([
      { h: "PO", v: p => p.po_no }, { h: "Date", v: p => dfmt(p.created_at) }, { h: "Supplier", v: p => p.supplier },
      { h: "Items", html: p => p.purchase_order_lines.map(l => `${esc(l.raw_materials?.name)} – ${fmt(l.qty_ordered, l.raw_materials?.unit)}` +
          (Number(l.qty_received) ? ` <span class="muted">(received ${num(l.qty_received, 3)})</span>` : "")).join("<br>") },
      { h: "Expected", v: p => p.expected_date ? dfmt(p.expected_date) : "–" },
      { h: "Status", html: p => `<b class="${p.status === "received" ? "okc" : p.status === "cancelled" ? "muted" : ""}">${PO_STATUS[p.status] || p.status}</b>` },
      { h: "", html: p => `<button class="btn ghost sm ppd" data-id="${p.id}">PDF</button> <button class="btn ghost sm pwa" data-id="${p.id}">WhatsApp</button> ` +
          (canOrder && ["ordered", "partial"].includes(p.status) ? `<button class="btn sm prc" data-id="${p.id}">Receive</button> <button class="btn ghost sm pcx" data-id="${p.id}">Cancel</button>` : "") },
    ], pos, { empty: "No purchase orders yet. Create one from the Reorder tab or with “New purchase order”." });
    if (canOrder) $("#npo").onclick = () => openPO([]);
    $$(".ppd", sp).forEach(b => b.onclick = () => poPdf(pos.find(p => p.id === b.dataset.id)));
    $$(".pwa", sp).forEach(b => b.onclick = () => wa(poText(pos.find(p => p.id === b.dataset.id))));
    $$(".pcx", sp).forEach(b => b.onclick = async () => {
      const p = pos.find(x => x.id === b.dataset.id);
      if (!confirm(`Cancel ${p.po_no}? Anything already received stays in stock.`)) return;
      if (await run(sb.rpc("cancel_purchase_order", { p_po: p.id }), "Order cancelled")) reload();
    });
    $$(".prc", sp).forEach(b => b.onclick = () => {
      const p = pos.find(x => x.id === b.dataset.id);
      const open = p.purchase_order_lines.filter(l => Number(l.qty_ordered) > Number(l.qty_received));
      modal("Receive stock – " + p.po_no, `<form id="rf2" class="form-grid"><div class="full"><table class="tbl edit"><thead><tr><th>Raw material</th><th>Still to come</th><th>Received now</th><th>Lot no.</th><th>Expiry</th></tr></thead><tbody>${
        open.map(l => { const left = Number(l.qty_ordered) - Number(l.qty_received), u = l.raw_materials?.unit;
          return `<tr data-id="${l.id}"><td>${esc(l.raw_materials?.name)}</td><td>${fmt(left, u)}</td>
            <td><input data-f="qty" type="number" step="any" min="0" value="${+left.toFixed(3)}" style="width:110px"> ${esc(u)}</td>
            <td><input data-f="lot"></td><td><input data-f="exp" type="date"></td></tr>`; }).join("")}</tbody></table></div>
        <p class="muted small full">Set a quantity to 0 for anything that hasn't arrived. Received quantities are added to stock immediately.</p>
        <div class="full row end"><button class="btn" id="rcb">Add to stock</button></div></form>`, {
        wide: true,
        onMount: (m, close) => {
          $("#rf2", m).onsubmit = async e => {
            e.preventDefault(); $("#rcb", m).disabled = true; let n = 0, failed = false;
            for (const tr of $$("tr[data-id]", m)) {
              const q = Number($('[data-f="qty"]', tr).value);
              if (!(q > 0)) continue;
              const ok = await run(sb.rpc("receive_po_line", { p_line: tr.dataset.id, p_qty: q,
                p_lot: $('[data-f="lot"]', tr).value || null, p_expiry: $('[data-f="exp"]', tr).value || null }));
              if (!ok) { failed = true; break; } n++;
            }
            $("#rcb", m).disabled = false;
            if (n) toast(`${n} item${n > 1 ? "s" : ""} added to stock`);
            if (n || !failed) { close(); reload(); }
          };
        } });
    });
  };


  // ---------- Bills tab ----------
  const tBills = () => {
    if (!billsOk) { sp.innerHTML = '<div class="notice err">Bills are not set up in the database yet. Ask the administrator to run db/bills_packaging.sql, then reload.</div>'; return; }
    sp.innerHTML = `<div class="toolbar"><input id="bq" type="search" placeholder="Search bill no. or supplier…"><button class="btn" id="bnew">＋ Add bill</button></div><div id="bl"></div>
      <p class="muted small">Keep every supplier bill here. Upload a PDF or take a photo and the details are read for you to check. To buy the same items again, open a bill and choose “Create purchase order from this bill”.</p>`;
    const draw = () => {
      const t = ($("#bq").value || "").toLowerCase();
      $("#bl").innerHTML = table([
        { h: "Bill date", v: b => b.invoice_date ? dfmt(b.invoice_date) : "–" }, { h: "Supplier", v: b => b.supplier },
        { h: "Bill no.", v: b => b.invoice_no || "–" },
        { h: "Items", html: b => (b.supplier_invoice_lines || []).slice(0, 4).map(l => esc(l.raw_materials?.name || l.description || "")).join(", ") + ((b.supplier_invoice_lines || []).length > 4 ? "…" : "") },
        { h: "Total", v: b => INR(b.total) },
        { h: "Stock", html: b => b.stock_posted ? '<span class="okc">✔ Added</span>' : '<span class="muted">Not added</span>' },
        { h: "", html: b => `<button class="btn ghost sm bv" data-id="${b.id}">Open</button>` },
      ], BILLS.filter(b => !t || (b.supplier + " " + (b.invoice_no || "")).toLowerCase().includes(t)), { empty: "No bills yet. Use “Add bill” to upload one." });
      $$(".bv", sp).forEach(x => x.onclick = () => openBill(BILLS.find(b => b.id === x.dataset.id)));
    };
    draw(); $("#bq").oninput = draw; $("#bnew").onclick = openAddBill;
  };

  const openBill = b => {
    const lines = b.supplier_invoice_lines || [], matched = lines.filter(l => l.raw_material_id && Number(l.qty) > 0);
    modal(`Bill ${b.invoice_no || ""} – ${b.supplier}`, `
      <div class="form-grid"><div><small class="muted">Bill date</small><br><b>${b.invoice_date ? dfmt(b.invoice_date) : "–"}</b></div>
        <div><small class="muted">Taxable</small><br><b>${INR(b.subtotal)}</b></div><div><small class="muted">GST</small><br><b>${INR(b.tax_amount)}</b></div>
        <div><small class="muted">Total</small><br><b>${INR(b.total)}</b></div></div>
      ${table([
        { h: "Item", html: l => l.raw_material_id ? esc(l.raw_materials?.name) : `<span class="dev">⚠ not matched</span>` },
        { h: "On the bill", v: l => l.description || "" }, { h: "Qty", v: l => l.qty == null ? "–" : num(l.qty, 3) + " " + (l.unit || "") },
        { h: "Rate", v: l => INR(l.rate) }, { h: "Amount", v: l => INR(l.amount) },
      ], lines, { empty: "No lines." })}
      ${b.notes ? `<p class="muted small">Notes: ${esc(b.notes)}</p>` : ""}
      <div class="row end" style="gap:8px;flex-wrap:wrap">
        ${b.file_path ? '<button class="btn ghost" id="bfile">View bill file</button>' : ""}
        ${matched.length ? '<button class="btn ghost" id="bpo">Create purchase order from this bill</button>' : ""}
        ${!b.stock_posted && matched.length ? '<button class="btn" id="bstk">Add to stock</button>' : ""}
        ${isAdmin && b.stock_posted ? '<button class="btn ghost" id="bunp">Take out of stock</button>' : ""}
        ${isAdmin ? '<button class="btn ghost" id="bdel">Delete</button>' : ""}</div>
      ${b.stock_posted ? '<p class="okc small">This bill has been added to stock.</p>' : ""}`, {
      wide: true,
      onMount: (m, close) => {
        const f = $("#bfile", m); if (f) f.onclick = async () => {
          const w = window.open("about:blank", "_blank");
          const { data, error } = await sb.storage.from("supplier-bills").createSignedUrl(b.file_path, 300);
          if (error || !data) { if (w) w.close(); return toast("Could not open the file", "err"); }
          if (w) w.location = data.signedUrl;
        };
        const po = $("#bpo", m); if (po) po.onclick = () => {
          const ls = matched.map(l => { const mt = byId[l.raw_material_id]; if (!mt) return null;
            const u = normUnit(l.unit) || mt.unit; return { id: mt.id, qty: rnd(toBase(Number(l.qty), u, mt.unit), mt.unit) }; }).filter(Boolean);
          close(); openPO(ls, b.supplier);
        };
        const sk = $("#bstk", m); if (sk) sk.onclick = async () => {
          if (!confirm("Add the matched quantities on this bill to stock? Do this only if the goods have arrived, were not already received through a purchase order, and were not partly used before this app was in use. If part was already used, add it and then use Count stock to set what is really there.")) return;
          sk.disabled = true; const n = await run(sb.rpc("post_invoice_to_stock", { p_invoice: b.id }), "Added to stock");
          sk.disabled = false; if (n) { close(); reload("bills"); }
        };
        const up = $("#bunp", m); if (up) up.onclick = async () => {
          const why = prompt("Why is this bill being taken out of stock? (this is kept in the history)"); if (!why || !why.trim()) return;
          up.disabled = true; const n = await run(sb.rpc("unpost_invoice_from_stock", { p_invoice: b.id, p_reason: why.trim() }), "Taken out of stock");
          up.disabled = false; if (n !== null) { close(); reload("bills"); }
        };
        const dl = $("#bdel", m); if (dl) dl.onclick = async () => {
          if (!confirm("Delete this bill? Stock already added from it is NOT reversed. Use Take out of stock first if the stock should be removed.")) return;
          if (await run(sb.from("supplier_invoices").delete().eq("id", b.id), "Bill deleted")) {
            if (b.file_path) await sb.storage.from("supplier-bills").remove([b.file_path]);
            close(); reload("bills");
          }
        };
      } });
  };

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

  const openAddBill = () => {
    modal("Add supplier bill", `<div id="bs1"><p class="muted">Upload the supplier's bill as a PDF, or take a photo of it. The details are read automatically for you to check before saving.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="bpick">Choose PDF / photo</button><button class="btn ghost" id="bcam">Take photo</button><button class="btn ghost" id="bman">Enter by hand</button></div>
      <input id="bf" type="file" accept="application/pdf,image/*" hidden><input id="bc" type="file" accept="image/*" capture="environment" hidden>
      <p id="bst" class="muted small"></p></div><div id="bs2"></div>`, {
      wide: true,
      onMount: (m, close) => {
        const status = t => { $("#bst", m).textContent = t; };
        const showForm = (ex, path, fname, note) => {
          const H = { supplier: ex?.supplier_name || "", invoice_no: ex?.invoice_no || "", invoice_date: ex?.invoice_date || "", due_date: ex?.due_date || "",
            subtotal: ex?.subtotal ?? "", tax_amount: ex?.tax_amount ?? "", total: ex?.total ?? "", notes: "" };
          const L = (ex?.lines || []).map(l => { const mt = mats.find(x => x.name.toLowerCase() === String(l.matched_material || "").toLowerCase());
            return { id: mt?.id || "", description: l.description || "", qty: l.qty ?? "", unit: normUnit(l.unit) || mt?.unit || "kg", rate: l.rate ?? "", amount: l.amount ?? "" }; });
          if (!L.length) L.push({ id: "", description: "", qty: "", unit: "kg", rate: "", amount: "" });
          $("#bs1", m).classList.add("hide");
          $("#bs2", m).innerHTML = `<form id="bf2" class="form-grid">
            ${note ? `<div class="notice full">${note}</div>` : ""}
            <label>Supplier<input name="supplier" list="bsup" required value="${esc(H.supplier)}"><datalist id="bsup">${[...new Set([...BILLS.map(b => b.supplier), ...pos.map(p => p.supplier)])].map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>
            <label>Bill no.<input name="invoice_no" value="${esc(H.invoice_no)}"></label>
            <label>Bill date<input type="date" name="invoice_date" value="${esc(H.invoice_date)}"></label>
            <label>Due date<input type="date" name="due_date" value="${esc(H.due_date)}"></label>
            <label>Taxable amount (₹)<input type="number" step="any" name="subtotal" value="${H.subtotal}"></label>
            <label>GST (₹)<input type="number" step="any" name="tax_amount" value="${H.tax_amount}"></label>
            <label>Total (₹)<input type="number" step="any" name="total" value="${H.total}"></label>
            <label>Notes<input name="notes"></label>
            <label class="full row" style="gap:8px"><input type="checkbox" name="addstock" checked> Add the matched items to stock now and set their latest purchase rate (untick if these goods were already received through a purchase order)</label>
            <div class="full" id="bl2"></div>
            <div class="full row"><button type="button" class="btn ghost sm" id="bladd">＋ Add line</button></div>
            <div class="full row end"><button class="btn" id="bsave">Save bill</button></div></form>`;
          const draw = () => {
            $("#bl2", m).innerHTML = `<table class="tbl edit"><thead><tr><th>Item</th><th>On the bill</th><th>Qty</th><th>Unit</th><th>Rate (₹)</th><th>Amount (₹)</th><th></th></tr></thead><tbody>${
              L.map((l, i) => `<tr data-i="${i}"><td><select data-f="id"><option value="">– not in my list –</option>${mats.map(x => `<option value="${x.id}" ${x.id === l.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></td>
                <td><input data-f="description" value="${esc(l.description)}"></td><td><input data-f="qty" type="number" step="any" value="${l.qty}" style="width:90px"></td>
                <td><select data-f="unit">${UNITS.map(u => `<option ${u === l.unit ? "selected" : ""}>${u}</option>`).join("")}</select></td>
                <td><input data-f="rate" type="number" step="any" value="${l.rate}" style="width:100px"></td><td><input data-f="amount" type="number" step="any" value="${l.amount}" style="width:110px"></td>
                <td><button type="button" class="btn ghost sm del">✕</button></td></tr>`).join("")}</tbody></table>`;
          };
          draw();
          $("#bl2", m).addEventListener("change", e => { const tr = e.target.closest("tr[data-i]"); if (!tr) return; const l = L[tr.dataset.i]; l[e.target.dataset.f] = e.target.value;
            if (e.target.dataset.f === "id" && l.id) { const mt = byId[l.id]; if (mt && !l.description) l.description = mt.name; l.unit = UNITS.includes(l.unit) && l.qty !== "" ? l.unit : mt.unit; draw(); } });
          $("#bl2", m).addEventListener("click", e => { const d = e.target.closest(".del"); if (!d) return; L.splice(d.closest("tr").dataset.i, 1); if (!L.length) L.push({ id: "", description: "", qty: "", unit: "kg", rate: "", amount: "" }); draw(); });
          $("#bladd", m).onclick = () => { L.push({ id: "", description: "", qty: "", unit: "kg", rate: "", amount: "" }); draw(); };
          $("#bf2", m).onsubmit = async e => {
            e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
            const ls = L.filter(l => l.id || l.description || l.qty !== "");
            if (!ls.length) return toast("Add at least one line", "err");
            $("#bsave", m).disabled = true;
            const r = await run(sb.rpc("save_supplier_invoice", {
              p_header: { supplier: f.supplier, invoice_no: f.invoice_no, invoice_date: f.invoice_date || null, due_date: f.due_date || null,
                subtotal: nn(f.subtotal), tax_amount: nn(f.tax_amount), total: nn(f.total), file_path: path || null, file_name: fname || null, notes: f.notes, extracted: ex || null },
              p_lines: ls.map(l => ({ raw_material_id: l.id || null, description: l.description || null, qty: nn(l.qty), unit: l.unit, rate: nn(l.rate), amount: nn(l.amount) })),
            }), "Bill saved");
            if (r && f.addstock && ls.some(l => l.id && Number(l.qty) > 0)) { const n = await run(sb.rpc("post_invoice_to_stock", { p_invoice: r }), "Bill saved and added to stock"); if (!n) toast("The bill is saved but could not be added to stock. Open it and press Add to stock.", "err"); }
            else if (r && f.addstock) toast("Bill saved. No line is matched to an item with a quantity, so nothing was added to stock.", "err");
            $("#bsave", m).disabled = false; if (r) { close(); reload("bills"); }
          };
        };
        const onFile = async file => {
          if (!file) return;
          if (file.size > 25 * 1024 * 1024) return toast("File is too large (max 25 MB)", "err");
          ["bpick", "bcam", "bman"].forEach(i => $("#" + i, m).disabled = true);
          status("Uploading…");
          const up = await compress(file), ext = (up.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
          const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
          const { error: ue } = await sb.storage.from("supplier-bills").upload(path, up, { contentType: up.type || undefined });
          if (ue) { status(""); ["bpick", "bcam", "bman"].forEach(i => $("#" + i, m).disabled = false); return toast("Upload failed: " + ue.message, "err"); }
          status("Reading the bill… this takes about 10–20 seconds.");
          const { data, error } = await sb.functions.invoke("read-invoice", { body: { path } });
          let ex = data?.extracted || null, note = "";
          if (!ex) note = data?.error === "not_configured" ? "Automatic reading isn't switched on yet, so please type the details from the bill. The file has been saved with it."
            : "The bill couldn't be read automatically" + (data?.message ? " (" + esc(data.message) + ")" : "") + ". Please type the details; the file has been saved with it.";
          else note = "Read automatically from the bill. Please check every figure before saving.";
          showForm(ex, path, file.name, note); status("");
        };
        $("#bpick", m).onclick = () => $("#bf", m).click(); $("#bcam", m).onclick = () => $("#bc", m).click();
        $("#bf", m).onchange = e => onFile(e.target.files[0]); $("#bc", m).onchange = e => onFile(e.target.files[0]);
        $("#bman", m).onclick = () => showForm(null, null, null, "");
      } });
  };

  // ---------- FG capacity & planner tab ----------
  const tCap = () => {
    const prods = {};
    cap.forEach(r => (prods[r.product_id] ||= { name: r.product_name + (r.variant ? " – " + r.variant : ""), rows: [] }).rows.push(r));
    const ids = Object.keys(prods);
    if (!ids.length) { sp.innerHTML = '<div class="notice">No formulations are set up yet, so capacity can\'t be calculated. Add them under Master Data.</div>'; return; }
    sp.innerHTML = ids.map(id => `<div class="card" data-p="${id}"><h3>${esc(prods[id].name)}</h3><div class="cap-sum"></div><div class="cap-t"></div>
      <h4>Order planner</h4><div class="row"><label>Target litres <input type="number" step="any" min="1" class="tg" value="500" style="width:110px"></label></div>
      <div class="plan-t"></div><div class="row end plan-b"></div></div>`).join("") +
      `<p class="muted small">Litres possible = stock ÷ the amount of that material in 1 L of product. The lowest figure is what limits production. Quantities use each material's unit and assume the formulation % is of batch volume.</p>`;
    ids.forEach(id => {
      const card = $(`[data-p="${id}"]`, sp), rows = prods[id].rows;
      const poss = r => Number(r.per_litre) > 0 ? Number(r.on_hand) / Number(r.per_litre) : Infinity;
      const possO = r => Number(r.per_litre) > 0 ? (Number(r.on_hand) + Number(r.on_order)) / Number(r.per_litre) : Infinity;
      const lim = rows.reduce((a, b) => poss(b) < poss(a) ? b : a), limO = rows.reduce((a, b) => possO(b) < possO(a) ? b : a);
      $(".cap-sum", card).innerHTML = `<div class="notice ${poss(lim) > 0 ? "" : "warn"}">With stock on hand you can make about <b>${num(Math.max(poss(lim), 0), 1)} L</b>` +
        ` (<b>${num(Math.max(poss(lim) / refL, 0), 1)}</b> batches of ${refL} L), limited by <b>${esc(lim.rm_name)}</b>.` +
        (Number(limO.on_order) || rows.some(r => Number(r.on_order)) ? ` Counting open orders: <b>${num(Math.max(possO(limO), 0), 1)} L</b>.` : "") + "</div>";
      $(".cap-t", card).innerHTML = table([
        { h: "Raw material", v: r => r.rm_name }, { h: "Share", v: r => num(r.required_pct, 2) + " %" },
        { h: "Per litre", v: r => fmt(r.per_litre, r.unit) },
        { h: "On hand", v: r => fmt(r.on_hand, r.unit) }, { h: "On order", v: r => Number(r.on_order) > 0 ? fmt(r.on_order, r.unit) : "–" },
        { h: "Litres possible", html: r => `<b class="${r === lim ? "dev" : ""}">${num(poss(r), 1)}${r === lim ? " ← limits" : ""}</b>` },
      ], rows.slice().sort((a, b) => poss(a) - poss(b)), { empty: "" });
      const plan = () => {
        const T = Number($(".tg", card).value) || 0;
        const need = rows.map(r => ({ r, need: Number(r.per_litre) * T, short: Math.max(Number(r.per_litre) * T - Number(r.on_hand) - Number(r.on_order), 0) }));
        $(".plan-t", card).innerHTML = table([
          { h: "Raw material", v: x => x.r.rm_name }, { h: `Needed for ${num(T, 0)} L`, v: x => fmt(x.need, x.r.unit) },
          { h: "On hand + on order", v: x => fmt(Number(x.r.on_hand) + Number(x.r.on_order), x.r.unit) },
          { h: "Still to buy", html: x => x.short > 0 ? `<b class="dev">${fmt(rnd(x.short, x.r.unit), x.r.unit)}</b>` : '<span class="okc">✔ covered</span>' },
        ], need.slice().sort((a, b) => b.short - a.short), { empty: "" });
        const lines = need.filter(x => x.short > 0).map(x => ({ id: x.r.raw_material_id, qty: rnd(x.short, x.r.unit) }));
        $(".plan-b", card).innerHTML = lines.length
          ? `<button class="btn ghost pw">Share shortfall on WhatsApp</button>${canOrder ? '<button class="btn pp">Create PO for shortfall</button>' : ""}`
          : '<span class="okc">Everything needed for this target is already in stock or on order.</span>';
        if (lines.length) {
          $(".pw", card).onclick = () => wa([`*Raw material needed for ${num(T, 0)} L of ${prods[id].name}* – ${company}`, "",
            ...lines.map(l => `• ${byId[l.id]?.name}: ${num(l.qty, dig(byId[l.id]?.unit))} ${byId[l.id]?.unit}`)].join("\n"));
          if (canOrder) $(".pp", card).onclick = () => openPO(lines);
        }
      };
      $(".tg", card).oninput = plan; plan();
    });
  };

  // ---------- Products & range / Costing budget (new-product lab) ----------
  const tLab = async which => {
    sp.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const m = await import("./p_prodlab-5C09DB77.js");
      await (which === "products" ? m.productsTab : m.budgetTab)(sp, { mats, VAL, canWrite: canOrder, company, go: reload });
    } catch (e) { sp.innerHTML = `<div class="notice err">Could not load: ${esc(e.message || String(e))}</div>`; }
  };

  const tPrice = async () => {
    sp.innerHTML = '<p class="muted">Loading…</p>';
    try { const m = await import("./p_epdmsprice-B54E92D0.js"); await m.pricingTab(sp, { go: reload }); }
    catch (e) { sp.innerHTML = `<div class="notice err">Could not load: ${esc(e.message || String(e))}</div>`; }
  };

  ({ stock: tStock, rawmat: () => tKind("raw"), pack: () => tKind("pack"), reorder: tReorder, orders: tOrders, bills: tBills, capacity: tCap, products: () => tLab("products"), budget: () => tLab("budget"), pricing: tPrice }[TAB] || tStock)();
}
