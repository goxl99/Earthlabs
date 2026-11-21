// Delivers queued e-mails from public.email_outbox. Called on a schedule (every few minutes) with the service key.
// Secrets (set in Supabase, never in the repo): RESEND_API_KEY, MAIL_FROM, CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await db.from("email_outbox").select("id,to_email,subject,body,attempts").eq("status", "queued").lt("attempts", 5).order("created_at").limit(50);
  let sent = 0;
  for (const m of rows ?? []) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("MAIL_FROM"), to: m.to_email, subject: m.subject, text: m.body }),
    });
    if (r.ok) { sent++; await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: m.attempts + 1 }).eq("id", m.id); }
    else await db.from("email_outbox").update({ attempts: m.attempts + 1, status: m.attempts + 1 >= 5 ? "failed" : "queued" }).eq("id", m.id);
  }
  return new Response(JSON.stringify({ sent, tried: rows?.length ?? 0 }), { headers: { "Content-Type": "application/json" } });
});
