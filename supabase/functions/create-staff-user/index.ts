// Super Admin only. Creates a staff login (Super Admin, Sales, Accounts or Warehouse) with a temporary password and e-mails it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { PORTAL, sendMail } from "../_shared/mail.ts";
import { checkStaffInput } from "../_shared/staffUser.ts";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const tempPassword = () => { const r = crypto.getRandomValues(new Uint8Array(12)); return [...r].map((x) => ALPHA[x % ALPHA.length]).join("") + "7"; };

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(o) });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Sign in first" }, 401, o);
  const { data: me } = await admin.from("profiles").select("role,active").eq("id", u.user.id).maybeSingle();
  if (!me?.active || me.role !== "super_admin") return json({ error: "Only Super Admin can create users" }, 403, o);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400, o); }
  const c = checkStaffInput(b);
  if (!c.ok) return json({ error: c.error }, 400, o);
  const v = c.v;

  const pw = tempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({ email: v.email, password: pw, email_confirm: true, user_metadata: { must_change_password: true, full_name: v.full_name } });
  if (error || !created?.user) {
    if (error && /already|registered|exists/i.test(error.message)) return json({ error: "A login already exists for this e-mail" }, 409, o);
    return json({ error: error?.message ?? "Could not create the login" }, 400, o);
  }
  // the new-user trigger made an inactive profile; set the staff role, activate, and add department and territory
  const { error: pe } = await admin.from("profiles").update({ role: v.role, full_name: v.full_name, active: true, partner_id: null, vendor_id: null, department: v.department, territory: v.territory }).eq("id", created.user.id);
  if (pe) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: "Could not set up the profile: " + pe.message }, 500, o); }
  const sent = await sendMail(v.email, "Your EarthLabs staff login",
    `Dear ${v.full_name},\n\nYour EarthLabs staff login is ready.\n\nLogin ID  : ${v.email}\nPassword  : ${pw}\n\nSign in here: ${PORTAL}\nThis is a temporary password. You will be asked to change it when you first sign in.\n\nEarthLabs`);
  return json({ ok: true, created: true, emailed: sent }, 200, o);
});
