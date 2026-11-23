// Creates the partner's login (temporary password, must change on first sign-in) and e-mails the Login ID and password.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PORTAL, sendMail } from "./mail.ts";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const tempPassword = () => { const r = crypto.getRandomValues(new Uint8Array(12)); return [...r].map((x) => ALPHA[x % ALPHA.length]).join("") + "7"; };

export async function provisionPartnerLogin(admin: SupabaseClient, partnerId: string): Promise<{ ok: boolean; created?: boolean; emailed?: boolean; note?: string; error?: string }> {
  const { data: p } = await admin.from("partners").select("id,name,email").eq("id", partnerId).maybeSingle();
  if (!p?.email) return { ok: false, error: "Partner or e-mail not found" };
  const email = p.email.trim().toLowerCase(), pw = tempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { must_change_password: true, full_name: p.name } });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return { ok: true, created: false, note: "A login already exists for this e-mail. The person can use Forgot password." };
    return { ok: false, error: error.message };
  }
  const sent = await sendMail(email, "Your EarthLabs partner login",
    `Dear ${p.name},\n\nYour MOU is signed and your EarthLabs partner login is ready.\n\nPartner ID: ${p.id}\nLogin ID  : ${email}\nPassword  : ${pw}\n\nSign in here: ${PORTAL}\nThis is a temporary password. You will be asked to choose your own password the first time you sign in.\nForgot it later? Use "Forgot password" on the sign-in page.\n\nEarthLabs Partner Network`);
  return { ok: true, created: !!created?.user, emailed: sent };
}
