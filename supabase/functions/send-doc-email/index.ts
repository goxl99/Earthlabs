// Emails an invoice / challan / proforma PDF to a customer through Resend.
// Secrets (Supabase > Edge Functions > Secrets): RESEND_API_KEY, EMAIL_FROM (e.g. "EarthLabs <orders@yourdomain.com>"), optional EMAIL_REPLY_TO.
// Only signed-in admin / qc_officer users can call it. Always returns HTTP 200 with { ok } or { error, message }.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: role } = await sb.rpc("app_role");
    if (!["admin", "qc_officer"].includes(String(role))) return json({ error: "forbidden", message: "Not allowed" });

    const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("EMAIL_FROM");
    if (!key || !from) return json({ error: "not_configured", message: "Email sending is not set up yet (RESEND_API_KEY / EMAIL_FROM)." });

    const { to, subject, text, filename, pdf_base64, cc } = await req.json();
    if (!to || !/^\S+@\S+\.\S+$/.test(String(to))) return json({ error: "bad_address", message: "Customer email address is missing or invalid." });
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(String(text || ""))}</div>`;
    const body: Record<string, unknown> = { from, to: [String(to)], subject: String(subject || "Document from EarthLabs"), text: String(text || ""), html };
    if (cc && /^\S+@\S+\.\S+$/.test(String(cc))) body.cc = [String(cc)];
    const rt = Deno.env.get("EMAIL_REPLY_TO"); if (rt) body.reply_to = rt;
    if (pdf_base64) body.attachments = [{ filename: String(filename || "document.pdf"), content: String(pdf_base64) }];

    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "send_failed", message: out?.message || `Email service said ${r.status}` });
    return json({ ok: true, id: out?.id });
  } catch (e) {
    return json({ error: "failed", message: String((e as Error)?.message || e) });
  }
});
