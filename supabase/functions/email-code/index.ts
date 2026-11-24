// Public. Sends and checks a 6-digit e-mail verification code before an application can be submitted.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { sendMail } from "../_shared/mail.ts";

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(o) });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let b: { action?: string; email?: string; code?: string } = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400, o); }
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return json({ error: "Enter a valid e-mail address" }, 400, o);

  if (b.action === "send") {
    const used = (await db.from("applications").select("id", { count: "exact", head: true }).ilike("email", email)).count
      || (await db.from("partners").select("id", { count: "exact", head: true }).ilike("email", email)).count;
    if (used) return json({ error: "This e-mail has already been used to apply. Each application needs its own e-mail address. You can track the earlier one from the Track page." }, 409, o);
    const { data: ex } = await db.from("email_verifications").select("*").eq("email", email).maybeSingle();
    const now = Date.now();
    let sends = 1, ws = new Date(now).toISOString();
    if (ex) {
      const fresh = now - new Date(ex.window_start).getTime() < 3600_000;
      if (fresh && ex.sends >= 5) return json({ error: "Too many codes requested. Please try again in an hour." }, 429, o);
      sends = fresh ? ex.sends + 1 : 1; ws = fresh ? ex.window_start : new Date(now).toISOString();
    }
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await db.from("email_verifications").upsert({ email, code_hash: await sha(code + email), expires_at: new Date(now + 10 * 60_000).toISOString(), attempts: 0, sends, window_start: ws, verified_at: null });
    const ok = await sendMail(email, "Your EarthLabs verification code: " + code,
      `Your EarthLabs verification code is ${code}\n\nIt is valid for 10 minutes. Enter it on the registration page to confirm this e-mail address.\nIf you did not ask for this, you can ignore this e-mail.\n\nEarthLabs Partner Network`);
    return ok ? json({ ok: true }, 200, o) : json({ error: "We could not send the e-mail. Please try again in a minute." }, 502, o);
  }

  if (b.action === "verify") {
    const { data: ex } = await db.from("email_verifications").select("*").eq("email", email).maybeSingle();
    if (!ex || new Date(ex.expires_at).getTime() < Date.now()) return json({ error: "This code has expired. Please ask for a new one." }, 400, o);
    if (ex.attempts >= 5) return json({ error: "Too many wrong attempts. Please ask for a new code." }, 429, o);
    if (await sha(String(b.code ?? "").trim() + email) !== ex.code_hash) {
      await db.from("email_verifications").update({ attempts: ex.attempts + 1 }).eq("email", email);
      return json({ error: "That code is not correct." }, 400, o);
    }
    await db.from("email_verifications").update({ verified_at: new Date().toISOString() }).eq("email", email);
    return json({ ok: true }, 200, o);
  }
  return json({ error: "Bad request" }, 400, o);
});
