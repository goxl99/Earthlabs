// Delivers queued WhatsApp messages from public.whatsapp_outbox through Meta's WhatsApp Cloud API.
// Called on a schedule (every few minutes) with the cron secret. Nothing is queued until Super Admin sets settings.whatsapp = {"enabled":true}.
// Secrets (set in Supabase, never in the repo): WA_PHONE_ID, WA_TOKEN, CRON_SECRET. Optional: WA_TEMPLATE (an approved template with one body variable)
// and WA_TEMPLATE_LANG (default en). Outside the 24-hour customer window Meta only delivers approved templates, so set WA_TEMPLATE for real use.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const phone = Deno.env.get("WA_PHONE_ID"), token = Deno.env.get("WA_TOKEN");
  if (!phone || !token) return new Response(JSON.stringify({ error: "WA_PHONE_ID / WA_TOKEN are not set" }), { status: 500 });
  const tpl = Deno.env.get("WA_TEMPLATE"), lang = Deno.env.get("WA_TEMPLATE_LANG") ?? "en";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await db.from("whatsapp_outbox").select("id,to_phone,body,attempts").eq("status", "queued").lt("attempts", 5).order("created_at").limit(50);
  let sent = 0;
  for (const m of rows ?? []) {
    const payload = tpl
      ? { messaging_product: "whatsapp", to: m.to_phone, type: "template", template: { name: tpl, language: { code: lang }, components: [{ type: "body", parameters: [{ type: "text", text: m.body.replace(/\s+/g, " ").slice(0, 900) }] }] } }
      : { messaging_product: "whatsapp", to: m.to_phone, type: "text", text: { body: m.body } };
    const r = await fetch(`https://graph.facebook.com/v20.0/${phone}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { sent++; await db.from("whatsapp_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: m.attempts + 1 }).eq("id", m.id); }
    else await db.from("whatsapp_outbox").update({ attempts: m.attempts + 1, status: m.attempts + 1 >= 5 ? "failed" : "queued" }).eq("id", m.id);
  }
  return new Response(JSON.stringify({ sent, tried: rows?.length ?? 0 }), { headers: { "Content-Type": "application/json" } });
});
