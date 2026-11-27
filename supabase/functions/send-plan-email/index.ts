// Emails each team member their weekly (Mondays) or monthly (1st) task plan.
// Called (a) by the daily cron with the x-webhook-secret header, mode "due"; (b) by an admin from the app, mode "now" for one person.
// Secrets: RESEND_API_KEY, EMAIL_FROM (optional EMAIL_REPLY_TO, APP_URL). Always answers HTTP 200.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret" };
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const iso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
const fmt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const KIND: Record<string, string> = { production: "Production", filling: "Filling", dispatch: "Dispatch", followup: "Follow-up", other: "Task" };

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!svc) return json({ error: "not_configured", message: "Server key is missing." });
    const admin = createClient(url, svc, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({}));

    let allowed = false;
    const sec = req.headers.get("x-webhook-secret");
    if (sec) { const { data: c } = await admin.from("wa_config").select("webhook_secret").eq("id", 1).maybeSingle(); allowed = !!c && c.webhook_secret === sec; }
    else {
      const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
      const { data: role } = await caller.rpc("app_role"); allowed = String(role) === "admin";
    }
    if (!allowed) return json({ error: "forbidden", message: "Not allowed." });

    const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("EMAIL_FROM");
    if (!key || !from) return json({ error: "not_configured", message: "Email sending is not set up yet (RESEND_API_KEY / EMAIL_FROM)." });
    const appUrl = (Deno.env.get("APP_URL") || "https://earthlabs-pi.vercel.app").replace(/\/$/, "");

    const today = new Date(iso(new Date()) + "T00:00:00");
    const isoDow = (today.getDay() + 6) % 7 + 1, dom = today.getDate();
    const jobs: { id: string; period: "week" | "month" }[] = [];
    if (b.mode === "now") {
      if (!b.user_id) return json({ error: "bad_request", message: "Choose a member." });
      jobs.push({ id: String(b.user_id), period: b.period === "month" ? "month" : "week" });
    } else {
      const { data: ps } = await admin.from("profiles").select("id,plan_mode").eq("active", true).eq("plan_email", true).neq("plan_mode", "none");
      for (const p of ps ?? []) {
        if (p.plan_mode === "weekly" && isoDow === 1) jobs.push({ id: p.id, period: "week" });
        if (p.plan_mode === "monthly" && dom === 1) jobs.push({ id: p.id, period: "month" });
      }
    }

    let sent = 0; const errors: string[] = [];
    for (const j of jobs) {
      const { data: p } = await admin.from("profiles").select("id,full_name,email,role").eq("id", j.id).maybeSingle();
      if (!p?.email) { errors.push("no email for a member"); continue; }
      const from_d = new Date(today), to_d = new Date(today);
      if (j.period === "week") { from_d.setDate(today.getDate() - (isoDow - 1)); to_d.setTime(from_d.getTime()); to_d.setDate(from_d.getDate() + 6); }
      else { from_d.setDate(1); to_d.setMonth(today.getMonth() + 1, 0); }
      const f = iso(from_d), t = iso(to_d);
      const { data: rows } = await admin.from("assignments").select("due_date,kind,title,details,status").eq("assignee", p.id).gte("due_date", f).lte("due_date", t).order("due_date");
      if (!rows?.length) { if (b.mode === "now") errors.push(`${p.full_name || p.email} has no tasks planned for this ${j.period}.`); continue; }
      const label = j.period === "week" ? `week of ${fmt(f)}` : today.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      const trs = rows.map(r => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e3e8e3;white-space:nowrap;color:#556">${esc(fmt(r.due_date))}</td><td style="padding:6px 10px;border-bottom:1px solid #e3e8e3"><b>${esc(r.title)}</b>${r.details ? `<br><span style="color:#667;font-size:13px">${esc(r.details)}</span>` : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #e3e8e3;color:#556">${esc(KIND[r.kind] || "Task")}</td></tr>`).join("");
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2a1f"><p>Hello ${esc(p.full_name || "")},</p><p>Here is your ${j.period === "week" ? "weekly" : "monthly"} plan (${esc(label)}):</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px"><tr style="background:#eef3ee;text-align:left"><th style="padding:6px 10px">Date</th><th style="padding:6px 10px">Task</th><th style="padding:6px 10px">Type</th></tr>${trs}</table>
        <p>Tick tasks off in <b>Daily Plan</b>: <a href="${appUrl}">${appUrl}</a></p><p style="color:#667">EarthLabs</p></div>`;
      const text = `Hello ${p.full_name || ""},\n\nYour ${j.period === "week" ? "weekly" : "monthly"} plan (${label}):\n\n` + rows.map(r => `${fmt(r.due_date)} - ${r.title}`).join("\n") + `\n\nOpen Daily Plan: ${appUrl}`;
      const body: Record<string, unknown> = { from, to: [p.email], subject: `Your ${j.period === "week" ? "weekly" : "monthly"} plan: ${label}`, html, text };
      const rt = Deno.env.get("EMAIL_REPLY_TO"); if (rt) body.reply_to = rt;
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await r.json().catch(() => ({}));
      if (r.ok) sent++; else errors.push(out?.message || `Email service said ${r.status}`);
    }
    if (b.mode === "now" && !sent) return json({ error: "send_failed", message: errors[0] || "Nothing was sent." });
    return json({ ok: true, sent, errors });
  } catch (e) {
    return json({ error: "failed", message: String((e as Error)?.message || e) });
  }
});
