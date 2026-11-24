// Super Admin only. After an application (or vendor) is approved: creates the login with a temporary password and e-mails the Login ID and password.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { PORTAL, sendMail } from "../_shared/mail.ts";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const tempPassword = () => { const r = crypto.getRandomValues(new Uint8Array(12)); return [...r].map((x) => ALPHA[x % ALPHA.length]).join("") + "7"; };

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(o) });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Sign in first" }, 401, o);
  const { data: me } = await admin.from("profiles").select("role,active").eq("id", u.user.id).maybeSingle();
  if (!me?.active || me.role !== "super_admin") return json({ error: "Only Super Admin can issue logins" }, 403, o);

  let b: { partner_id?: string; vendor_id?: string } = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400, o); }
  let email = "", name = "", idLabel = "", kind = "";
  if (b.partner_id) {
    const { data: p } = await admin.from("partners").select("id,name,email").eq("id", b.partner_id).maybeSingle();
    if (!p?.email) return json({ error: "Partner or e-mail not found" }, 404, o);
    email = p.email; name = p.name; idLabel = `Partner ID: ${p.id}`; kind = "partner";
  } else if (b.vendor_id) {
    const { data: v } = await admin.from("vendors").select("id,name,email,status").eq("id", b.vendor_id).maybeSingle();
    if (!v?.email) return json({ error: "Vendor or e-mail not found" }, 404, o);
    if (v.status === "Suspended") return json({ error: "Vendor is suspended" }, 400, o);
    email = v.email; name = v.name; idLabel = `Vendor ID: ${v.id}`; kind = "vendor";
  } else return json({ error: "Bad request" }, 400, o);
  email = email.trim().toLowerCase();

  const pw = tempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { must_change_password: true, full_name: name } });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return json({ ok: true, created: false, note: "A login already exists for this e-mail. The person can use Forgot password." }, 200, o);
    return json({ error: error.message }, 400, o);
  }
  const sent = await sendMail(email, `Your EarthLabs ${kind} login`,
    `Dear ${name},\n\nWelcome to EarthLabs. Your ${kind} login is ready.\n\n${idLabel}\nLogin ID  : ${email}\nPassword  : ${pw}\n\nSign in here: ${PORTAL}\nThis is a temporary password. You will be asked to choose your own password the first time you sign in.\nForgot it later? Use "Forgot password" on the sign-in page.\n\nEarthLabs Partner Network`);
  return json({ ok: true, created: !!created?.user, emailed: sent }, 200, o);
});
