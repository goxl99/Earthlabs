// Territory AI advisor: helps staff find potential dealers, draft first-contact e-mails and think through export, from the portal's own territory figures.
// The AI only advises. It sends nothing and changes nothing. Who may call: Super Admin and Sales. The Claude API key lives ONLY in the Supabase secret ANTHROPIC_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildUserPrompt, cleanRequest, parseAdvice, SYSTEM } from "../_shared/territoryAi.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, origin);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "AI is not configured yet (the ANTHROPIC_API_KEY secret is missing)" }, 503, origin);
  const me = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await me.auth.getUser();
  if (!u.user) return json({ error: "Sign in first" }, 401, origin);
  const { data: role } = await me.rpc("my_role");
  if (!["super_admin", "sales"].includes(role as string)) return json({ error: "Only Super Admin or Sales can use the territory advisor" }, 403, origin);

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "Bad request" }, 400, origin); }
  const c = cleanRequest(raw);
  if (!c.ok) return json({ error: c.error }, 400, origin);

  const model = Deno.env.get("AI_MODEL") ?? "claude-sonnet-5-5";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 2200, system: SYSTEM, messages: [{ role: "user", content: buildUserPrompt(c.req) }] }),
  });
  if (!r.ok) { const d = await r.json().catch(() => null); return json({ error: `The AI service did not answer (${r.status}${d?.error?.message ? ": " + String(d.error.message).slice(0, 160) : ""})` }, 502, origin); }
  const out = await r.json();
  const text = (out.content ?? []).map((x: { text?: string }) => x.text ?? "").join("");
  const advice = parseAdvice(text, c.req.mode);
  if (!advice) return json({ error: "The AI reply could not be read. Please try again." }, 502, origin);
  return json({ advice }, 200, origin);
});
