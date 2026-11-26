import{a as sb,e as esc,f as $,g as $$,h as num,m as hasRole,o as toast,p as run,q as modal,s as table,u as xlsx}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// New-product lab.
//  - productsTab / budgetTab : the "Products & range" and "Costing budget" tabs on the Raw Material Stock page
//  - skuLab                  : the "New SKU lab" tab inside Accounts > Unit economics (bottle / shape comparison)
// Prices are per kg (or per litre; 1 kg = 1 L, as in the live formulations). Needs db/product_lab.sql.

const INR = (n, d = 2) => n == null || !isFinite(n) ? "–" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const nn = v => v === "" || v == null || isNaN(Number(v)) ? null : Number(v);
const PCT = v => v == null || !isFinite(v) ? "–" : (v * 100).toFixed(1) + "%";
const wa = text => window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
const stat = (l, v, s = "", cls = "") => `<div class="stat ${cls}"><div class="stat-l">${l}</div><div class="stat-v">${v}</div>${s ? `<div class="stat-s">${s}</div>` : ""}</div>`;
const STATUS = { idea: "Idea", trial: "Trial batch", approved: "Approved", launched: "Launched", dropped: "Dropped" };
const SETUP = '<div class="notice err">The new-product tables are not set up in the database yet. Ask the administrator to run <b>db/product_lab.sql</b> in the Supabase SQL editor, then reload.</div>';
const isMissing = e => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache|Could not find the table/i.test(e.message || ""));
const rmPerKg = (VAL, id) => { const v = VAL && VAL[id]; if (!v || v.rate == null || v.rate === "") return null; const u = String(v.rate_unit || "").toLowerCase(); return Number(v.rate) * (u === "g" || u === "ml" ? 1000 : 1); };
// two-step delete: first click asks "Sure?", second click does it
const arm = (btn, fn, label = "Sure?") => {
  btn.onclick = () => {
    if (btn.dataset.armed) return fn();
    btn.dataset.armed = "1"; const old = btn.textContent; btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3500);
  };
};

// ---------- costing maths ----------
// lines -> cost of 1 kg of blend: today's prices, expected prices, and the market low / high end of each deviation
export const costLines = lines => {
  const out = { pct: 0, now: 0, exp: 0, hi: 0, lo: 0, missing: 0, rows: [] };
  (lines || []).forEach(l => {
    const p = Number(l.pct) || 0, cur = nn(l.current_rate), ex = nn(l.expected_rate), dv = (Number(l.deviation_pct) || 0) / 100;
    const e = ex ?? cur, c = cur ?? ex, miss = e == null, eb = e ?? 0, cb = c ?? 0, w = p / 100;
    if (miss && p > 0) out.missing++;
    out.pct += p; out.now += w * cb; out.exp += w * eb; out.hi += w * eb * (1 + dv); out.lo += w * eb * (1 - dv);
    out.rows.push({ name: l.item_name, p, rate: eb, miss, perKg: w * eb, perKgHi: w * eb * (1 + dv), dv: dv * 100 });
  });
  return out;
};
// product budget parameters + lines -> cost of one batch in three price cases
export const budgetOf = (pr, lines) => {
  const c = costLines(lines), L = Number(pr.batch_size_l) || 0, kg = L * (Number(pr.density) || 1), f = 1 + (Number(pr.process_loss_pct) || 0) / 100;
  const conv = (Number(pr.labour_per_batch) || 0) + (Number(pr.power_per_batch) || 0) + (Number(pr.other_per_batch) || 0), cont = (Number(pr.contingency_pct) || 0) / 100;
  const col = perKg => { const rm = perKg * kg * f, contingency = (rm + conv) * cont, total = rm + conv + contingency; return { rm, conv, contingency, total, perL: L ? total / L : null, perKg: kg ? total / kg : null }; };
  return { c, L, kg, f, conv, best: col(c.lo), exp: col(c.exp), high: col(c.hi), target: nn(pr.target_cost_per_l) };
};

// ---------- data ----------
let PSEL = null;   // product open in the editor: null = list, "new" = new product, or an id
let BSEL = null;   // product shown in the costing budget
let RFILT = "";    // range filter on the product list

const load = async () => {
  const [rg, pr, ln] = await Promise.all([
    sb.from("product_ranges").select("*").order("name"),
    sb.from("dev_products").select("*").order("created_at", { ascending: false }),
    sb.from("dev_product_lines").select("*").order("sort_order"),
  ]);
  const err = rg.error || pr.error || ln.error; if (err) throw err;
  const lines = {}; (ln.data || []).forEach(l => (lines[l.dev_product_id] ||= []).push(l));
  return { ranges: rg.data || [], prods: pr.data || [], lines };
};
const guard = async (sp, fn) => {
  let D; try { D = await load(); } catch (e) { sp.innerHTML = isMissing(e) ? SETUP : `<div class="notice err">Could not load: ${esc(e.message || String(e))}</div>`; return null; }
  return D;
};
const linePayload = l => ({ raw_material_id: l.raw_material_id || null, item_name: l.item_name, pct: l.pct, current_rate: l.current_rate, expected_rate: l.expected_rate, deviation_pct: l.deviation_pct, notes: l.notes || null });

// =====================================================================================
// PRODUCTS & RANGE tab
// =====================================================================================
export async function productsTab(sp, ctx) {
  const D = await guard(sp); if (!D) return;
  if (PSEL) { const ok = await editor(sp, ctx, D); if (ok !== false) return; PSEL = null; }
  list(sp, ctx, D);
}

const list = (sp, ctx, D) => {
  const rname = Object.fromEntries(D.ranges.map(r => [r.id, r.name]));
  const info = p => { const c = costLines(D.lines[p.id]), b = budgetOf(p, D.lines[p.id]), d = Number(p.density) || 1; return { c, b, perL: c.exp * d, lo: c.lo * d, hi: c.hi * d }; };
  const open = D.prods.filter(p => p.status !== "dropped"), inf = open.map(p => ({ p, i: info(p) })).filter(x => x.i.c.exp > 0);
  const cheapest = inf.slice().sort((a, b) => a.i.perL - b.i.perL)[0], noPrice = open.filter(p => info(p).c.missing > 0).length;
  sp.innerHTML = `<p class="muted small">Try out new products and whole product ranges before they reach production. Each product has a formulation where every row carries the raw material price, the price you expect to pay, and a ± market deviation. This is a sandbox: it does not change your live products or batches.</p>
    <div class="toolbar"><input id="pq" type="search" placeholder="Search product…">
      <select id="pr"><option value="">All ranges</option>${D.ranges.map(r => `<option value="${r.id}" ${RFILT === r.id ? "selected" : ""}>${esc(r.name)} (${D.prods.filter(p => p.range_id === r.id).length})</option>`).join("")}<option value="none" ${RFILT === "none" ? "selected" : ""}>No range (${D.prods.filter(p => !p.range_id).length})</option></select>
      <button class="btn ghost" id="rgs">Ranges</button><button class="btn" id="newp">＋ New product</button></div>
    <div class="stats">${stat("Products being tried", open.length, `${D.prods.length - open.length} dropped`)}${stat("Product ranges", D.ranges.length)}
      ${cheapest ? stat("Cheapest to make", INR(cheapest.i.perL) + " / L", esc(cheapest.p.name) + " · raw material, expected prices", "good") : ""}
      ${noPrice ? stat("Missing prices", noPrice, "product(s) have ingredients with no price yet", "warn") : ""}</div>
    <div id="pl"></div>`;
  const draw = () => {
    const term = ($("#pq", sp).value || "").toLowerCase(); RFILT = $("#pr", sp).value;
    const rows = D.prods.filter(p => (!term || `${p.name} ${p.variant || ""}`.toLowerCase().includes(term)) && (!RFILT || (RFILT === "none" ? !p.range_id : p.range_id === RFILT)));
    $("#pl", sp).innerHTML = table([
      { h: "Product", html: p => `<b>${esc(p.name)}</b>${p.variant ? `<br><small class="muted">${esc(p.variant)}</small>` : ""}` },
      { h: "Range", v: p => rname[p.range_id] || "–" },
      { h: "Status", html: p => `<span class="lab-st st-${p.status}">${STATUS[p.status] || p.status}</span>` },
      { h: "Ingredients", html: p => { const c = info(p).c, ok = Math.abs(c.pct - 100) < 0.01 || !c.rows.length; return `${c.rows.length}${c.rows.length ? ` <small class="${ok ? "muted" : "dev"}">(${num(c.pct, 2)}%)</small>` : ""}`; } },
      { h: "Raw material / L", html: p => { const i = info(p); return i.c.exp ? `<b>${INR(i.perL)}</b>${i.c.missing ? ' <small class="dev">prices missing</small>' : ""}` : "–"; } },
      { h: "Market range / L", v: p => { const i = info(p); return i.c.exp ? `${INR(i.lo)} – ${INR(i.hi)}` : "–"; } },
      { h: "Budget ceiling / L", v: p => { const i = info(p); return i.c.exp ? INR(i.b.high.perL) : "–"; } },
      { h: "", html: p => `<button class="btn ghost sm po" data-id="${p.id}">Open</button> <button class="btn ghost sm pb" data-id="${p.id}">Budget</button> <button class="btn ghost sm pc" data-id="${p.id}">Copy</button> <button class="btn ghost sm pd" data-id="${p.id}">Delete</button>` },
    ], rows, { empty: D.prods.length ? "No products match." : "No products yet. Press “＋ New product” to start. You can copy a live product's formulation to save time." });
    $$(".po", sp).forEach(b => b.onclick = () => { PSEL = b.dataset.id; ctx.go("products"); });
    $$(".pb", sp).forEach(b => b.onclick = () => { BSEL = b.dataset.id; ctx.go("budget"); });
    $$(".pc", sp).forEach(b => b.onclick = async () => {
      const p = D.prods.find(x => x.id === b.dataset.id);
      const id = await run(sb.rpc("save_dev_product", { p: { name: p.name + " (copy)", variant: p.variant, range_id: p.range_id, base_product_id: p.base_product_id, status: "idea", notes: p.notes, density: p.density, lines: (D.lines[p.id] || []).map(linePayload) } }), "Copied");
      if (id) ctx.go("products");
    });
    $$(".pd", sp).forEach(b => arm(b, async () => { if (await run(sb.from("dev_products").delete().eq("id", b.dataset.id), "Deleted")) ctx.go("products"); }));
  };
  $("#pq", sp).oninput = draw; $("#pr", sp).onchange = draw; draw();
  $("#newp", sp).onclick = () => { PSEL = "new"; ctx.go("products"); };
  $("#rgs", sp).onclick = () => rangesModal(ctx, D);
};

const rangesModal = (ctx, D) => modal("Product ranges", `<p class="muted small">A range is a family of products, for example “Herbal hand wash” (all sizes and variants) or “Floor cleaners”. Deleting a range keeps its products.</p>
  <form id="rgf" class="row"><input name="name" placeholder="New range name" required style="flex:1;min-width:180px"><button class="btn">Add range</button></form>
  <div id="rgl">${D.ranges.length ? "" : '<p class="muted">No ranges yet.</p>'}</div>`, {
  onMount: (m, close) => {
    $("#rgl", m).innerHTML = D.ranges.map(r => `<div class="row" data-id="${r.id}"><input class="rn" value="${esc(r.name)}" style="flex:1;min-width:160px"><small class="muted">${D.prods.filter(p => p.range_id === r.id).length} product(s)</small><button class="btn ghost sm rs">Save</button><button class="btn ghost sm rd">Delete</button></div>`).join("");
    $("#rgf", m).onsubmit = async e => {
      e.preventDefault(); const name = new FormData(e.target).get("name").trim(); if (!name) return;
      if (await run(sb.from("product_ranges").insert({ name }), "Range added")) { close(); ctx.go("products"); }
    };
    $$(".rs", m).forEach(b => b.onclick = async () => {
      const row = b.closest("[data-id]"), name = $(".rn", row).value.trim(); if (!name) return toast("Give the range a name", "err");
      if (await run(sb.from("product_ranges").update({ name }).eq("id", row.dataset.id), "Saved")) { close(); ctx.go("products"); }
    });
    $$(".rd", m).forEach(b => arm(b, async () => { if (await run(sb.from("product_ranges").delete().eq("id", b.closest("[data-id]").dataset.id), "Range deleted")) { if (RFILT === b.closest("[data-id]").dataset.id) RFILT = ""; close(); ctx.go("products"); } }));
  } });

// ---------- product editor ----------
const editor = async (sp, ctx, D) => {
  const isNew = PSEL === "new", src = isNew ? null : D.prods.find(p => p.id === PSEL);
  if (!isNew && !src) return false;
  const mats = (ctx.mats || []).filter(m => m.category !== "packaging"), byId = Object.fromEntries(mats.map(m => [m.id, m]));
  const P = isNew ? { name: "", variant: "", range_id: RFILT && RFILT !== "none" ? RFILT : "", status: "idea", notes: "", density: 1, base_product_id: null } : { ...src };
  let lines = isNew ? [] : (D.lines[src.id] || []).map(l => ({ ...l })), dirty = false, live = [], liveF = [];
  if (isNew) {
    const [lp, lf] = await Promise.all([sb.from("products").select("id,name,variant").eq("active", true).order("name"), sb.from("formulations").select("product_id,raw_material_id,required_pct")]);
    live = lp.data || []; liveF = lf.data || [];
  }
  const blankRow = () => ({ raw_material_id: null, item_name: "", pct: "", current_rate: null, expected_rate: null, deviation_pct: 0, notes: "" });
  if (!lines.length) lines.push(blankRow());
  const rate = id => rmPerKg(ctx.VAL, id);

  sp.innerHTML = `<div class="row between"><button class="btn ghost sm" id="back">← All products</button><span class="muted small">${isNew ? "New product" : "Editing"}</span></div>
    ${isNew ? `<div class="card"><label>Start from <select id="from"><option value="">Blank – I'll type the formulation</option>
      ${live.length ? `<optgroup label="Copy a live product's formulation">${live.map(p => `<option value="live:${p.id}">${esc(p.name)}${p.variant ? " – " + esc(p.variant) : ""}</option>`).join("")}</optgroup>` : ""}
      ${D.prods.length ? `<optgroup label="Copy another product in this lab">${D.prods.map(p => `<option value="dev:${p.id}">${esc(p.name)}${p.variant ? " – " + esc(p.variant) : ""}</option>`).join("")}</optgroup>` : ""}</select></label>
      <p class="muted small">Copying fills the ingredient rows and today's prices; change whatever the new product does differently.</p></div>` : ""}
    <div class="card"><form id="pf" class="form-grid" onsubmit="return false">
      <label>Product name<input id="pn" required value="${esc(P.name)}" placeholder="e.g. Lemon Herbal Hand Wash"></label>
      <label>Variant / size note<input id="pv" value="${esc(P.variant || "")}" placeholder="e.g. 250 ml, citrus"></label>
      <label>Range<select id="prg"><option value="">No range</option>${D.ranges.map(r => `<option value="${r.id}" ${P.range_id === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label>
      <label>Status<select id="pst">${Object.entries(STATUS).map(([k, t]) => `<option value="${k}" ${P.status === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Density (kg per litre)<input id="pd" type="number" step="any" min="0.01" value="${P.density ?? 1}"></label>
      <label class="full">Notes<input id="pnt" value="${esc(P.notes || "")}" placeholder="Fragrance, positioning, who it is for…"></label></form></div>
    <div class="card"><h3>Formulation &amp; prices</h3>
      <p class="muted small">Prices are ₹ per kg (or per litre). <b>Raw material price</b> is what you pay today. <b>Expected price</b> is what you plan to pay (blank = use today's). <b>Market ±%</b> is how far the price can swing with the market; it sets the low and high cost.</p>
      <div class="tbl-wrap" id="ltab"></div>
      <div class="row"><button type="button" class="btn ghost sm" id="addrow">＋ Add row</button><button type="button" class="btn ghost sm" id="fillp">Fill prices from latest bills</button><button type="button" class="btn ghost sm" id="usecur">Use today's price as expected</button></div>
      <div class="stats" id="ptot"></div></div>
    <div class="row end"><button class="btn ghost" id="sbud">Save &amp; open costing budget</button><button class="btn" id="save">Save product</button></div>`;

  const lt = $("#ltab", sp);
  const calc = () => {
    const c = costLines(lines), d = Number($("#pd", sp).value) || 1, tot = c.rows.reduce((t, r) => t + r.perKg, 0) || 0;
    $$("tr[data-i]", lt).forEach(tr => { const r = c.rows[tr.dataset.i]; if (!r) return; $("[data-c=cost]", tr).textContent = r.miss && r.p > 0 ? "no price" : INR(r.perKg, 3); $("[data-c=share]", tr).textContent = tot ? (r.perKg / tot * 100).toFixed(1) + "%" : "–"; });
    const ok = Math.abs(c.pct - 100) < 0.01;
    $("#ptot", sp).innerHTML = stat("Formulation adds up to", num(c.pct, 2) + "%", ok ? "Good" : "Should be 100%", ok ? "good" : "bad")
      + stat("Raw material per litre – expected", INR(c.exp * d), `${INR(c.exp * d / 1000, 4)} per ml · today's prices ${INR(c.now * d)}`)
      + stat("Market range per litre", `${INR(c.lo * d)} – ${INR(c.hi * d)}`, "Low to high, from the ± market %")
      + (c.missing ? stat("Rows with no price", c.missing, "Counted as ₹0 until priced", "warn") : "");
  };
  const drawRows = () => {
    lt.innerHTML = `<table class="tbl edit"><thead><tr><th>Raw material</th><th>% of batch</th><th>Raw material price ₹/kg</th><th>Expected price ₹/kg</th><th>Market ± %</th><th>Cost per kg of product</th><th>Share</th><th>Note</th><th></th></tr></thead><tbody>${lines.map((l, i) => `<tr data-i="${i}">
      <td style="min-width:200px"><select data-f="raw_material_id"><option value="">New ingredient (type name)</option>${mats.map(m => `<option value="${m.id}" ${m.id === l.raw_material_id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>${l.raw_material_id ? "" : `<input data-f="item_name" placeholder="Ingredient name" value="${esc(l.item_name || "")}" style="margin-top:4px">`}</td>
      <td><input data-f="pct" type="number" step="any" min="0" max="100" value="${l.pct ?? ""}" style="width:84px"></td>
      <td><input data-f="current_rate" type="number" step="any" min="0" value="${l.current_rate ?? ""}" style="width:104px"></td>
      <td><input data-f="expected_rate" type="number" step="any" min="0" value="${l.expected_rate ?? ""}" style="width:104px"></td>
      <td><input data-f="deviation_pct" type="number" step="any" min="0" max="100" value="${l.deviation_pct ?? 0}" style="width:78px"></td>
      <td class="num" data-c="cost"></td><td class="num" data-c="share"></td>
      <td><input data-f="notes" value="${esc(l.notes || "")}" style="min-width:120px"></td>
      <td><button type="button" class="btn ghost sm del" title="Remove row">✕</button></td></tr>`).join("")}</tbody></table>`;
    calc();
  };
  lt.addEventListener("input", e => {
    const tr = e.target.closest("tr[data-i]"), f = e.target.dataset.f; if (!tr || !f || f === "raw_material_id") return;
    const l = lines[tr.dataset.i]; dirty = true;
    l[f] = f === "item_name" || f === "notes" ? e.target.value : (e.target.value === "" ? (f === "deviation_pct" ? 0 : null) : Number(e.target.value));
    if (f === "pct" && e.target.value === "") l.pct = "";
    calc();
  });
  lt.addEventListener("change", e => {
    const tr = e.target.closest("tr[data-i]"); if (!tr || e.target.dataset.f !== "raw_material_id") return;
    const l = lines[tr.dataset.i], id = e.target.value || null; dirty = true; l.raw_material_id = id;
    if (id) { l.item_name = byId[id]?.name || l.item_name; const r = rate(id); if (r != null && (l.current_rate == null || l.current_rate === "")) l.current_rate = r; }
    drawRows();
  });
  lt.addEventListener("click", e => { const d = e.target.closest(".del"); if (!d) return; lines.splice(d.closest("tr").dataset.i, 1); if (!lines.length) lines.push(blankRow()); dirty = true; drawRows(); });
  $("#addrow", sp).onclick = () => { lines.push(blankRow()); dirty = true; drawRows(); };
  $("#fillp", sp).onclick = () => { let n = 0; lines.forEach(l => { const r = l.raw_material_id ? rate(l.raw_material_id) : null; if (r != null) { l.current_rate = r; n++; } }); dirty = true; drawRows(); toast(n ? `Filled ${n} price(s) from your latest bills / estimates` : "No bill or estimated prices found for these materials", n ? "ok" : "err"); };
  $("#usecur", sp).onclick = () => { let n = 0; lines.forEach(l => { if ((l.expected_rate == null || l.expected_rate === "") && l.current_rate != null && l.current_rate !== "") { l.expected_rate = l.current_rate; n++; } }); dirty = true; drawRows(); toast(n ? `Copied ${n} price(s)` : "Nothing to copy"); };
  $("#pd", sp).oninput = calc;
  $("#pf", sp).addEventListener("input", () => { dirty = true; });
  if (isNew) $("#from", sp).onchange = e => {
    const v = e.target.value; if (!v) return; const [kind, id] = v.split(":"); dirty = true;
    if (kind === "live") { lines = liveF.filter(f => f.product_id === id).sort((a, b) => b.required_pct - a.required_pct).map(f => ({ raw_material_id: f.raw_material_id, item_name: byId[f.raw_material_id]?.name || "", pct: Number(f.required_pct), current_rate: rate(f.raw_material_id), expected_rate: null, deviation_pct: 0, notes: "" })); P.base_product_id = id; }
    else { lines = (D.lines[id] || []).map(l => ({ ...l })); P.base_product_id = null; }
    if (!lines.length) lines.push(blankRow());
    const base = (kind === "live" ? live : D.prods).find(p => p.id === id); if (base && !$("#pn", sp).value) $("#pn", sp).value = base.name + (kind === "dev" ? " (new)" : " – new version");
    drawRows(); toast("Formulation copied. Edit the rows below.");
  };
  const back = $("#back", sp);
  back.onclick = () => { if (dirty && !back.dataset.armed) { back.dataset.armed = "1"; back.textContent = "Discard changes?"; setTimeout(() => { delete back.dataset.armed; back.textContent = "← All products"; }, 3500); return; } PSEL = null; ctx.go("products"); };

  const save = async openBudget => {
    const name = $("#pn", sp).value.trim(); if (!name) return toast("Give the product a name", "err");
    const ls = lines.filter(l => l.raw_material_id || (l.item_name || "").trim() || (l.pct !== "" && l.pct != null));
    for (const l of ls) { if (l.raw_material_id && !l.item_name) l.item_name = byId[l.raw_material_id]?.name || ""; if (!(l.item_name || "").trim()) return toast("Every row needs a raw material or an ingredient name", "err"); if (!(Number(l.pct) >= 0) || l.pct === "") return toast(`Enter the % of batch for ${l.item_name}`, "err"); }
    const c = costLines(ls); if (c.pct > 100.0001) return toast(`The formulation adds up to ${num(c.pct, 2)}%. It cannot be more than 100%.`, "err");
    $("#save", sp).disabled = $("#sbud", sp).disabled = true;
    const id = await run(sb.rpc("save_dev_product", { p: { id: isNew ? null : src.id, name, variant: $("#pv", sp).value, range_id: $("#prg", sp).value || null, base_product_id: P.base_product_id, status: $("#pst", sp).value, notes: $("#pnt", sp).value, density: Number($("#pd", sp).value) || 1, lines: ls.map(linePayload) } }), "Product saved");
    $("#save", sp).disabled = $("#sbud", sp).disabled = false;
    if (!id) return;
    dirty = false; PSEL = id; if (openBudget) { BSEL = id; ctx.go("budget"); } else ctx.go("products");
  };
  $("#save", sp).onclick = () => save(false); $("#sbud", sp).onclick = () => save(true);
  drawRows();
};

// =====================================================================================
// COSTING BUDGET tab
// =====================================================================================
export async function budgetTab(sp, ctx) {
  const D = await guard(sp); if (!D) return;
  if (!D.prods.length) { sp.innerHTML = '<div class="notice">No products yet. Add one in the <b>Products &amp; range</b> tab, then come back to budget it.</div>'; return; }
  if (!D.prods.some(p => p.id === BSEL)) BSEL = (D.prods.find(p => p.status !== "dropped") || D.prods[0]).id;
  const rname = Object.fromEntries(D.ranges.map(r => [r.id, r.name]));
  const canW = ctx.canWrite !== false;
  const glance = D.prods.filter(p => p.status !== "dropped" || p.id === BSEL).map(p => ({ p, b: budgetOf(p, D.lines[p.id]) }));
  sp.innerHTML = `<p class="muted small">A costing budget for one batch: raw material at your expected prices, a market allowance from each row's ± deviation, conversion cost and a contingency. The <b>budget ceiling</b> assumes every price lands at the high end of its range, so it is the safe number to approve.</p>
    <div class="card"><h3>All products at a glance</h3><div id="gl"></div></div>
    <div class="toolbar"><label style="flex:1;min-width:220px">Budget for <select id="bsel">${D.prods.map(p => `<option value="${p.id}" ${p.id === BSEL ? "selected" : ""}>${esc(p.name)}${p.variant ? " – " + esc(p.variant) : ""}${p.status === "dropped" ? " (dropped)" : ""}</option>`).join("")}</select></label></div>
    <div id="bd"></div>`;
  $("#gl", sp).innerHTML = table([
    { h: "Product", html: x => `<b>${esc(x.p.name)}</b>${x.p.variant ? `<br><small class="muted">${esc(x.p.variant)}</small>` : ""}` },
    { h: "Range", v: x => rname[x.p.range_id] || "–" },
    { h: "Batch", v: x => num(x.b.L, 1) + " L" },
    { h: "Expected / L", v: x => x.b.c.exp ? INR(x.b.exp.perL) : "–" },
    { h: "Ceiling / L", v: x => x.b.c.exp ? INR(x.b.high.perL) : "–" },
    { h: "Target / L", v: x => x.b.target == null ? "–" : INR(x.b.target) },
    { h: "Against target", html: x => !x.b.c.exp || x.b.target == null ? "–" : x.b.high.perL <= x.b.target ? '<span class="okc">✔ Within target</span>' : x.b.exp.perL <= x.b.target ? '<span class="lab-warn">⚠ Only if prices stay near expected</span>' : '<span class="dev">✖ Over target</span>' },
    { h: "", html: x => `<button class="btn ghost sm go" data-id="${x.p.id}">Open</button>` },
  ], glance, { empty: "" });
  $$(".go", sp).forEach(b => b.onclick = () => { BSEL = b.dataset.id; ctx.go("budget"); });
  $("#bsel", sp).onchange = e => { BSEL = e.target.value; ctx.go("budget"); };

  const prod = D.prods.find(p => p.id === BSEL), lines = D.lines[prod.id] || [], bd = $("#bd", sp);
  const fields = [["batch_size_l", "Batch size (L)", 1], ["process_loss_pct", "Process loss / wastage (%)", 0], ["labour_per_batch", "Labour per batch (₹)", 0], ["power_per_batch", "Power & utilities per batch (₹)", 0], ["other_per_batch", "QC, consumables & other per batch (₹)", 0], ["contingency_pct", "Contingency (%)", 0], ["target_cost_per_l", "Target cost per litre (₹)", 0]];
  bd.innerHTML = `<div class="card"><h3>Budget for ${esc(prod.name)}${prod.variant ? " – " + esc(prod.variant) : ""}</h3>
    ${!lines.length ? '<div class="notice warn">This product has no formulation rows yet. Add them in <b>Products &amp; range</b> to get a cost.</div>' : ""}
    <form id="bf" class="form-grid" onsubmit="return false">${fields.map(([k, l, min]) => `<label>${l}<input data-k="${k}" type="number" step="any" min="${min ? "0.001" : "0"}" value="${prod[k] ?? ""}" ${k === "target_cost_per_l" ? 'placeholder="optional"' : ""}></label>`).join("")}</form>
    <div class="row end">${canW ? '<button class="btn" id="bsave">Save budget settings</button>' : ""}</div></div>
    <div id="bres"></div>`;
  const read = () => { const o = { ...prod }; $$("#bf [data-k]", bd).forEach(i => { o[i.dataset.k] = i.value === "" ? (i.dataset.k === "target_cost_per_l" ? null : 0) : Number(i.value); }); return o; };
  let last = null;
  const paint = () => {
    const pr = read(), b = budgetOf(pr, lines), c = b.c; last = { pr, b };
    const warn = [];
    if (c.missing) warn.push(`${c.missing} ingredient(s) have no price, so they count as ₹0 and the budget is understated.`);
    if (c.rows.length && Math.abs(c.pct - 100) > 0.01) warn.push(`The formulation adds up to ${num(c.pct, 2)}%, not 100%.`);
    const tg = b.target, ceil = b.high.perL, cls = tg == null ? "" : ceil <= tg ? "good" : b.exp.perL <= tg ? "warn" : "bad";
    const col = k => b[k], row = (l, fn, bold = false) => `<tr${bold ? ' style="font-weight:600"' : ""}><td>${l}</td>${["best", "exp", "high"].map(k => `<td style="text-align:right">${fn(col(k), k)}</td>`).join("")}</tr>`;
    const rows = c.rows.map(r => ({ ...r, batch: r.perKg * b.kg * b.f, mkt: (r.perKgHi - r.perKg) * b.kg * b.f })), totRm = rows.reduce((t, r) => t + r.batch, 0), byMkt = rows.slice().sort((x, y) => y.mkt - x.mkt).slice(0, 3).filter(r => r.mkt > 0).map(r => r.name);
    $("#bres", bd).innerHTML = `${warn.length ? `<div class="notice warn">${warn.map(esc).join("<br>")}</div>` : ""}
      <div class="stats">${stat("Budget ceiling per batch", INR(b.high.total, 0), `${num(b.L, 1)} L · market-high prices`, cls)}${stat("Budget ceiling per litre", INR(ceil), tg == null ? "Set a target to compare" : ceil <= tg ? `Within the ${INR(tg)} target` : `${INR(ceil - tg)} over the ${INR(tg)} target`, cls)}${stat("Expected per litre", INR(b.exp.perL), `Per batch ${INR(b.exp.total, 0)}`)}${stat("Cheapest case per litre", INR(b.best.perL), "Prices at the low end")}</div>
      <div class="card"><h3>Costing budget – per batch of ${num(b.L, 1)} L</h3><div class="tbl-wrap"><table class="tbl keep"><thead><tr><th>₹</th><th style="text-align:right">Best case<br><small>prices low</small></th><th style="text-align:right">Expected<br><small>expected prices</small></th><th style="text-align:right">Budget ceiling<br><small>prices high</small></th></tr></thead><tbody>
        ${row("Raw material" + (pr.process_loss_pct > 0 ? ` (incl. ${num(pr.process_loss_pct, 1)}% loss)` : ""), x => INR(x.rm))}${row("Conversion (labour, power, other)", x => INR(x.conv))}${row("Contingency (" + num(pr.contingency_pct, 1) + "%)", x => INR(x.contingency))}
        ${row("TOTAL per batch", x => INR(x.total), true)}${row("Per litre", x => INR(x.perL), true)}${row("Per kg", x => INR(x.perKg))}
        ${tg != null ? row("Against target (" + INR(tg) + " / L)", x => x.perL == null ? "–" : `<span class="${x.perL <= tg ? "okc" : "dev"}">${x.perL <= tg ? "−" : "+"}${INR(Math.abs(x.perL - tg))}</span>`) : ""}
        </tbody></table></div></div>
      <div class="card"><h3>Where the raw material money goes</h3>${table([
        { h: "Ingredient", html: r => `<b>${esc(r.name)}</b>${byMkt.includes(r.name) ? ' <span class="lab-st st-trial">watch price</span>' : ""}` }, { h: "% of batch", v: r => num(r.p, 2) },
        { h: "Expected price ₹/kg", v: r => r.miss ? "no price" : INR(r.rate) }, { h: "Cost per batch", v: r => INR(r.batch) }, { h: "Share of raw material", v: r => totRm ? (r.batch / totRm * 100).toFixed(1) + "%" : "–" },
        { h: "Market effect per batch", html: r => r.mkt > 0 ? `<span class="dev">+${INR(r.mkt)}</span> <small class="muted">(±${num(r.dv, 1)}%)</small>` : "–" }], rows.slice().sort((x, y) => y.batch - x.batch), { empty: "No ingredients yet." })}</div>
      <div class="row end"><button class="btn ghost" id="bwa">Share on WhatsApp</button><button class="btn ghost" id="bxl">Download Excel</button></div>`;
    $("#bwa", bd).onclick = () => wa([`*Costing budget – ${prod.name}${prod.variant ? " (" + prod.variant + ")" : ""}* – ${ctx.company || "EarthLabs"}`, `Batch: ${num(b.L, 1)} L`,
      `Expected: ${INR(b.exp.total, 0)} per batch (${INR(b.exp.perL)} / L)`, `Budget ceiling: ${INR(b.high.total, 0)} per batch (${INR(b.high.perL)} / L)`, tg != null ? `Target: ${INR(tg)} / L` : null, "",
      "Biggest cost lines:", ...rows.slice().sort((x, y) => y.batch - x.batch).slice(0, 4).map(r => `• ${r.name}: ${INR(r.batch, 0)} (${totRm ? Math.round(r.batch / totRm * 100) : 0}%)`)].filter(x => x !== null).join("\n"));
    $("#bxl", bd).onclick = () => xlsx(`Costing budget - ${prod.name}`.replace(/[\\/:*?"<>|]/g, "-"), {
      Budget: [{ Item: "Batch size (L)", "Best case": b.L, Expected: b.L, "Budget ceiling": b.L }, ...[["Raw material", "rm"], ["Conversion", "conv"], ["Contingency", "contingency"], ["Total per batch", "total"], ["Per litre", "perL"], ["Per kg", "perKg"]].map(([l, k]) => ({ Item: l, "Best case": +b.best[k]?.toFixed(2), Expected: +b.exp[k]?.toFixed(2), "Budget ceiling": +b.high[k]?.toFixed(2) })), ...(tg != null ? [{ Item: "Target per litre", Expected: tg }] : [])],
      Ingredients: rows.map(r => ({ Ingredient: r.name, "% of batch": r.p, "Expected price per kg": r.miss ? "" : +r.rate.toFixed(2), "Market +/- %": r.dv, "Cost per batch": +r.batch.toFixed(2), "Market effect per batch": +r.mkt.toFixed(2) })) });
  };
  $$("#bf [data-k]", bd).forEach(i => i.oninput = paint); paint();
  if (canW) $("#bsave", bd).onclick = async () => {
    const o = read(); if (!(o.batch_size_l > 0)) return toast("Batch size must be above zero", "err");
    if (await run(sb.from("dev_products").update({ batch_size_l: o.batch_size_l, process_loss_pct: o.process_loss_pct, labour_per_batch: o.labour_per_batch, power_per_batch: o.power_per_batch, other_per_batch: o.other_per_batch, contingency_pct: o.contingency_pct, target_cost_per_l: o.target_cost_per_l, updated_at: new Date().toISOString() }).eq("id", prod.id), "Budget saved")) ctx.go("budget");
  };
};

// =====================================================================================
// SKU LAB (Accounts > Unit economics): compare bottles and shapes for a new SKU
// =====================================================================================
const SHAPES = ["Round", "Oval", "Square", "Slim / flat", "Tall cylinder", "Jar / wide mouth", "Pump bottle", "Flip-top bottle", "Pouch / refill", "Jerry can", "Other"];
const MATERIALS = ["PET", "HDPE", "PP", "Glass", "Aluminium", "Laminate pouch", "Other"];
const CLOSURES = ["Flip-top cap", "Pump dispenser", "Foaming pump", "Screw cap", "Disc-top cap", "Spout / nozzle", "Heat seal", "Other"];
const SHAPE_SVG = {
  "Round": '<rect x="10" y="22" width="20" height="30" rx="4"/><rect x="16" y="14" width="8" height="8"/><rect x="14" y="8" width="12" height="6" rx="1"/>',
  "Oval": '<ellipse cx="20" cy="38" rx="13" ry="15"/><rect x="16" y="15" width="8" height="8"/><rect x="14" y="8" width="12" height="7" rx="1"/>',
  "Square": '<rect x="8" y="22" width="24" height="30" rx="2"/><rect x="16" y="14" width="8" height="8"/><rect x="14" y="8" width="12" height="6" rx="1"/>',
  "Slim / flat": '<rect x="13" y="20" width="14" height="32" rx="3"/><rect x="17" y="13" width="6" height="7"/><rect x="15" y="8" width="10" height="5" rx="1"/>',
  "Tall cylinder": '<rect x="12" y="16" width="16" height="36" rx="3"/><rect x="16" y="10" width="8" height="6"/><rect x="14" y="5" width="12" height="5" rx="1"/>',
  "Jar / wide mouth": '<rect x="6" y="26" width="28" height="26" rx="4"/><rect x="8" y="17" width="24" height="9" rx="2"/>',
  "Pump bottle": '<rect x="10" y="24" width="20" height="28" rx="4"/><rect x="17" y="16" width="6" height="8"/><path d="M20 16V8h10v4"/>',
  "Flip-top bottle": '<rect x="10" y="24" width="20" height="28" rx="4"/><path d="M14 24l2-9h8l2 9"/>',
  "Pouch / refill": '<path d="M8 12h24l4 40H4z"/><path d="M8 17h24"/>',
  "Jerry can": '<rect x="6" y="18" width="28" height="34" rx="3"/><path d="M12 18v-7h10v7"/><circle cx="27" cy="13" r="3"/>',
  "Other": '<rect x="9" y="14" width="22" height="38" rx="4" stroke-dasharray="3 3"/>',
};
const shapeIcon = s => `<svg class="shp" viewBox="0 0 40 56" width="30" height="42" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${SHAPE_SVG[s] || SHAPE_SVG.Other}</svg>`;
const SH = [["Liquid", ["bulk_kg", "density", "overfill", "loss"]], ["Price & trade", ["gst", "retailer", "distributor", "scheme", "returns"]], ["Conversion per unit", ["labour", "power", "consumables"]],
  ["Packaging", ["wastage"]], ["Selling & finance", ["commission", "marketing", "baddebt", "credit_days", "interest", "target_cm"]], ["Fixed costs (this SKU's share, per month)", ["fixed_cash", "depreciation"]]];
const VNUM = ["fill_ml", "mrp", "monthly_units", "primary", "closure", "label", "inner", "units_per_carton", "carton", "tape", "freight_carton", "moq"];
const mkVar = name => ({ name, shape: "Round", material: "PET", closure_type: "Flip-top cap", vendor: "", notes: "", moq: "", fill_ml: 250, mrp: "", monthly_units: "", primary: "", closure: "", label: "", inner: "", units_per_carton: "", carton: "", tape: "", freight_carton: "" });
const LETTERS = "ABCDEF";

export async function skuLab(host, ctx) {
  const { ueModel, UE, askAI } = ctx, LBL = Object.fromEntries(UE.flatMap(([, fs]) => fs.map(([k, l, u]) => [k, [l, u]])));
  host.innerHTML = '<p class="muted">Loading…</p>';
  const [sc, dp, ln, ue, pk, vv] = await Promise.all([
    sb.from("sku_scenarios").select("*").order("updated_at", { ascending: false }),
    sb.from("dev_products").select("*").order("name"), sb.from("dev_product_lines").select("*").order("sort_order"),
    sb.from("unit_econ").select("*"), sb.from("raw_materials").select("id,name,unit,pack_type").eq("category", "packaging").eq("active", true).order("name"),
    sb.from("v_rm_value").select("raw_material_id,rate,rate_unit,no_rate")]);
  if (sc.error) { host.innerHTML = isMissing(sc.error) ? SETUP : `<div class="notice err">Could not load: ${esc(sc.error.message)}</div>`; return; }
  const scen = sc.data || [], prods = dp.data || [], plines = {}; (ln.data || []).forEach(l => (plines[l.dev_product_id] ||= []).push(l));
  const bottle = {}; (ue.data || []).filter(r => r.product === "bottle").forEach(r => { bottle[r.key] = r.value == null ? "" : Number(r.value); });
  const VAL = Object.fromEntries((vv.data || []).map(r => [r.raw_material_id, r]));
  const pack = (pk.data || []).map(m => ({ ...m, rate: VAL[m.id] && VAL[m.id].rate != null ? Number(VAL[m.id].rate) : null })).filter(m => m.rate != null);
  const PICK = { primary: ["bottle", "pack", "sachet"], closure: ["other"], carton: ["carrier_box", "box"] };

  const fromBottle = () => {
    const sh = { gst: 18, density: 1, overfill: 0, loss: 0 }; SH.forEach(([, ks]) => ks.forEach(k => { if (bottle[k] != null && bottle[k] !== "") sh[k] = bottle[k]; }));
    const a = mkVar("Current bottle"); VNUM.forEach(k => { if (bottle[k] != null && bottle[k] !== "") a[k] = bottle[k]; });
    return { id: null, name: "Bottle comparison", dev_product_id: "", basis: "exp", shared: sh, variants: [a, { ...a, name: "Option B", shape: "Oval" }, { ...a, name: "Option C", shape: "Square" }] };
  };
  let S = scen.length ? { id: scen[0].id, name: scen[0].name, dev_product_id: scen[0].dev_product_id || "", basis: scen[0].shared?._basis || "exp", shared: { ...scen[0].shared }, variants: (scen[0].variants || []).map(v => ({ ...mkVar(""), ...v })) } : fromBottle();
  if (!S.variants.length) S.variants = [mkVar("Option A")];
  delete S.shared._basis;
  const prodCost = () => { const p = prods.find(x => x.id === S.dev_product_id); if (!p) return null; const c = costLines(plines[p.id]); return { p, c, v: c[S.basis] }; };
  const compute = v => ueModel({ ...S.shared, ...v });

  const render = () => {
    const pc = prodCost();
    host.innerHTML = `<div class="toolbar"><select id="sks" style="min-width:220px">${scen.map(s => `<option value="${s.id}" ${s.id === S.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}${S.id ? "" : `<option value="" selected>${esc(S.name || "New comparison")} (not saved)</option>`}</select>
        <button class="btn ghost" id="sknew">＋ New comparison</button><span class="grow"></span><button class="btn ghost" id="skdel" ${S.id ? "" : "disabled"}>Delete</button><button class="btn" id="sksave">Save</button></div>
      <p class="muted small">Decide a new SKU before you commit to it. Put up to 6 bottle or pack options side by side (different shapes, sizes, materials, closures and vendors). Each one runs through the same unit-economics model as your sachet and bottle, so you can see profit, margin and the MRP you would need.</p>
      <div class="card"><div class="form-grid"><label>Comparison name<input id="skn" value="${esc(S.name)}"></label>
        <label>Product being filled<select id="skp"><option value="">None – type the bulk cost myself</option>${prods.map(p => `<option value="${p.id}" ${p.id === S.dev_product_id ? "selected" : ""}>${esc(p.name)}${p.variant ? " – " + esc(p.variant) : ""}</option>`).join("")}</select></label>
        <label>Cost to use<select id="skb"><option value="exp" ${S.basis === "exp" ? "selected" : ""}>Expected prices</option><option value="hi" ${S.basis === "hi" ? "selected" : ""}>Market-high prices (safe)</option><option value="lo" ${S.basis === "lo" ? "selected" : ""}>Market-low prices (best case)</option></select></label></div>
        <p class="muted small" id="skpn">${pc ? (pc.c.exp ? `Bulk cost taken from the costing of <b>${esc(pc.p.name)}</b>: ${INR(pc.v)} per kg, ${num(pc.p.process_loss_pct, 1)}% process loss. Change any number below to override.` : `${esc(pc.p.name)} has no priced formulation yet.`) : "Pick a product from the Products &amp; range tab to pull its raw material cost in automatically."}</p>
        <details open id="skd"><summary><b>Assumptions shared by every option</b></summary>
          ${SH.map(([sec, ks]) => `<h4>${esc(sec)}</h4><div class="form-grid">${ks.map(k => `<label>${esc((LBL[k] || [k])[0])} <span class="muted small">${esc((LBL[k] || [])[1] || "")}</span><input type="number" step="any" data-sh="${k}" value="${S.shared[k] ?? ""}"></label>`).join("")}</div>`).join("")}</details></div>
      <div class="card"><div class="row between"><h3 style="margin:0">Options</h3><button class="btn ghost sm" id="skadd" ${S.variants.length >= 6 ? "disabled" : ""}>＋ Add option</button></div><div class="tbl-wrap"><div id="skg"></div></div></div>
      <div id="skres"></div><div class="card" id="skai"></div>`;
    drawGrid(); paint();
    $("#sks", host).onchange = e => { const s = scen.find(x => x.id === e.target.value); if (!s) return; S = { id: s.id, name: s.name, dev_product_id: s.dev_product_id || "", basis: s.shared?._basis || "exp", shared: { ...s.shared }, variants: (s.variants || []).map(v => ({ ...mkVar(""), ...v })) }; delete S.shared._basis; if (!S.variants.length) S.variants = [mkVar("Option A")]; render(); };
    $("#sknew", host).onclick = () => { S = fromBottle(); render(); toast("New comparison started from your current bottle. Edit the options."); };
    arm($("#skdel", host), async () => { if (await run(sb.from("sku_scenarios").delete().eq("id", S.id), "Deleted")) { scen.splice(scen.findIndex(x => x.id === S.id), 1); S = scen.length ? { id: scen[0].id, name: scen[0].name, dev_product_id: scen[0].dev_product_id || "", basis: scen[0].shared?._basis || "exp", shared: { ...scen[0].shared }, variants: (scen[0].variants || []).map(v => ({ ...mkVar(""), ...v })) } : fromBottle(); delete S.shared._basis; render(); } });
    $("#sksave", host).onclick = async () => {
      const name = ($("#skn", host).value || "").trim(); if (!name) return toast("Give the comparison a name", "err"); S.name = name;
      const row = { name, dev_product_id: S.dev_product_id || null, shared: { ...S.shared, _basis: S.basis }, variants: S.variants, updated_at: new Date().toISOString() };
      const r = S.id ? await run(sb.from("sku_scenarios").update(row).eq("id", S.id).select().single(), "Saved") : await run(sb.from("sku_scenarios").insert(row).select().single(), "Saved");
      if (r && r.id) { S.id = r.id; const i = scen.findIndex(x => x.id === r.id); if (i >= 0) scen[i] = r; else scen.unshift(r); render(); }
    };
    $("#skn", host).oninput = e => { S.name = e.target.value; };
    const useProduct = () => { const pc2 = prodCost(); if (!pc2 || !pc2.c.exp) return; S.shared.bulk_kg = +pc2.v.toFixed(2); S.shared.density = Number(pc2.p.density) || 1; S.shared.loss = Number(pc2.p.process_loss_pct) || 0; };
    $("#skp", host).onchange = e => { S.dev_product_id = e.target.value; useProduct(); render(); };
    $("#skb", host).onchange = e => { S.basis = e.target.value; useProduct(); render(); };
    $$("[data-sh]", host).forEach(i => i.oninput = () => { S.shared[i.dataset.sh] = i.value === "" ? "" : Number(i.value); paint(); });
    $("#skadd", host).onclick = () => { const l = S.variants[S.variants.length - 1]; S.variants.push({ ...l, name: "Option " + LETTERS[S.variants.length] }); drawGrid(); paint(); $("#skadd", host).disabled = S.variants.length >= 6; };
  };

  const drawGrid = () => {
    const V = S.variants, sel = (arr, cur) => arr.map(o => `<option ${o === cur ? "selected" : ""}>${esc(o)}</option>`).join("");
    const rowOf = (label, inner) => `<tr><th scope="row">${label}</th>${V.map((v, i) => `<td>${inner(v, i)}</td>`).join("")}</tr>`;
    const num_ = (k, w = 108) => (v, i) => `<input type="number" step="any" min="0" data-v="${i}" data-k="${k}" value="${v[k] ?? ""}" style="width:${w}px">`;
    const picks = (k, pk2) => (v, i) => { const opts = pack.filter(m => PICK[pk2].includes(m.pack_type)); return `<input type="number" step="any" min="0" data-v="${i}" data-k="${k}" value="${v[k] ?? ""}" style="width:108px">${opts.length ? `<select data-pick="${k}" data-v="${i}" class="skp-sel"><option value="">Fill from stock list…</option>${opts.map(m => `<option value="${m.id}">${esc(m.name)} – ${INR(m.rate)}</option>`).join("")}</select>` : ""}`; };
    $("#skg", host).innerHTML = `<table class="skug"><thead><tr><th></th>${V.map((v, i) => `<th><div class="sk-h">${shapeIcon(v.shape)}<div><input data-v="${i}" data-k="name" value="${esc(v.name)}" style="width:130px;font-weight:700"><div class="row" style="margin:4px 0 0;gap:4px"><button class="btn ghost sm skdup" data-i="${i}" title="Duplicate this option" ${V.length >= 6 ? "disabled" : ""}>⧉</button><button class="btn ghost sm skrm" data-i="${i}" title="Remove this option" ${V.length <= 1 ? "disabled" : ""}>✕</button></div></div></div></th>`).join("")}</tr></thead><tbody>
      <tr class="sk-sec"><td colspan="${V.length + 1}">Pack</td></tr>
      ${rowOf("Shape", (v, i) => `<select data-v="${i}" data-k="shape" data-redraw="1">${sel(SHAPES, v.shape)}</select>`)}${rowOf("Container material", (v, i) => `<select data-v="${i}" data-k="material">${sel(MATERIALS, v.material)}</select>`)}${rowOf("Closure type", (v, i) => `<select data-v="${i}" data-k="closure_type">${sel(CLOSURES, v.closure_type)}</select>`)}
      ${rowOf("Vendor", (v, i) => `<input data-v="${i}" data-k="vendor" value="${esc(v.vendor || "")}" style="width:130px">`)}${rowOf("Minimum order (units)", num_("moq"))}${rowOf("Notes", (v, i) => `<input data-v="${i}" data-k="notes" value="${esc(v.notes || "")}" style="width:130px">`)}
      <tr class="sk-sec"><td colspan="${V.length + 1}">Size &amp; price</td></tr>
      ${rowOf("Fill per unit (ml)", num_("fill_ml"))}${rowOf("MRP incl. GST (₹)", num_("mrp"))}${rowOf("Units sold per month", num_("monthly_units"))}
      <tr class="sk-sec"><td colspan="${V.length + 1}">Packaging cost per unit (₹)</td></tr>
      ${rowOf("Bottle / container", picks("primary", "primary"))}${rowOf("Closure / pump", picks("closure", "closure"))}${rowOf("Label / printing", num_("label"))}${rowOf("Inner pack / seal", num_("inner"))}
      <tr class="sk-sec"><td colspan="${V.length + 1}">Carton</td></tr>
      ${rowOf("Units per carton", num_("units_per_carton"))}${rowOf("Carton cost (₹)", picks("carton", "carton"))}${rowOf("Tape &amp; dividers per carton (₹)", num_("tape"))}${rowOf("Outward freight per carton (₹)", num_("freight_carton"))}
      </tbody></table>`;
    const g = $("#skg", host);
    g.oninput = e => { const t = e.target, i = t.dataset.v, k = t.dataset.k; if (i == null || !k) return; S.variants[i][k] = VNUM.includes(k) ? (t.value === "" ? "" : Number(t.value)) : t.value; if (!t.dataset.redraw) paint(); };
    g.onchange = e => {
      const t = e.target;
      if (t.dataset.redraw) { S.variants[t.dataset.v][t.dataset.k] = t.value; drawGrid(); paint(); return; }
      if (t.dataset.pick && t.value) { const m = pack.find(x => x.id === t.value), i = t.dataset.v, k = t.dataset.pick; if (m) S.variants[i][k] = m.rate; drawGrid(); paint(); }
    };
    $$(".skdup", g).forEach(b => b.onclick = () => { const v = S.variants[b.dataset.i]; S.variants.splice(+b.dataset.i + 1, 0, { ...v, name: v.name + " copy" }); drawGrid(); paint(); const a = $("#skadd", host); if (a) a.disabled = S.variants.length >= 6; });
    $$(".skrm", g).forEach(b => b.onclick = () => { S.variants.splice(b.dataset.i, 1); drawGrid(); paint(); const a = $("#skadd", host); if (a) a.disabled = S.variants.length >= 6; });
  };

  const paint = () => {
    const V = S.variants, M = V.map(compute), f2 = v => v == null || !isFinite(v) ? "n/a" : INR(v), p1 = v => v == null || !isFinite(v) ? "n/a" : PCT(v);
    const perL = M.map(m => m.perLitre ? m.perLitre.contrib : null), mc = M.map((m, i) => (m.contrib || 0) * (Number(V[i].monthly_units) || 0));
    const best = (arr, hi = true) => { const ok = arr.map((x, i) => [x, i]).filter(([x]) => x != null && isFinite(x)); if (ok.length < 2) return -1; const t = ok.reduce((a, b) => (hi ? b[0] > a[0] : b[0] < a[0]) ? b : a); return ok.every(([x]) => x === t[0]) ? -1 : t[1]; };
    const bu = best(M.map(m => m.profit)), bl = best(perL), bm = best(mc), bp = best(M.map(m => m.packPct), false);
    const neg = M.map((m, i) => ({ m, i })).filter(x => x.m.profit < 0);
    const nm = i => `<b>${esc(V[i].name)}</b>`;
    const cell = (arr, fmt, hiI = -1, tone = false) => arr.map((x, i) => `<td style="text-align:right" class="${i === hiI ? "okc" : tone && x != null && x < 0 ? "dev" : ""}">${fmt(x)}${i === hiI ? " ★" : ""}</td>`).join("");
    const r = (label, arr, fmt = f2, o = {}) => `<tr${o.bold ? ' style="font-weight:600"' : ""}><td>${label}</td>${cell(arr, fmt, o.best ?? -1, o.tone)}</tr>`;
    const sec = t => `<tr class="sk-sec"><td colspan="${V.length + 1}">${t}</td></tr>`;
    const tcm = Number(S.shared.target_cm) > 0;
    const moqCash = V.map((v, i) => { const w = 1 + (Number(S.shared.wastage) || 0) / 100, u = (Number(v.primary) || 0) + (Number(v.closure) || 0) + (Number(v.label) || 0) + (Number(v.inner) || 0); return (Number(v.moq) || 0) * u * w || null; });
    const fx = (Number(S.shared.fixed_cash) || 0) + (Number(S.shared.depreciation) || 0), be = M.map(m => m.contrib > 0 && fx > 0 ? Math.ceil(fx / m.contrib) : null);
    $("#skres", host).innerHTML = `${V.every(v => !(Number(v.mrp) > 0)) ? '<div class="notice warn">Enter an MRP for at least one option to see revenue and margins.</div>' : ""}
      <div class="card"><h3>Which one should you pick?</h3><ul style="margin:6px 0 0 18px">
        ${bl >= 0 ? `<li>Most contribution per litre: ${nm(bl)} at ${f2(perL[bl])} / L.</li>` : ""}${bu >= 0 ? `<li>Most profit per unit: ${nm(bu)} at ${f2(M[bu].profit)}.</li>` : ""}${bm >= 0 && mc.some(x => x > 0) ? `<li>Most monthly contribution at your volume: ${nm(bm)} at ${INR(mc[bm], 0)}.</li>` : ""}${bp >= 0 ? `<li>Lightest packaging cost: ${nm(bp)}, ${p1(M[bp].packPct)} of its COGS.</li>` : ""}
        ${neg.length ? `<li class="dev">${neg.map(x => esc(V[x.i].name)).join(", ")} lose${neg.length === 1 ? "s" : ""} money per unit at this MRP.</li>` : ""}
        ${bl < 0 && bu < 0 ? "<li class='muted'>Fill in costs and MRPs for at least two options to compare them.</li>" : ""}</ul>
        <p class="muted small" style="margin:8px 0 0">Indicative: uses your assumptions above. ★ marks the best option in a row.</p></div>
      <div class="card"><h3>Result per unit</h3><div class="tbl-wrap"><table class="tbl keep"><thead><tr><th>₹ per unit</th>${V.map((v, i) => `<th style="text-align:right">${shapeIcon(v.shape)}<br>${esc(v.name)}<br><small>${esc(v.shape)}${v.fill_ml ? " · " + num(v.fill_ml, 0) + " ml" : ""}</small></th>`).join("")}</tr></thead><tbody>
        ${sec("Revenue")}${r("MRP incl. GST", M.map(m => m.mrp))}${r("Net revenue per unit", M.map(m => m.net), f2, { bold: true })}
        ${sec("Cost of making it")}${r("Bulk liquid", M.map(m => m.liquid))}${r("Packaging (with wastage, carton share)", M.map(m => m.pack))}${r("Packaging as % of COGS", M.map(m => m.packPct), p1, { best: bp })}${r("Conversion", M.map(m => m.conv))}${r("COGS", M.map(m => m.cogs), f2, { bold: true })}${r("Gross margin %", M.map(m => m.gmPct), p1, { tone: true })}
        ${sec("Profit")}${r("Contribution per unit", M.map(m => m.contrib), f2, { bold: true, tone: true })}${r("Contribution % of net revenue", M.map(m => m.cmPct), p1, { tone: true })}${r("PROFIT PER UNIT", M.map(m => m.profit), f2, { bold: true, best: bu, tone: true })}${r("Profit margin % of net revenue", M.map(m => m.profitPct), p1, { tone: true })}
        ${tcm ? sec("Pricing guide") + r("MRP needed for target margin (rounded to ₹0.50)", M.map(m => m.mrpR)) + r("Gap vs your MRP (+ = raise price)", M.map(m => m.gap), f2, { tone: false }) : ""}
        ${sec("To compare different sizes")}${r("Contribution per litre", perL, f2, { best: bl, tone: true })}${r("COGS per litre", M.map(m => m.perLitre ? m.perLitre.cogs : null))}${r("MRP per litre", M.map(m => m.perLitre ? m.perLitre.mrp : null))}
        ${sec("Volume & commitment")}${r("Monthly contribution (units × contribution)", mc.map(x => x || null), f2, { best: bm, tone: true })}${fx > 0 ? r("Break-even units per month (to cover fixed costs)", be, x => x == null ? "n/a" : num(x, 0)) : ""}${r("Packaging cash for the minimum order", moqCash, f2)}
        </tbody></table></div></div>`;
    const ai = `Compare these ${V.length} pack options for a new SKU and tell me which to launch and why. ${V.map((v, i) => `${v.name} (${v.shape}, ${v.material}, ${v.closure_type}, ${v.fill_ml || "?"} ml, MRP ₹${v.mrp || "?"}): packaging ₹${M[i].pack.toFixed(2)} per unit (${(M[i].packPct * 100).toFixed(0)}% of COGS), COGS ₹${M[i].cogs.toFixed(2)}, profit ₹${M[i].profit.toFixed(2)} per unit (${(M[i].profitPct * 100).toFixed(1)}%), contribution per litre ₹${perL[i] != null ? perL[i].toFixed(2) : "n/a"}${V[i].moq ? `, minimum order ${V[i].moq} units` : ""}`).join("; ")}. Mention risks (shelf look, leakage, vendor reliability, minimum order) and what to check before deciding.`;
    $("#skai", host).innerHTML = `<h3>Ask the AI</h3><p class="muted small">Opens the AI chat with these numbers. Good for a second opinion on a launch decision.</p><button class="btn ghost" id="skask">Ask AI which option to launch</button>`;
    $("#skask", host).onclick = () => askAI(ai);
  };
  render();
}
