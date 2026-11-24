import{a as sb,e as esc,f as $,g as $$,i as dfmt,m as hasRole,o as toast,p as run,q as modal}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

export const KINDS = [["production", "Production (mixing a batch)"], ["filling", "Filling / packing"], ["dispatch", "Dispatch / delivery"], ["followup", "Customer follow-up"], ["other", "Other"]];
const KIND = Object.fromEntries(KINDS.map(([k, l]) => [k, l.split(" (")[0]]));
const ST = { todo: "To do", doing: "Started", done: "Done" };
const iso = d => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 10); };
const today = () => iso(new Date());
const shift = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
let DAY = null;

export async function dailyPage(el) {
  const manage = hasRole("admin", "qc_officer"), admin = hasRole("admin");
  if (!DAY) DAY = today();
  el.innerHTML = '<p class="muted">Loading…</p>';
  const get = async q => { const r = await q; if (r.error) throw r.error; return r.data || []; };
  let people, tasks, batches = [], orders = [], me;
  try {
    me = (await sb.auth.getUser()).data?.user?.id;
    [people, tasks] = await Promise.all([get(sb.from("profiles").select("id,full_name,role,active").eq("active", true).order("full_name")), get(sb.from("assignments").select("*").eq("due_date", DAY).order("created_at"))]);
    if (manage) [batches, orders] = await Promise.all([get(sb.from("batches").select("id,batch_code,status").in("status", ["draft", "pending_approval", "approved", "rework"]).order("created_at", { ascending: false }).limit(40)), get(sb.from("sales_orders").select("id,order_no,customers(name)").in("status", ["open", "part_delivered"]).order("created_at", { ascending: false }).limit(40))]);
  } catch (e) { el.innerHTML = `<p class="dev">Could not load: ${esc(e.message)}</p>`; return; }
  const nm = id => people.find(p => p.id === id)?.full_name || "Someone";
  const bcode = id => batches.find(b => b.id === id)?.batch_code, ono = id => orders.find(o => o.id === id)?.order_no;
  const reload = () => dailyPage(el);

  const form = (t = {}) => {
    const opt = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}" ${sel === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    modal(t.id ? "Edit task" : "Assign a task", `<form id="tf" class="form-grid">
      <label>Day<input type="date" name="due_date" value="${t.due_date || DAY}" required></label>
      <label>Assign to<select name="assignee" required>${opt(people.map(p => [p.id, p.full_name + " (" + p.role.replace("_", " ") + ")"]), t.assignee || me)}</select></label>
      <label>Type<select name="kind" id="tk">${opt(KINDS, t.kind || "other")}</select></label>
      <label class="full">What needs to be done<input name="title" value="${esc(t.title || "")}" placeholder="e.g. Mix 500 L Anti-Grease batch" required></label>
      <label class="full">Details (optional)<textarea name="details" rows="2">${esc(t.details || "")}</textarea></label>
      <label>Linked batch (optional)<select name="batch_id"><option value="">None</option>${opt(batches.map(b => [b.id, b.batch_code + " · " + b.status.replace("_", " ")]), t.batch_id)}</select></label>
      <label>Linked order (optional)<select name="order_id"><option value="">None</option>${opt(orders.map(o => [o.id, o.order_no + " · " + (o.customers?.name || "")]), t.order_id)}</select></label>
      <div class="full row end"><button class="btn" id="tsv">${t.id ? "Save" : "Assign"}</button></div></form>`, {
      onMount: (m, close) => {
        $("#tf", m).onsubmit = async e => {
          e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.batch_id = f.batch_id || null; f.order_id = f.order_id || null; f.details = f.details || null;
          const btn = $("#tsv", m); btn.disabled = true;
          const q = t.id ? sb.from("assignments").update(f).eq("id", t.id).select("id") : sb.from("assignments").insert(f).select("id");
          const r = await run(q, t.id ? "Saved" : "Task assigned"); btn.disabled = false; if (!r) return;
          if (!t.id && r[0]?.id) await sb.rpc("notify_task", { p_id: r[0].id });
          close(); if (f.due_date !== DAY) DAY = f.due_date; reload();
        };
      },
    });
  };

  const mine = tasks.filter(t => t.assignee === me), done = tasks.filter(t => t.status === "done").length;
  const group = ids => ids.map(pid => ({ pid, list: tasks.filter(t => t.assignee === pid) })).filter(g => g.list.length);
  const card = t => `<div class="card" style="margin:6px 0${t.status === "done" ? ";opacity:.7" : ""}"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><b>${esc(t.title)}</b><span class="muted small">${esc(KIND[t.kind])} · ${ST[t.status]}${t.assignee !== me ? " · " + esc(nm(t.assignee)) : ""}</span>${t.batch_id ? `<a class="small" href="#/batch/${t.batch_id}">Batch ${esc(bcode(t.batch_id) || "")}</a>` : ""}${t.order_id ? `<span class="small muted">Order ${esc(ono(t.order_id) || "")}</span>` : ""}</div>
    ${t.details ? `<p class="muted small" style="margin:4px 0">${esc(t.details)}</p>` : ""}${t.done_note ? `<p class="small" style="margin:4px 0">Note: ${esc(t.done_note)}</p>` : ""}
    <div class="row" style="gap:6px;margin-top:6px">${t.status === "todo" ? `<button class="btn ghost sm ts" data-s="doing" data-id="${t.id}">Start</button>` : ""}${t.status !== "done" ? `<button class="btn sm ts" data-s="done" data-id="${t.id}">Mark done</button>` : `<button class="btn ghost sm ts" data-s="todo" data-id="${t.id}">Reopen</button>`}${manage ? `<button class="btn ghost sm te" data-id="${t.id}">Edit</button><button class="btn ghost sm td" data-id="${t.id}">Delete</button>` : ""}</div></div>`;
  const prog = tasks.length ? `${done} of ${tasks.length} done` : "No tasks";
  el.innerHTML = `<div class="toolbar"><h2 style="margin:0">Daily plan</h2><span class="grow"></span><button class="btn ghost sm" id="dp">◀</button><input type="date" id="dd" value="${DAY}"><button class="btn ghost sm" id="dn">▶</button><button class="btn ghost sm" id="dt">Today</button>${manage ? '<button class="btn" id="na">Assign a task</button>' : ""}</div>
    <div class="stats"><div class="stat"><div class="stat-l">${DAY === today() ? "Today" : dfmt(DAY)}</div><div class="stat-v">${prog}</div></div>${group(people.map(p => p.id)).map(g => `<div class="stat"><div class="stat-l">${esc(nm(g.pid))}</div><div class="stat-v">${g.list.filter(t => t.status === "done").length}/${g.list.length}</div></div>`).join("")}</div>
    ${admin ? `<div class="card"><div class="toolbar"><h3 style="margin:0">Daily summary</h3><span class="grow"></span><button class="btn ghost sm" id="ds">Send to team now</button></div><p id="dsum" class="muted small">Loading…</p><p class="muted small">Sent automatically every morning at 8:00 as a notification (and on WhatsApp once that is switched on).</p></div>` : ""}
    <div class="card"><div class="toolbar"><h3 style="margin:0">My tasks</h3>${manage ? '<span class="grow"></span><button class="btn ghost sm" id="cf">Carry yesterday’s unfinished tasks here</button>' : ""}</div>${mine.length ? mine.map(card).join("") : '<p class="muted">Nothing assigned to you for this day.</p>'}</div>
    ${manage ? `<div class="card"><h3>Everyone else</h3>${group(people.map(p => p.id).filter(i => i !== me)).map(g => `<h4>${esc(nm(g.pid))}</h4>${g.list.map(card).join("")}`).join("") || '<p class="muted">No other tasks for this day.</p>'}</div>` : ""}`;
  $("#dd", el).onchange = e => { DAY = e.target.value || today(); reload(); };
  $("#dp", el).onclick = () => { DAY = shift(DAY, -1); reload(); }; $("#dn", el).onclick = () => { DAY = shift(DAY, 1); reload(); }; $("#dt", el).onclick = () => { DAY = today(); reload(); };
  if (manage) { $("#na", el).onclick = () => form(); $("#cf", el).onclick = async () => { const n = await run(sb.rpc("carry_forward_tasks", { p_from: shift(DAY, -1), p_to: DAY })); if (n != null) { toast(n === true || n === 0 ? "Nothing to carry forward" : `${n} task(s) carried forward`); reload(); } }; }
  if (admin) {
    sb.rpc("daily_summary_text").then(r => { const p = $("#dsum", el); if (p) p.textContent = r.data || "No summary available"; });
    $("#ds", el).onclick = async () => { if (await run(sb.rpc("send_daily_summary"), "Summary sent to the team")) { /* ok */ } };
  }
  $$(".ts", el).forEach(b => b.onclick = async () => { let note = null; if (b.dataset.s === "done") { note = prompt("Any note? (optional)") ; if (note === null) note = ""; } if (await run(sb.rpc("set_task_status", { p_id: b.dataset.id, p_status: b.dataset.s, p_note: note || null }))) reload(); });
  $$(".te", el).forEach(b => b.onclick = () => form(tasks.find(t => t.id === b.dataset.id)));
  $$(".td", el).forEach(b => b.onclick = async () => { if (confirm("Delete this task?") && await run(sb.from("assignments").delete().eq("id", b.dataset.id), "Deleted")) reload(); });
}
