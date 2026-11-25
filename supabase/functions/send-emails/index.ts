// Delivers queued e-mails from public.email_outbox.
// Called two ways, both with the x-cron-secret header: instantly by the database right after mail is queued (trigger email_outbox_kick_t),
// and once a minute by the scheduled job as a retry. Rows are claimed first (public.claim_emails), so the two can never send the same message twice.
// Secrets (set in Supabase, never in the repo): RESEND_API_KEY, MAIL_FROM, CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

type Row = { id: number; to_email: string; subject: string; body: string; attempts: number; reply_to?: string | null };
const CHUNK = 5;

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data } = await db.rpc("claim_emails", { n: 50 });
  const rows = (data as Row[] | null) ?? [];
  let sent = 0;
  async function deliver(m: Row) {
    let ok = false;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: Deno.env.get("MAIL_FROM"), to: m.to_email, subject: m.subject, text: m.body, ...(m.reply_to ? { reply_to: m.reply_to } : {}) }),
      });
      ok = r.ok;
    } catch { ok = false; }
    if (ok) { sent++; await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: m.attempts + 1 }).eq("id", m.id); }
    else await db.from("email_outbox").update({ attempts: m.attempts + 1, status: m.attempts + 1 >= 5 ? "failed" : "queued" }).eq("id", m.id);
  }
  for (let i = 0; i < rows.length; i += CHUNK) await Promise.all(rows.slice(i, i + CHUNK).map(deliver));
  return new Response(JSON.stringify({ sent, tried: rows.length }), { headers: { "Content-Type": "application/json" } });
});
