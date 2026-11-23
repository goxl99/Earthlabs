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
const TABS = [["stock", "Stock"], ["reorder", "Reorder"], ["orders", "Purchase orders"], ["bills", "Bills"], ["capacity", "FG capacity & planner"]];
const wa = text => window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
let TAB = "stock";

export async function stockPage(el) {
  const canB = hasRole("qc_officer", "admin");
  const [st, mv, rm, pq, cp, cf, bl, lp, vv] = await Promise.all([
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
  ]);
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
  const tabsList = TABS.filter(([k]) => k !== "bills" || canOrder);
  if (TAB === "bills" && !canOrder) TAB = "stock";
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
  const tStock = () => {
    sp.innerHTML = `
    <div class="toolbar"><input id="q" type="search" placeholder="Search item…">
      <select id="ty"><option value="">All items</option><option value="raw">Raw materials</option><option value="packaging">Packaging</option></select>
      ${canOrder ? '<button class="btn" id="addb">＋ Add stock</button>' : ""}</div>
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
    <h3>Current stock</h3><div id="lv"></div>
    <h3>Recent movements</h3><div id="mv"></div>
    <p class="muted small">An item is flagged Low when it is below its minimum level or can't cover ${cover} batches of ${refL} L.
    Stock is deducted with actual quantities when a batch is sent to QA/QC and returned if it is sent back or rejected.</p>`;
    if (canB) {
      const val = r => Number(VAL[r.raw_material_id]?.value) || 0, rawV = S.filter(r => r.category !== "packaging").reduce((t, r) => t + val(r), 0), pkV = S.filter(r => r.category === "packaging").reduce((t, r) => t + val(r), 0);
      const noRate = S.filter(r => Number(r.on_hand) > 0 && (VAL[r.raw_material_id]?.no_rate ?? true)).length, neg = S.filter(r => Number(r.on_hand) < 0).length;
      $("#tv").innerHTML = `<div class="stat good"><div class="stat-l">Raw material at site (value)</div><div class="stat-v">${INR(rawV)}</div><div class="stat-s">Quantity on hand × latest purchase rate</div></div>
        <div class="stat"><div class="stat-l">Packaging at site (value)</div><div class="stat-v">${INR(pkV)}</div></div>
        <div class="stat"><div class="stat-l">Total stock value</div><div class="stat-v">${INR(rawV + pkV)}</div>${noRate ? `<div class="stat-s">${noRate} item(s) in stock have no purchase rate yet</div>` : ""}</div>
        ${neg ? `<div class="stat bad"><div class="stat-l">Items below zero</div><div class="stat-v">${neg}</div><div class="stat-s">Stock not recorded. Add the bills or correct the entries.</div></div>` : ""}`;
    }
    const drawLevels = () => {
      const term = ($("#q").value || "").toLowerCase(), ty = $("#ty").value;
      $("#lv").innerHTML = table([
        { h: "Item", v: r => r.name }, { h: "Type", v: r => TY(r) },
        { h: "On hand", html: r => `<b class="${r.on_hand <= 0 ? "dev" : ""}">${fmt(r.on_hand, r.unit)}</b>` },
        ...(canB ? [{ h: "Latest rate", v: r => VAL[r.raw_material_id]?.rate ? `${INR(VAL[r.raw_material_id].rate)} / ${VAL[r.raw_material_id].rate_unit}` : "No bill yet" },
          { h: "Value", v: r => VAL[r.raw_material_id]?.no_rate ?? true ? "–" : INR(VAL[r.raw_material_id].value) }] : []),
        { h: "On order", v: r => r.on_order > 0 ? fmt(r.on_order, r.unit) : "–" },
        { h: "Minimum", v: r => r.min_level > 0 ? fmt(r.min_level, r.unit) : "–" },
        { h: "Cover", v: r => r.batches_cover == null ? "–" : num(r.batches_cover, 1) + " batches" },
        { h: "Status", html: r => r.on_hand < 0 ? '<span class="dev">⚠ Negative – check entries</span>'
            : r.on_hand === 0 || Number(r.on_hand) === 0 ? '<span class="dev">✖ Out of stock</span>'
            : isLow(r) ? `<span class="dev">⚠ Low – ${why(r)}</span>` : '<span class="okc">✔ OK</span>' },
        ...(isAdmin ? [{ h: "", html: r => `<button class="btn ghost sm mn" data-id="${r.raw_material_id}">Set minimum</button>` }] : []),
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
    drawLevels(); $("#q").oninput = drawLevels; $("#ty").onchange = drawLevels;
    if (isAdmin) $("#rf").onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      if (await run(sb.from("app_settings").upsert([{ key: "rm_cover_batches", value: String(f.rm_cover_batches) },
        { key: "rm_ref_batch_l", value: String(f.rm_ref_batch_l) }]), "Rule saved")) reload();
    };
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
          if (!confirm("Add the matched quantities on this bill to stock? Do this only if the goods have arrived and were not already received through a purchase order.")) return;
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

  ({ stock: tStock, reorder: tReorder, orders: tOrders, bills: tBills, capacity: tCap }[TAB] || tStock)();
}
