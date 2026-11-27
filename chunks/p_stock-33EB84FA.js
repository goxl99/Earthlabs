import{a as sb,e as esc,f as $,g as $$,h as num,i as dfmt,j as dtfmt,m as hasRole,o as toast,p as run,s as table}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// Quantities are stored in the raw material's own base unit (mL or g).
const SMALL = u => u === "mL" || u === "g";
const FAMILY = u => (u === "mL" || u === "L") ? ["mL", "L"] : ["g", "kg"];
const toBase = (q, from, base) => q * (SMALL(from) ? 1 : 1000) / (SMALL(base) ? 1 : 1000);
const fmtQty = (q, u) => {
  const n = Number(q) || 0;
  const big = SMALL(u) && Math.abs(n) >= 1000 ? ` (${num(n / 1000, 2)} ${u === "mL" ? "L" : "kg"})` : "";
  return `${num(n, SMALL(u) ? 0 : 3)} ${esc(u)}${big}`;
};
const MOVE = { receipt: "Received", adjustment: "Adjustment", consumption: "Used in batch" };

export async function stockPage(el) {
  const [lv, mv, rm] = await Promise.all([
    sb.from("raw_material_levels").select("*").order("name"),
    sb.from("raw_material_stock").select("*, raw_materials(name,unit), batches(temp_ref,batch_code)")
      .order("created_at", { ascending: false }).limit(100),
    sb.from("raw_materials").select("*").eq("active", true).order("name"),
  ]);
  if (lv.error) {
    el.innerHTML = '<div class="notice err">Raw material stock is not set up in the database yet. ' +
      'Ask the administrator to apply the inventory migration (db/raw_material_inventory.sql), then reload.</div>';
    return;
  }
  const levels = lv.data || [], moves = mv.data || [], mats = rm.data || [];
  const canAdd = hasRole("qc_officer", "admin"), isAdmin = hasRole("admin");

  el.innerHTML = `
  <div class="toolbar"><input id="q" type="search" placeholder="Search raw material…">
    ${canAdd ? '<button class="btn" id="addb">＋ Add stock</button>' : ""}</div>
  ${canAdd ? `<div class="card hide" id="addc"><h3>Add raw material stock</h3>
    <form id="sf" class="form-grid">
      <label>Raw material<select name="raw_material_id" id="rmsel" required><option value="">Select…</option>
        ${mats.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label>
      <label>Entry type<select name="movement"><option value="receipt">Received (add stock)</option>
        ${isAdmin ? '<option value="adjustment">Stock-take correction (+ or −)</option>' : ""}</select></label>
      <label>Quantity<input name="qty" type="number" step="any" required></label>
      <label>Unit<select name="unit" id="usel"><option>mL</option><option>L</option></select></label>
      <label>Lot no.<input name="lot_no"></label>
      <label>Supplier<input name="supplier"></label>
      <label>Expiry date<input name="expiry_date" type="date"></label>
      <label>Note<input name="note" placeholder="Required for corrections"></label>
      <div><button class="btn" id="sfb">Save</button> <button type="button" class="btn ghost" id="sfc">Cancel</button></div>
    </form></div>` : ""}
  <h3>Current stock</h3><div id="lv"></div>
  <h3>Recent movements</h3><div id="mv"></div>
  <p class="muted small">Stock is deducted automatically with the actual quantities when a batch is sent to QA/QC,
  and returned if the batch is sent back for rework or rejected. Quantities are kept in each material's own unit.</p>`;

  const drawLevels = () => {
    const term = ($("#q").value || "").toLowerCase();
    $("#lv").innerHTML = table([
      { h: "Raw material", v: r => r.name },
      { h: "On hand", html: r => `<b class="${r.on_hand <= 0 ? "dev" : ""}">${fmtQty(r.on_hand, r.unit)}</b>` },
      { h: "Status", html: r => r.on_hand < 0 ? '<span class="dev">⚠ Negative – check entries</span>'
          : r.on_hand === 0 || r.on_hand === "0" ? '<span class="dev">✖ Out of stock</span>' : '<span class="okc">✔ In stock</span>' },
      { h: "Last movement", v: r => r.last_movement ? dtfmt(r.last_movement) : "–" },
    ], levels.filter(r => !term || r.name.toLowerCase().includes(term)), { empty: "No raw materials yet." });
  };
  const drawMoves = () => {
    $("#mv").innerHTML = table([
      { h: "Date", v: r => dtfmt(r.created_at) },
      { h: "Raw material", v: r => r.raw_materials?.name || "" },
      { h: "Type", v: r => MOVE[r.movement] || r.movement },
      { h: "Quantity", html: r => `<b class="${r.qty < 0 ? "dev" : "okc"}">${r.qty > 0 ? "+" : ""}${num(r.qty, 2)} ${esc(r.raw_materials?.unit || "")}</b>` },
      { h: "Lot", v: r => r.lot_no || "–" },
      { h: "Supplier", v: r => r.supplier || "–" },
      { h: "Expiry", v: r => r.expiry_date ? dfmt(r.expiry_date) : "–" },
      { h: "Batch", html: r => r.batch_id ? `<a href="#/batch/${r.batch_id}">${esc(r.batches?.batch_code || r.batches?.temp_ref || "batch")}</a>` : "–" },
      { h: "Note", v: r => r.note || "" },
    ], moves, { empty: "No stock movements yet. Use “Add stock” to record what you have." });
  };
  drawLevels(); drawMoves();
  $("#q").oninput = drawLevels;
  if (!canAdd) return;

  $("#addb").onclick = () => $("#addc").classList.toggle("hide");
  $("#sfc").onclick = () => $("#addc").classList.add("hide");
  $("#rmsel").onchange = () => {
    const m = mats.find(x => x.id === $("#rmsel").value);
    $("#usel").innerHTML = (m ? FAMILY(m.unit) : ["mL", "L"]).map(u => `<option>${u}</option>`).join("");
  };
  $("#sf").onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const m = mats.find(x => x.id === f.raw_material_id), q = Number(f.qty);
    if (!m || !q) return toast("Choose a material and enter a quantity", "err");
    if (f.movement === "receipt" && q <= 0) return toast("Received quantity must be more than zero", "err");
    if (f.movement === "adjustment" && !f.note) return toast("Add a note explaining the correction", "err");
    $("#sfb").disabled = true;
    const ok = await run(sb.from("raw_material_stock").insert({
      raw_material_id: m.id, movement: f.movement, qty: +toBase(q, f.unit, m.unit).toFixed(3),
      lot_no: f.lot_no || null, supplier: f.supplier || null, expiry_date: f.expiry_date || null, note: f.note || null,
    }), "Stock saved");
    $("#sfb").disabled = false;
    if (ok) stockPage(el);
  };
}
