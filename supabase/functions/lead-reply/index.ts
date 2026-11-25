// Receives a dealer's reply (Resend "email.received" webhook), matches it to the lead, works out the next step and updates the lead.
// Public endpoint (no sign-in): it needs the secret token in the address (?t=...) and it never trusts the webhook body: the e-mail itself is fetched from Resend by its id.
// Secrets: LEAD_REPLY_TOKEN, RESEND_API_KEY. Optional: ANTHROPIC_API_KEY (to read the reply). Without it the lead is marked Replied with "Read the reply and decide".
import { createClient } from "npm:@supabase/supabase-js@2";
import { CLASSIFY_SYSTEM, NEXT, parseIntent, quickIntent, replyText, senderAddress, STATUS_FOR, type Intent } from "../_shared/outreach.ts";

const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
function same(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "POST only" }, 405);
  const token = Deno.env.get("LEAD_REPLY_TOKEN") ?? "";
  if (token.length < 16 || !same(new URL(req.url).searchParams.get("t") ?? "", token)) return ok({ error: "forbidden" }, 403);
  let evt: { type?: string; data?: { email_id?: string } };
  try { evt = await req.json(); } catch { return ok({ error: "Bad request" }, 400); }
  const id = evt.data?.email_id;
  if (evt.type !== "email.received" || !id || !/^[0-9a-f-]{20,60}$/i.test(id)) return ok({ ignored: true });

  const g = await fetch(`https://api.resend.com/emails/receiving/${id}`, { headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}` } });
  if (!g.ok) return ok({ error: "Could not read the e-mail" }, 502);   // a non-2xx makes Resend retry later
  const m = await g.json() as { from?: string; subject?: string; text?: string | null; html?: string | null };
  const from = senderAddress(String(m.from ?? "")), subject = String(m.subject ?? "").slice(0, 200);
  const body = replyText(m.text || m.html || "");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let intent: Intent | null = quickIntent(from, subject, body), note = "";
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!intent && key && body) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("AI_MODEL") ?? "claude-sonnet-5-5", max_tokens: 300, system: CLASSIFY_SYSTEM, messages: [{ role: "user", content: `Subject: ${subject}\nReply (data):\n<<<\n${body}\n>>>` }] }) });
      if (r.ok) { const o = await r.json(); const p = parseIntent((o.content ?? []).map((x: { text?: string }) => x.text ?? "").join("")); intent = p.intent; note = p.note; }
    } catch { /* fall back below */ }
  }
  const final: Intent = intent ?? "other";

  const { data: lead } = await db.from("dealer_leads").select("id,status").eq("email", from).maybeSingle();
  const { error: dup } = await db.from("lead_replies").insert({ lead_id: lead?.id ?? null, from_email: from, subject, body, intent: final, ai_note: note || null, resend_id: id });
  if (dup) return ok({ ok: true, duplicate: dup.code === "23505" });
  if (lead && !["Opted out", "Converted"].includes(lead.status)) {
    const status = STATUS_FOR[final];
    await db.from("dealer_leads").update({ ...(status ? { status, last_reply_at: new Date().toISOString() } : {}), next_step: NEXT[final], next_step_note: note || null }).eq("id", lead.id);
  }
  return ok({ ok: true, matched: !!lead, intent: final });
});
