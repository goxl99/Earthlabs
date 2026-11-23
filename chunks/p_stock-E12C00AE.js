import{a as sb,e as esc,f as $,g as $$,h as num,i as dfmt,j as dtfmt,m as hasRole,o as toast,p as run,q as modal,s as table}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// All quantities are in each raw material's base unit (mL, L, g or kg), as set in Master Data.
const SMALL = u => u === "mL" || u === "g";
const FAMILY = u => (u === "mL" || u === "L") ? ["mL", "L"] : ["g", "kg"];
const toBase = (q, from, base) => q * (SMALL(from) ? 1 : 1000) / (SMALL(base) ? 1 : 1000);
const rnd = (q, u) => SMALL(u) ? Math.ceil(q - 1e-9) : Math.ceil(q * 1000 - 1e-9) / 1000;
const fmt = (q, u) => {
  const n = Number(q) || 0;
  const big = SMALL(u) && Math.abs(n) >= 1000 ? ` (${num(n / 1000, 2)} ${u === "mL" ? "L" : "kg"})` : "";
  return `${num(n, SMALL(u) ? 0 : 3)} ${esc(u)}${big}`;
};
const MOVE = { receipt: "Received", adjustment: "Adjustment", consumption: "Used in batch" };
const PO_STATUS = { ordered: "Ordered", partial: "Part received", received: "Received", cancelled: "Cancelled" };
const TABS = [["stock", "Stock"], ["reorder", "Reorder"], ["orders", "Purchase orders"], ["capacity", "FG capacity & planner"]];
const wa = text => window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
let TAB = "stock";

export async function stockPage(el) {
  const [st, mv, rm, pq, cp, cf] = await Promise.all([
    sb.from("raw_material_status").select("*").order("name"),
    sb.from("raw_material_stock").select("*, raw_materials(name,unit), batches(temp_ref,batch_code)")
      .order("created_at", { ascending: false }).limit(100),
    sb.from("raw_materials").select("*").eq("active", true).order("name"),
    sb.from("purchase_orders").select("*, purchase_order_lines(*, raw_materials(name,unit))")
      .order("created_at", { ascending: false }).limit(60),
    sb.from("v_product_rm_capacity").select("*"),
    sb.from("app_settings").select("*"),
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
  const byId = Object.fromEntries(mats.map(m => [m.id, m]));
  const isLow = r => r.below_min || r.below_cover;
  const why = r => [r.below_min ? "below minimum" : "", r.below_cover ? `under ${cover} batches of cover` : ""].filter(Boolean).join(", ");
  const nLow = S.filter(isLow).length;

  el.innerHTML = `<div class="tabs wrapt">${TABS.map(([k, t]) =>
    `<button class="tab ${k === TAB ? "on" : ""}" data-k="${k}">${t}${k === "reorder" && nLow ? ` <b class="dev">(${nLow})</b>` : ""}</button>`).join("")}</div><div id="sp"></div>`;
  $$(".tab", el).forEach(b => b.onclick = () => { TAB = b.dataset.k; stockPage(el); });
  const reload = tab => { if (tab) TAB = tab; stockPage(el); };
  const sp = $("#sp", el);

  // ---------- shared: place-an-order modal (used by Reorder, Orders and Planner) ----------
  const openPO = (prefill = []) => {
    const lines = prefill.map(l => ({ id: l.id, qty: l.qty }));
    if (!lines.length) lines.push({ id: "", qty: "" });
    const suppliers = [...new Set(pos.map(p => p.supplier))];
    modal("Place purchase order", `<form id="pof" class="form-grid">
      <label>Supplier<input name="supplier" list="sup" required><datalist id="sup">${suppliers.map(s => `<option value="${esc(s)}">`).join("")}</datalist></label>
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
  const poText = p => [`*Purchase order ${p.po_no}* – ${company}`, `Supplier: ${p.supplier}`,
    p.expected_date ? `Expected by: ${dfmt(p.expected_date)}` : null, "",
    ...p.purchase_order_lines.map(l => `• ${l.raw_materials?.name}: ${num(l.qty_ordered, SMALL(l.raw_materials?.unit) ? 0 : 3)} ${l.raw_materials?.unit}`),
    p.notes ? "" : null, p.notes ? `Notes: ${p.notes}` : null].filter(x => x !== null).join("\n");

  // ---------- Stock tab ----------
  const tStock = () => {
    sp.innerHTML = `
    <div class="toolbar"><input id="q" type="search" placeholder="Search raw material…">
      ${canOrder ? '<button class="btn" id="addb">＋ Add stock</button>' : ""}</div>
    ${canOrder ? `<div class="card hide" id="addc"><h3>Add raw material stock</h3>
      <form id="sf" class="form-grid">
        <label>Raw material<select name="raw_material_id" id="rmsel" required><option value="">Select…</option>
          ${mats.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label>
        <label>Entry type<select name="movement"><option value="receipt">Received (add stock)</option>
          ${isAdmin ? '<option value="adjustment">Stock-take correction (+ or −)</option>' : ""}</select></label>
        <label>Quantity<input name="qty" type="number" step="any" required></label>
        <label>Unit<select name="unit" id="usel"><option>mL</option><option>L</option></select></label>
        <label>Lot no.<input name="lot_no"></label><label>Supplier<input name="supplier"></label>
        <label>Expiry date<input name="expiry_date" type="date"></label>
        <label>Note<input name="note" placeholder="Required for corrections"></label>
        <div><button class="btn" id="sfb">Save</button> <button type="button" class="btn ghost" id="sfc">Cancel</button></div>
      </form></div>` : ""}
    ${isAdmin ? `<form id="rf" class="card form-grid"><label>Low-stock rule: keep at least this many batches in stock
      <input name="rm_cover_batches" type="number" step="any" min="0" value="${cover}"></label>
      <label>…of this batch size (L)<input name="rm_ref_batch_l" type="number" step="any" min="1" value="${refL}"></label>
      <div class="row end"><button class="btn ghost">Save rule</button></div></form>` : ""}
    <h3>Current stock</h3><div id="lv"></div>
    <h3>Recent movements</h3><div id="mv"></div>
    <p class="muted small">An item is flagged Low when it is below its minimum level or can't cover ${cover} batches of ${refL} L.
    Stock is deducted with actual quantities when a batch is sent to QA/QC and returned if it is sent back or rejected.</p>`;
    const drawLevels = () => {
      const term = ($("#q").value || "").toLowerCase();
      $("#lv").innerHTML = table([
        { h: "Raw material", v: r => r.name },
        { h: "On hand", html: r => `<b class="${r.on_hand <= 0 ? "dev" : ""}">${fmt(r.on_hand, r.unit)}</b>` },
        { h: "On order", v: r => r.on_order > 0 ? fmt(r.on_order, r.unit) : "–" },
        { h: "Minimum", v: r => r.min_level > 0 ? fmt(r.min_level, r.unit) : "–" },
        { h: "Cover", v: r => r.batches_cover == null ? "–" : num(r.batches_cover, 1) + " batches" },
        { h: "Status", html: r => r.on_hand < 0 ? '<span class="dev">⚠ Negative – check entries</span>'
            : r.on_hand === 0 || Number(r.on_hand) === 0 ? '<span class="dev">✖ Out of stock</span>'
            : isLow(r) ? `<span class="dev">⚠ Low – ${why(r)}</span>` : '<span class="okc">✔ OK</span>' },
        ...(isAdmin ? [{ h: "", html: r => `<button class="btn ghost sm mn" data-id="${r.raw_material_id}">Set minimum</button>` }] : []),
      ], S.filter(r => !term || r.name.toLowerCase().includes(term)), { empty: "No raw materials yet." });
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
      { h: "Note", v: r => r.note || "" },
    ], moves, { empty: "No stock movements yet. Use “Add stock” to record what you have." });
    drawLevels(); $("#q").oninput = drawLevels;
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
      $("#usel").innerHTML = (m ? FAMILY(m.unit) : ["mL", "L"]).map(u => `<option>${u}</option>`).join("");
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
      { h: "Raw material", v: r => r.name },
      { h: "On hand", v: r => fmt(r.on_hand, r.unit) },
      { h: "On order", v: r => r.on_order > 0 ? fmt(r.on_order, r.unit) : "–" },
      { h: "Why low", v: r => why(r) },
      { h: "Order qty", html: r => `<input type="number" step="any" min="0" class="rqty" data-id="${r.raw_material_id}" style="width:120px" value="${rnd(r.suggested_order, r.unit)}"> ${esc(r.unit)}` },
    ], low, { empty: "" });
    const picked = () => $$(".rsel", sp).filter(c => c.checked).map(c => ({
      id: c.dataset.id, qty: Number($(`.rqty[data-id="${c.dataset.id}"]`, sp).value) })).filter(l => l.qty > 0);
    $("#rwa").onclick = () => {
      const l = picked(); if (!l.length) return toast("Tick at least one item with a quantity", "err");
      wa([`*Raw material order request* – ${company}`, "", ...l.map(x => `• ${byId[x.id]?.name}: ${num(x.qty, SMALL(byId[x.id]?.unit) ? 0 : 3)} ${byId[x.id]?.unit}`)].join("\n"));
    };
    if (canOrder) $("#rpo").onclick = () => {
      const l = picked(); if (!l.length) return toast("Tick at least one item with a quantity", "err"); openPO(l);
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
      { h: "", html: p => `<button class="btn ghost sm pwa" data-id="${p.id}">WhatsApp</button> ` +
          (canOrder && ["ordered", "partial"].includes(p.status) ? `<button class="btn sm prc" data-id="${p.id}">Receive</button> <button class="btn ghost sm pcx" data-id="${p.id}">Cancel</button>` : "") },
    ], pos, { empty: "No purchase orders yet. Create one from the Reorder tab or with “New purchase order”." });
    if (canOrder) $("#npo").onclick = () => openPO([]);
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
            ...lines.map(l => `• ${byId[l.id]?.name}: ${num(l.qty, SMALL(byId[l.id]?.unit) ? 0 : 3)} ${byId[l.id]?.unit}`)].join("\n"));
          if (canOrder) $(".pp", card).onclick = () => openPO(lines);
        }
      };
      $(".tg", card).oninput = plan; plan();
    });
  };

  ({ stock: tStock, reorder: tReorder, orders: tOrders, capacity: tCap }[TAB] || tStock)();
}
