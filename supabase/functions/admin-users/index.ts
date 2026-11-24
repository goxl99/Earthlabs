// Admin creates / resets logins for team members. Admin only. Always answers HTTP 200 with { ok, ... } or { error, message }.
// Secrets used: RESEND_API_KEY, EMAIL_FROM (optional: EMAIL_REPLY_TO, APP_URL). SUPABASE_SERVICE_ROLE_KEY is provided by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const ROLES = ["operator", "qc_officer", "admin"];
const ROLE_LABEL: Record<string, string> = { operator: "Operator", qc_officer: "QC Officer", admin: "Admin" };
const emailOk = (s: unknown) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function genPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const a = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(a, v => chars[v % chars.length]).join("");
}

async function sendMail(to: string, subject: string, html: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) return { ok: false, error: "Email is not set up (RESEND_API_KEY / EMAIL_FROM)." };
  const body: Record<string, unknown> = { from, to: [to], subject, html, text };
  const rt = Deno.env.get("EMAIL_REPLY_TO"); if (rt) body.reply_to = rt;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: out?.message || `Email service said ${r.status}` };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: role } = await caller.rpc("app_role");
    if (String(role) !== "admin") return json({ error: "forbidden", message: "Only an admin can manage logins." });
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!svc) return json({ error: "not_configured", message: "Server key is missing." });
    const admin = createClient(url, svc, { auth: { persistSession: false } });
    const appUrl = (Deno.env.get("APP_URL") || "https://earthlabs-pi.vercel.app").replace(/\/$/, "");
    const b = await req.json();

    const mailCreds = async (to: string, name: string, roleKey: string, password: string, reset: boolean) => {
      const subject = reset ? "Your EarthLabs password was reset" : "Your EarthLabs login";
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2a1f">
        <p>Hello ${esc(name)},</p>
        <p>${reset ? "Your password for the EarthLabs batch system has been reset by the administrator." : `You have been added to the EarthLabs batch system as <b>${esc(ROLE_LABEL[roleKey] || roleKey)}</b>.`}</p>
        <table style="border-collapse:collapse;margin:12px 0"><tr><td style="padding:4px 12px 4px 0;color:#667">Open</td><td><a href="${appUrl}">${appUrl}</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#667">Login ID</td><td><b>${esc(to)}</b></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#667">Temporary password</td><td><b style="font-family:monospace;font-size:15px">${esc(password)}</b></td></tr></table>
        <p>You will be asked to choose your own password when you sign in the first time. If you forget it later, use <b>Forgot password</b> on the sign-in page.</p>
        <p style="color:#667">EarthLabs</p></div>`;
      const text = `Hello ${name},\n\n${reset ? "Your password was reset." : "You have been added to the EarthLabs batch system as " + (ROLE_LABEL[roleKey] || roleKey) + "."}\nOpen: ${appUrl}\nLogin ID: ${to}\nTemporary password: ${password}\n\nYou will be asked to choose your own password at first sign-in. Forgot it later? Use "Forgot password" on the sign-in page.`;
      return sendMail(to, subject, html, text);
    };

    if (b.action === "create") {
      const email = String(b.email || "").trim().toLowerCase();
      const name = String(b.full_name || "").trim();
      if (!emailOk(email)) return json({ error: "bad_email", message: "Enter a valid email address. It is the login ID." });
      if (!name) return json({ error: "bad_name", message: "Enter the person's name." });
      if (!ROLES.includes(b.role)) return json({ error: "bad_role", message: "Choose a role." });
      const mode = ["weekly", "monthly", "none"].includes(b.plan_mode) ? b.plan_mode : "weekly";
      let password = String(b.password || "").trim(); const generated = !password;
      if (generated) password = genPassword();
      if (password.length < 8) return json({ error: "weak_password", message: "Password must be at least 8 characters." });
      const { data: made, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
      if (ce || !made?.user) return json({ error: "create_failed", message: /already|registered|exists/i.test(ce?.message || "") ? "That email already has a login." : (ce?.message || "Could not create the login.") });
      const id = made.user.id;
      const phone = String(b.phone || "").replace(/[^\d]/g, "") || null;
      // done with the admin's own session: the database only lets a signed-in admin change a role or activate someone
      const { error: pe } = await caller.from("profiles").update({ role: b.role, active: true, full_name: name, phone, plan_mode: mode, plan_email: b.plan_email !== false, must_change: true }).eq("id", id);
      if (pe) return json({ error: "profile_failed", message: "Login created but the profile could not be set: " + pe.message, user_id: id });
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
      const end = new Date(Date.now() + 34 * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
      const { data: n } = await caller.rpc("generate_plan", { p_from: today, p_to: end, p_user: id });
      let emailed = false, email_error: string | undefined;
      if (b.send_email !== false) { const m = await mailCreds(email, name, b.role, password, false); emailed = m.ok; email_error = m.error; }
      return json({ ok: true, user_id: id, email, password: generated || b.show_password ? password : undefined, generated, emailed, email_error, tasks_planned: n ?? 0 });
    }

    if (b.action === "set_password") {
      const { data: prof } = await admin.from("profiles").select("id,email,full_name,role").eq("id", String(b.user_id || "")).maybeSingle();
      if (!prof) return json({ error: "not_found", message: "Member not found." });
      let password = String(b.password || "").trim(); const generated = !password;
      if (generated) password = genPassword();
      if (password.length < 8) return json({ error: "weak_password", message: "Password must be at least 8 characters." });
      const { error: ue } = await admin.auth.admin.updateUserById(prof.id, { password });
      if (ue) return json({ error: "failed", message: ue.message });
      await admin.from("profiles").update({ must_change: true }).eq("id", prof.id);
      let emailed = false, email_error: string | undefined;
      if (b.send_email !== false && prof.email) { const m = await mailCreds(prof.email, prof.full_name || prof.email, prof.role, password, true); emailed = m.ok; email_error = m.error; }
      return json({ ok: true, password: generated || b.show_password ? password : undefined, generated, emailed, email_error });
    }
    return json({ error: "bad_request", message: "Unknown action." });
  } catch (e) {
    return json({ error: "failed", message: String((e as Error)?.message || e) });
  }
});
