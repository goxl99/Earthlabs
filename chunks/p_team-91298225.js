import{a as sb,e as esc,f as $,g as $$,o as toast,p as run,q as modal}from"./chunk-RFCTVU6U.js";
import"./chunk-QHDNOTBI.js";

// ---------- helpers (exported for tests) ----------
export const ROLES = [["operator", "Operator"], ["qc_officer", "QC Officer"], ["admin", "Admin"]];
export const roleName = r => (ROLES.find(x => x[0] === r) || [, r])[1];
export const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const KINDS = [["production", "Production"], ["filling", "Filling / packing"], ["dispatch", "Dispatch"], ["followup", "Follow-up"], ["other", "Other"]];
export const whenText = t => t.frequency === "daily" ? "Every working day (Mon–Sat)" : t.frequency === "weekly" ? "Every " + DAYS[t.weekday] : "Day " + t.month_day + " of each month";
export const modeText = m => m === "monthly" ? "Monthly plan" : m === "none" ? "No plan" : "Weekly plan";
export const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const dlong = s => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };

// calls an edge function; shows the plain message when it answers with an error
async function call(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) { toast("Could not reach the server. Check your internet and try again.", "err"); return null; }
  if (data?.error) { toast(data.message || "Something went wrong", "err"); return null; }
  return data;
}

// ---------- page ----------
export async function teamPage(el) {
  el.innerHTML = '<div class="loading">Loading team…</div>';
  const [pr, tr, me] = await Promise.all([
    sb.from("profiles").select("id,full_name,email,role,active,phone,plan_mode,plan_email,must_change,created_at").order("created_at"),
    sb.from("task_templates").select("*").order("role").order("frequency").order("weekday").order("month_day"),
    sb.auth.getUser(),
  ]);
  const people = pr.data || [], tpls = tr.data || [], myId = me?.data?.user?.id;
  const reload = () => teamPage(el);

  const members = people.map(p => `<tr data-id="${esc(p.id)}">
    <td data-l="Name"><b>${esc(p.full_name || "–")}</b>${p.must_change ? ' <span class="badge warn" title="Has not chosen their own password yet">new</span>' : ""}${p.active ? "" : ' <span class="badge bad">inactive</span>'}<div class="muted small">${esc(p.email || "")}</div></td>
    <td data-l="Role">${esc(roleName(p.role))}</td>
    <td data-l="Plan"><select class="pm">${["weekly", "monthly", "none"].map(m => `<option value="${m}" ${p.plan_mode === m ? "selected" : ""}>${modeText(m)}</option>`).join("")}</select>
      <label class="small"><input type="checkbox" class="pe" ${p.plan_email ? "checked" : ""}> email it</label></td>
    <td data-l="Actions"><div class="row wrap"><button class="btn ghost sm vp">View plan</button><button class="btn ghost sm ep">Email plan now</button><button class="btn ghost sm rp">Reset password</button></div></td></tr>`).join("");

  const roleBlock = ([r, label]) => {
    const rows = tpls.filter(t => t.role === r);
    return `<div class="card"><div class="row between wrap"><h4 style="margin:0">${esc(label)}</h4><button class="btn ghost sm at" data-r="${r}">+ Add task</button></div>
      ${rows.length ? `<div class="tbl-wrap"><table class="tbl keep"><thead><tr><th>When</th><th>Task</th><th>Type</th><th>On</th><th></th></tr></thead><tbody>${rows.map(t => `<tr data-t="${esc(t.id)}"><td>${esc(whenText(t))}</td><td><b>${esc(t.title)}</b>${t.details ? `<div class="muted small">${esc(t.details)}</div>` : ""}</td><td>${esc((KINDS.find(k => k[0] === t.kind) || [, t.kind])[1])}</td><td><input type="checkbox" class="ta" ${t.active ? "checked" : ""}></td><td><button class="btn ghost sm td" aria-label="Delete task">✕</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No tasks set for this role.</p>'}</div>`;
  };

  el.innerHTML = `<div class="page-h row between wrap"><div><h2 style="margin:0">Team &amp; plans</h2><p class="muted" style="margin:2px 0 0">Create logins, and set what each role does every day, week and month.</p></div><button class="btn" id="tm-add">+ Add team member</button></div>
  <section class="card"><h3>Team members</h3>${people.length ? `<div class="tbl-wrap"><table class="tbl keep" id="tm-t"><thead><tr><th>Member (login ID is the email)</th><th>Role</th><th>Plan</th><th></th></tr></thead><tbody>${members}</tbody></table></div>` : '<p class="muted">No members yet.</p>'}
  <p class="muted small">Role and active status are changed on the Users page. Tasks come from the role plans below and appear in each person's Daily Plan. A person on a weekly plan gets an email every Monday morning, a monthly plan on the 1st.</p></section>
  <section class="card"><div class="row between wrap"><h3 style="margin:0">Task plans by role</h3><button class="btn ghost sm" id="tm-gen">Update everyone's plan now</button></div>
  <p class="muted small">These repeat automatically. Changes apply to the next 5 weeks once you press "Update everyone's plan now" (it also runs every morning). Tasks already ticked off stay as they are.</p>
  <div class="grid-auto">${ROLES.map(roleBlock).join("")}</div></section>`;

  const idOf = b => b.closest("tr").dataset.id, person = id => people.find(p => p.id === id);
  $("#tm-add", el).onclick = () => addModal(reload);
  $("#tm-gen", el).onclick = async () => {
    const n = await run(sb.rpc("generate_plan", { p_from: todayIso(), p_to: addDays(todayIso(), 34) }), null);
    if (n != null) { toast(n === true || n === 0 ? "Everyone's plan is up to date" : `${n} new task${n === 1 ? "" : "s"} added`); }
  };
  $$(".pm,.pe", el).forEach(c => c.onchange = async () => {
    const tr = c.closest("tr"); const ok = await run(sb.rpc("save_member_plan", { p_user: tr.dataset.id, p_mode: $(".pm", tr).value, p_email: $(".pe", tr).checked }), "Plan saved");
    if (ok && $(".pm", tr).value !== "none") await run(sb.rpc("generate_plan", { p_from: todayIso(), p_to: addDays(todayIso(), 34), p_user: tr.dataset.id }), null);
  });
  $$(".vp", el).forEach(b => b.onclick = () => planModal(person(idOf(b))));
  $$(".ep", el).forEach(b => b.onclick = () => emailModal(person(idOf(b))));
  $$(".rp", el).forEach(b => b.onclick = () => resetModal(person(idOf(b)), reload, myId));
  $$(".at", el).forEach(b => b.onclick = () => templateModal(b.dataset.r, reload));
  $$(".ta", el).forEach(c => c.onchange = async () => { await run(sb.from("task_templates").update({ active: c.checked }).eq("id", c.closest("tr").dataset.t), "Saved"); });
  $$(".td", el).forEach(b => b.onclick = async () => { if (confirm("Delete this repeating task? Tasks already planned stay in the Daily Plan.")) { if (await run(sb.from("task_templates").delete().eq("id", b.closest("tr").dataset.t), "Deleted")) reload(); } });
}

// ---------- add member ----------
function addModal(done) {
  modal("Add a team member", `<form id="am" class="form-grid">
    <label>Full name<input name="full_name" required autocomplete="off"></label>
    <label>Login ID (their email)<input name="email" type="email" required autocomplete="off"><small>They sign in with this email.</small></label>
    <label>Role<select name="role">${ROLES.map(r => `<option value="${r[0]}">${r[1]}</option>`).join("")}</select></label>
    <label>WhatsApp number (optional)<input name="phone" inputmode="tel" autocomplete="off"></label>
    <label>Password<input name="password" type="text" minlength="8" autocomplete="off" placeholder="Leave empty to make one for them"><small>At least 8 characters. They must change it at first sign-in.</small></label>
    <label>Task plan<select name="plan_mode"><option value="weekly">Weekly plan (emailed every Monday)</option><option value="monthly">Monthly plan (emailed on the 1st)</option><option value="none">No plan</option></select></label>
    <label class="full"><input type="checkbox" name="send_email" checked> Email the login ID and password to them now</label>
    <div class="full row end"><button class="btn" type="submit" id="am-b">Create login</button></div></form>`, {
    onMount: (m, close) => {
      $("#am", m).onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target), v = Object.fromEntries(f.entries());
        if (!emailOk(v.email)) return toast("Enter a valid email address", "err");
        const b = $("#am-b", m); b.disabled = true;
        const r = await call("admin-users", { action: "create", full_name: v.full_name, email: v.email, role: v.role, phone: v.phone, password: v.password, plan_mode: v.plan_mode, send_email: !!v.send_email, show_password: true });
        b.disabled = false; if (!r) return;
        close(); done(); resultModal(v.full_name, r, v.plan_mode);
      };
    },
  });
}

function resultModal(name, r, mode) {
  const mailLine = r.emailed ? `<p class="notice ok">Login details were emailed to <b>${esc(r.email || "them")}</b>.</p>` : `<p class="notice">${r.email_error ? "The email could not be sent: " + esc(r.email_error) + ". " : ""}Share these details with them yourself.</p>`;
  modal(`Login ready for ${name}`, `${mailLine}
    <table class="tbl keep"><tbody>${r.email ? `<tr><th>Login ID</th><td>${esc(r.email)}</td></tr>` : ""}<tr><th>Password</th><td><b style="font-family:monospace;font-size:1.1em">${esc(r.password || "(the one you typed)")}</b></td></tr></tbody></table>
    <p class="muted small">They must choose their own password the first time they sign in. Close this window and the password is not shown again.</p>
    ${r.tasks_planned != null && mode !== "none" ? `<p>${r.tasks_planned} task${r.tasks_planned === 1 ? "" : "s"} planned for the next 5 weeks.</p>` : ""}
    <div class="row end"><button class="btn ghost" id="rm-copy">Copy login details</button>${r.user_id && mode !== "none" ? '<button class="btn" id="rm-plan">Email their plan now</button>' : ""}</div>`, {
    onMount: m => {
      const cp = $("#rm-copy", m); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(`EarthLabs login\n${location.origin}\nLogin ID: ${r.email}\nPassword: ${r.password}`); toast("Copied"); } catch { toast("Could not copy", "err"); } };
      const pb = $("#rm-plan", m); if (pb) pb.onclick = async () => { pb.disabled = true; const x = await call("send-plan-email", { mode: "now", user_id: r.user_id, period: mode === "monthly" ? "month" : "week" }); pb.disabled = false; if (x) toast("Plan emailed"); };
    },
  });
}

// ---------- reset password ----------
function resetModal(p, done, myId) {
  modal(`Reset password: ${p.full_name || p.email}`, `<form id="rf" class="form-grid">
    <label class="full">New password<input name="password" type="text" minlength="8" autocomplete="off" placeholder="Leave empty to make one"><small>At least 8 characters. They must change it when they sign in.</small></label>
    <label class="full"><input type="checkbox" name="send_email" checked> Email it to ${esc(p.email || "them")}</label>
    <div class="full row end"><button class="btn" type="submit" id="rf-b">Reset password</button></div></form>`, {
    onMount: (m, close) => {
      $("#rf", m).onsubmit = async e => {
        e.preventDefault(); const v = Object.fromEntries(new FormData(e.target).entries());
        if (p.id === myId && !confirm("This resets your own password. Continue?")) return;
        const b = $("#rf-b", m); b.disabled = true;
        const r = await call("admin-users", { action: "set_password", user_id: p.id, password: v.password, send_email: !!v.send_email, show_password: true });
        b.disabled = false; if (!r) return;
        close(); done(); resultModal(p.full_name || p.email, { ...r, email: p.email }, "none");
      };
    },
  });
}

// ---------- view plan / email plan ----------
async function planModal(p) {
  const from = todayIso(), to = addDays(from, 34);
  const { data } = await sb.from("assignments").select("due_date,title,kind,status").eq("assignee", p.id).gte("due_date", from).lte("due_date", to).order("due_date");
  const rows = data || [];
  modal(`Plan for ${p.full_name || p.email}`, `<p class="muted small">Next 5 weeks · ${esc(modeText(p.plan_mode))}</p>${rows.length ? `<div class="tbl-wrap"><table class="tbl keep"><thead><tr><th>Date</th><th>Task</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(dlong(r.due_date))}</td><td>${esc(r.title)}</td><td>${esc(r.status)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No tasks planned. Check the role plans below, or that this person is on a plan.</p>'}`);
}
function emailModal(p) {
  modal(`Email plan to ${p.full_name || p.email}`, `<p>Send ${esc(p.email || "")} their task list now.</p><div class="row"><button class="btn" id="ew">This week</button><button class="btn ghost" id="em">This month</button></div>`, {
    onMount: (m, close) => {
      const go = per => async () => { const r = await call("send-plan-email", { mode: "now", user_id: p.id, period: per }); if (r) { toast("Plan emailed"); close(); } };
      $("#ew", m).onclick = go("week"); $("#em", m).onclick = go("month");
    },
  });
}

// ---------- add a repeating task ----------
function templateModal(role, done) {
  modal(`Add a repeating task for ${roleName(role)}`, `<form id="tf" class="form-grid">
    <label class="full">Task<input name="title" required maxlength="140"></label>
    <label class="full">Details (optional)<input name="details" maxlength="300"></label>
    <label>How often<select name="frequency"><option value="daily">Every working day</option><option value="weekly" selected>Every week</option><option value="monthly">Every month</option></select></label>
    <label id="wd-w">On<select name="weekday">${DAYS.slice(1).map((d, i) => `<option value="${i + 1}">${d}</option>`).join("")}</select></label>
    <label id="md-w" class="hide">Day of the month<input name="month_day" type="number" min="1" max="31" value="1"></label>
    <label>Type<select name="kind">${KINDS.map(k => `<option value="${k[0]}">${k[1]}</option>`).join("")}</select></label>
    <div class="full row end"><button class="btn" type="submit">Add task</button></div></form>`, {
    onMount: (m, close) => {
      const sel = $('[name="frequency"]', m), sync = () => { $("#wd-w", m).classList.toggle("hide", sel.value !== "weekly"); $("#md-w", m).classList.toggle("hide", sel.value !== "monthly"); };
      sel.onchange = sync; sync();
      $("#tf", m).onsubmit = async e => {
        e.preventDefault(); const v = Object.fromEntries(new FormData(e.target).entries());
        const row = { role, title: v.title.trim(), details: v.details?.trim() || null, frequency: v.frequency, kind: v.kind, weekday: v.frequency === "weekly" ? Number(v.weekday) : null, month_day: v.frequency === "monthly" ? Number(v.month_day) : null };
        if (!row.title) return toast("Write the task", "err");
        if (await run(sb.from("task_templates").insert(row), "Task added")) { close(); done(); }
      };
    },
  });
}
