// Public. E-mails a one-time reset link. Always answers the same, so nobody can find out which e-mails have logins.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { PORTAL, sendMail } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(o) });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let email = "";
  try { email = String((await req.json()).email ?? "").trim().toLowerCase(); } catch { /* ignore */ }
  if (/^\S+@\S+\.\S+$/.test(email)) {
    const { data } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const th = data?.properties?.hashed_token;
    if (th) await sendMail(email, "Reset your EarthLabs password",
      `We received a request to reset your EarthLabs password.\n\nChoose a new password here (the link works once, for a short time):\n${PORTAL}reset/?token_hash=${encodeURIComponent(th)}\n\nIf you did not ask for this, you can ignore this e-mail; your password is unchanged.\n\nEarthLabs Partner Network`);
  }
  return json({ ok: true }, 200, o);
});
