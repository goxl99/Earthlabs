// "Forgot password": emails a 6-digit code, then sets a new password when the code is right. No sign-in needed (verify_jwt off).
// Secrets: RESEND_API_KEY, EMAIL_FROM (optional EMAIL_REPLY_TO). Always answers HTTP 200 with { ok } or { error, message }.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
const emailOk = (s: unknown) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 200;
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), x => x.toString(16).padStart(2, "0")).join("");

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!svc) return json({ error: "not_configured", message: "Password reset is not available right now." });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, svc, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || "").trim().toLowerCase();
    if (!emailOk(email)) return json({ error: "bad_email", message: "Enter a valid email address." });

    if (b.action === "request") {
      const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("EMAIL_FROM");
      if (!key || !from) return json({ error: "not_configured", message: "Email is not set up yet. Please ask the administrator to reset your password." });
      const { data: prof } = await admin.from("profiles").select("id,full_name,active").eq("email", email).maybeSingle();
      const { data: old } = await admin.from("password_resets").select("created_at").eq("email", email).maybeSingle();
      if (old && Date.now() - new Date(old.created_at).getTime() < 60_000) return json({ error: "too_soon", message: "A code was just sent. Please wait a minute before asking again." });
      if (prof?.active) {   // same answer whether or not the address has a login, so nobody can probe who works here
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
        await admin.from("password_resets").upsert({ email, code_hash: await sha(code + ":" + email), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), attempts: 0, created_at: new Date().toISOString() });
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2a1f"><p>Hello ${String(prof.full_name || "").replace(/[<>&]/g, "")},</p><p>Your EarthLabs password reset code is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold;font-family:monospace">${code}</p><p>It works for 15 minutes. If you did not ask for this, ignore this email; your password stays the same.</p></div>`;
        const body: Record<string, unknown> = { from, to: [email], subject: "Your EarthLabs password reset code", html, text: `Your EarthLabs password reset code is ${code}. It works for 15 minutes.` };
        const rt = Deno.env.get("EMAIL_REPLY_TO"); if (rt) body.reply_to = rt;
        await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else if (!old) {
        await admin.from("password_resets").upsert({ email, code_hash: "-", expires_at: new Date().toISOString(), attempts: 99, created_at: new Date().toISOString() });
      }
      return json({ ok: true });
    }

    if (b.action === "confirm") {
      const password = String(b.password || ""), code = String(b.code || "").replace(/\D/g, "");
      if (password.length < 8) return json({ error: "weak_password", message: "Choose a password of at least 8 characters." });
      const bad = { error: "bad_code", message: "That code is wrong or has expired. Ask for a new one." };
      const { data: r } = await admin.from("password_resets").select("*").eq("email", email).maybeSingle();
      if (!r || r.attempts >= 5 || new Date(r.expires_at).getTime() < Date.now()) return json(bad);
      await admin.from("password_resets").update({ attempts: r.attempts + 1 }).eq("email", email);
      if (code.length !== 6 || (await sha(code + ":" + email)) !== r.code_hash) return json(bad);
      const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (!prof) return json(bad);
      const { error } = await admin.auth.admin.updateUserById(prof.id, { password });
      if (error) return json({ error: "failed", message: error.message });
      await admin.from("profiles").update({ must_change: false }).eq("id", prof.id);
      await admin.from("password_resets").delete().eq("email", email);
      return json({ ok: true });
    }
    return json({ error: "bad_request", message: "Unknown action." });
  } catch (e) {
    return json({ error: "failed", message: String((e as Error)?.message || e) });
  }
});
