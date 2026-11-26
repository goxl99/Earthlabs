import{a as sb,e as esc,f as $,g as $$,h as num,o as toast,s as table,u as xlsx}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// Products & pricing – the same eight sections as EPDMS "Products & pricing", read from the copy of EPDMS that the
// Batch database keeps (table epdms_catalogue, one row, filled by EPDMS through epdms_receive kind "catalogue").
// Read-only here. Needs db/epdms_catalogue.sql.
//
// Price rule (checked against real EPDMS order lines):  partner price (ex-GST) = MRP x (1 - margin%) / (1 + GST%)
//   margin% = per-SKU override (sku_margins) if there is one, else the default slab for that partner type and the SKU's slab.

const INR = (n, d = 2) => n == null || !isFinite(n) ? "–" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const nn = v => v === "" || v == null || isNaN(Number(v)) ? null : Number(v);
const SETUP = '<div class="notice err">The EPDMS copy is not set up in the database yet. Ask the administrator to run <b>db/epdms_catalogue.sql</b> in the Supabase SQL editor, then reload.</div>';
const isMissing = e => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache|Could not find the table/i.test(e.message || ""));
const SUBS = [["cat", "Catalogue"], ["mrp", "SKU-wise MRP & margins"], ["psku", "Partner-wise SKUs"], ["tier", "Price list by tier"], ["slab", "Default margin slabs"], ["sch", "Schemes & GST"], ["schp", "Schemes by partner"], ["pol", "Policies & weights"]];
const SECRET = /secret|token|key|password|link/i;   // never show anything that looks like a credential
let SUB = "cat";

export const marginOf = (C, sku, type) => {
  const o = (C.sku_margins || []).find(m => m.sku === sku.sku && m.type_code === type);
  if (o) return { pct: Number(o.margin_pct), src: "SKU override" };
  const d = (C.margin_slabs || []).find(m => m.type_code === type && Number(m.slab) === Number(sku.slab));
  return d ? { pct: Number(d.margin_pct), src: "Default slab " + sku.slab } : { pct: null, src: "No margin set" };
};
export const gstOf = C => { const g = nn((C.settings || {}).gst_pct ?? (C.settings || {}).gst); return g == null ? 18 : g; };
export const partnerPrice = (mrp, marginPct, gst) => marginPct == null ? null : Number(mrp) * (1 - marginPct / 100) / (1 + gst / 100);

const load = async () => {
  const [cat, dp, dl] = await Promise.all([
    sb.from("epdms_catalogue").select("payload,fetched_at,version").eq("id", 1).maybeSingle(),
    sb.from("dev_products").select("id,name,variant,density,status").neq("status", "dropped"),
    sb.from("dev_product_lines").select("dev_product_id,pct,current_rate,expected_rate,deviation_pct"),
  ]);
  if (cat.error) throw cat.error;
  const lab = {};   // lab cost per litre by lower-case product name (optional; the lab tables may not exist yet)
  if (!dp.error && !dl.error) {
    const by = {}; (dl.data || []).forEach(l => (by[l.dev_product_id] ||= []).push(l));
    (dp.data || []).forEach(p => {
      const L = by[p.id] || []; let c = 0;
      L.forEach(l => { const r = nn(l.expected_rate) ?? nn(l.current_rate) ?? 0; c += (Number(l.pct) || 0) / 100 * r; });
      if (c > 0) lab[(p.name + (p.variant ? " " + p.variant : "")).trim().toLowerCase()] = { perL: c * (Number(p.density) || 1), name: p.name };
    });
  }
  return { row: cat.data, lab };
};

export async function pricingTab(sp, ctx) {
  let D; try { D = await load(); } catch (e) { sp.innerHTML = isMissing(e) ? SETUP : `<div class="notice err">Could not load: ${esc(e.message || String(e))}</div>`; return; }
  const C = D.row && D.row.payload;
  if (!C || !Array.isArray(C.skus)) {
    sp.innerHTML = '<div class="notice">Nothing has arrived from EPDMS yet. Once EPDMS sends its first products and pricing update, every section appears here exactly as in EPDMS.</div>';
    return;
  }
  const age = D.row.fetched_at ? new Date(D.row.fetched_at).toLocaleString("en-IN") : "–";
  sp.innerHTML = `<p class="muted small">Same sections as <b>Products & pricing</b> in EPDMS. EPDMS is the master; this is a read-only copy, last updated <b>${esc(age)}</b>${D.row.version != null ? ` (version ${esc(String(D.row.version))})` : ""}.</p>
    <div class="tabs wrapt sub">${SUBS.map(([k, t]) => `<button class="tab ${k === SUB ? "on" : ""}" data-s="${k}">${t}</button>`).join("")}</div><div id="ppb"></div>`;
  $$(".tabs.sub .tab", sp).forEach(b => b.onclick = () => { SUB = b.dataset.s; pricingTab(sp, ctx); });
  const bd = $("#ppb", sp), gst = gstOf(C);
  const types = [...new Set([...(C.margin_slabs || []).map(m => m.type_code), ...(C.sku_margins || []).map(m => m.type_code)])].sort();
  const tname = Object.fromEntries((C.partner_types || []).map(t => [t.code || t.type_code, t.name || t.label]));
  const T = t => tname[t] ? `${esc(tname[t])} <small class="muted">${esc(t)}</small>` : esc(t);
  const skus = C.skus, pname = Object.fromEntries((C.partners || []).map(p => [p.id, p.name]));
  const skuName = Object.fromEntries(skus.map(s => [s.sku, s.name]));
  const labFor = s => D.lab[(s.name || "").trim().toLowerCase()];
  const st = s => `<span class="lab-st st-${s === "Active" || s === "active" ? "approved" : "idea"}">${esc(s || "–")}</span>`;
  const dl = (name, sheets) => `<button class="btn ghost sm" id="xl">Download Excel</button>`;
  const wire = (name, sheets) => { const b = $("#xl", bd); if (b) b.onclick = () => xlsx(name, sheets); };

  if (SUB === "cat") {
    bd.innerHTML = `<div class="toolbar">${dl()}</div>` + table([
      { h: "SKU", v: s => s.sku }, { h: "Product", html: s => `<b>${esc(s.name)}</b>` }, { h: "Category", v: s => s.category || "–" },
      { h: "Pack", v: s => `${s.unit_ml != null ? num(s.unit_ml, 0) + " ml" : (s.unit || "")} × ${s.pack_size || "–"}` },
      { h: "HSN", v: s => s.hsn || "–" }, { h: "MOQ", v: s => s.moq ?? "–" }, { h: "Make days", v: s => s.make_days ?? "–" },
      { h: "Status", html: s => st(s.status) }, { h: "Restricted", v: s => s.restricted ? "Yes" : "No" },
      { h: "Cost / L (Batch lab)", html: s => { const l = labFor(s); return l ? `<b>${INR(l.perL)}</b>` : '<span class="muted">–</span>'; } },
    ], skus, { empty: "No products in EPDMS." });
    wire("EPDMS catalogue", { Catalogue: skus.map(s => ({ SKU: s.sku, Product: s.name, Category: s.category, "Unit ml": s.unit_ml, "Pack size": s.pack_size, HSN: s.hsn, MOQ: s.moq, "Make days": s.make_days, Status: s.status, Restricted: s.restricted ? "Yes" : "No", MRP: s.mrp })) });
    return;
  }
  if (SUB === "mrp") {
    const rows = skus.map(s => ({ s, m: Object.fromEntries(types.map(t => [t, marginOf(C, s, t)])), lab: labFor(s) }));
    bd.innerHTML = `<p class="muted small">MRP includes GST (${gst}%). Partner margin is taken off MRP. “Cost / L” comes from the Costing in this app when a lab product has the same name.</p><div class="toolbar">${dl()}</div>` + table([
      { h: "SKU", html: r => `<b>${esc(r.s.sku)}</b><br><small class="muted">${esc(r.s.name)}</small>` }, { h: "MRP", v: r => INR(r.s.mrp) },
      ...types.map(t => ({ h: t, html: r => r.m[t].pct == null ? '<span class="muted">–</span>' : `${num(r.m[t].pct, 2)}%<br><small class="muted">${esc(r.m[t].src)}</small>` })),
      { h: "Our margin vs make cost / L", html: r => { if (!r.lab) return '<span class="muted">–</span>'; const ml = Number(r.s.unit_ml) || 0; return ml ? `${INR(r.lab.perL)} / L · ${INR(r.lab.perL * ml / 1000)} per unit` : INR(r.lab.perL) + " / L"; } },
    ], rows, { empty: "No products." });
    wire("EPDMS SKU margins", { Margins: rows.map(r => ({ SKU: r.s.sku, Product: r.s.name, MRP: Number(r.s.mrp), ...Object.fromEntries(types.map(t => [t + " margin %", r.m[t].pct])) })) });
    return;
  }
  if (SUB === "psku") {
    const acc = {}; (C.sku_access || []).forEach(a => (acc[a.sku] ||= []).push(a.partner_id));
    const rows = skus.filter(s => s.restricted || acc[s.sku]);
    bd.innerHTML = `<p class="muted small">SKUs marked <b>restricted</b> are shown only to the partners listed. Every other SKU is open to all partners.</p>` + table([
      { h: "SKU", html: s => `<b>${esc(s.sku)}</b><br><small class="muted">${esc(s.name)}</small>` },
      { h: "Who can order it", html: s => (acc[s.sku] || []).length ? (acc[s.sku]).map(p => esc(pname[p] || p)).join(", ") : '<span class="dev">Restricted – no partner added yet</span>' },
    ], rows, { empty: "No restricted SKUs. All SKUs are open to every partner." });
    return;
  }
  if (SUB === "tier") {
    const rows = []; skus.forEach(s => types.forEach(t => { const m = marginOf(C, s, t); rows.push({ s, t, m, p: partnerPrice(s.mrp, m.pct, gst) }); }));
    bd.innerHTML = `<p class="muted small">Price to the partner before GST = MRP × (1 − margin) ÷ (1 + ${gst}%).</p><div class="toolbar">${dl()}</div>` + table([
      { h: "SKU", html: r => `<b>${esc(r.s.sku)}</b><br><small class="muted">${esc(r.s.name)}</small>` }, { h: "Partner type", html: r => T(r.t) }, { h: "MRP", v: r => INR(r.s.mrp) },
      { h: "Margin", v: r => r.m.pct == null ? "–" : num(r.m.pct, 2) + "%" }, { h: "Price per unit (ex-GST)", html: r => r.p == null ? "–" : `<b>${INR(r.p, 4)}</b>` },
      { h: "Per carton (ex-GST)", v: r => r.p == null || !r.s.pack_size ? "–" : INR(r.p * r.s.pack_size) },
    ], rows, { empty: "No prices yet." });
    wire("EPDMS price list", { "Price list": rows.map(r => ({ SKU: r.s.sku, Product: r.s.name, "Partner type": r.t, MRP: Number(r.s.mrp), "Margin %": r.m.pct, "Price ex-GST": r.p == null ? "" : +r.p.toFixed(4) })) });
    return;
  }
  if (SUB === "slab") {
    const slabs = [...new Set((C.margin_slabs || []).map(m => Number(m.slab)))].sort((a, b) => a - b);
    const g = (t, sl) => (C.margin_slabs || []).find(m => m.type_code === t && Number(m.slab) === sl);
    bd.innerHTML = `<p class="muted small">Default margin by partner type and the SKU's slab. A per-SKU override (see “SKU-wise MRP & margins”) wins over this.</p>` + table([
      { h: "Partner type", html: t => T(t) }, ...slabs.map(sl => ({ h: "Slab " + sl, v: t => g(t, sl) ? num(g(t, sl).margin_pct, 2) + "%" : "–" })),
    ], types, { empty: "No default slabs set." });
    return;
  }
  if (SUB === "sch") {
    const S = C.schemes || [];
    bd.innerHTML = `<div class="stats"><div class="stat"><div class="stat-l">GST on goods</div><div class="stat-v">${gst}%</div><div class="stat-s">${(C.settings || {}).gst_pct == null && (C.settings || {}).gst == null ? "EPDMS standard rate" : "from EPDMS settings"}</div></div></div>` + table([
      { h: "Scheme", html: s => `<b>${esc(s.name)}</b><br><small class="muted">${esc(s.description || "")}</small>` }, { h: "Type", v: s => s.kind || "–" },
      { h: "Benefit", v: s => s.kind === "bxgy" || (s.buy && s.get) ? `Buy ${s.buy}, get ${s.get}` : s.value != null ? num(s.value, 2) : "–" },
      { h: "Min", v: s => [s.min_cartons ? s.min_cartons + " cartons" : "", s.min_value ? INR(s.min_value, 0) : ""].filter(Boolean).join(" / ") || "–" },
      { h: "SKUs", v: s => (s.skus || []).length ? s.skus.map(k => skuName[k] || k).join(", ") : "All" },
      { h: "Valid", v: s => `${s.valid_from || "–"} → ${s.valid_to || "open"}` }, { h: "Budget", v: s => s.budget ? INR(s.budget, 0) : "–" },
      { h: "Flags", v: s => [s.first_order_only && "first order only", s.stackable && "stackable", s.disclosed ? "disclosed" : "not disclosed"].filter(Boolean).join(", ") },
      { h: "Status", html: s => st(s.active ? "Active" : "Off") },
    ], S, { empty: "No schemes." });
    return;
  }
  if (SUB === "schp") {
    const S = C.schemes || [], inA = (s, p) => s.audience_mode === "all" || !s.audience_mode || (s.audience_types || []).includes(p.type_code) || (s.audience_partners || []).includes(p.id);
    const P = (C.partners || []).filter(p => !p.status || p.status === "Active");
    bd.innerHTML = table([
      { h: "Partner", html: p => `<b>${esc(p.name)}</b><br><small class="muted">${esc(p.id)} · ${esc(p.type_code || "")}</small>` },
      { h: "Schemes that apply", html: p => { const l = S.filter(s => s.active && inA(s, p)); return l.length ? l.map(s => esc(s.name)).join(", ") : '<span class="muted">None</span>'; } },
    ], P, { empty: "No active partners." });
    return;
  }
  // policies & weights: every EPDMS setting except anything that looks like a credential or a link to another system
  const keys = Object.keys(C.settings || {}).filter(k => !SECRET.test(k)).sort();
  const show = v => typeof v === "object" && v !== null ? `<pre class="small" style="white-space:pre-wrap;margin:0">${esc(JSON.stringify(v, null, 1))}</pre>` : esc(String(v));
  bd.innerHTML = table([{ h: "Setting", html: k => `<b>${esc(k.replace(/_/g, " "))}</b><br><small class="muted">${esc(k)}</small>` }, { h: "Value in EPDMS", html: k => show(C.settings[k]) }], keys, { empty: "No settings received." });
}
