// AI recommendations. Staff trigger it; the Claude API key lives ONLY in the Supabase secret ANTHROPIC_API_KEY (never in the repo).
// Secrets: ANTHROPIC_API_KEY (required), AI_MODEL (optional, default below). Flow: facts from the database (ids and numbers only)
// -> Claude -> validated against the facts -> stored as Pending. Credit changes go in as credit proposals. Nothing is approved here.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildUserPrompt, parseRecommendations, SYSTEM_PROMPT, type Facts } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, origin);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "AI is not configured yet (ANTHROPIC_API_KEY secret is missing)" }, 503, origin);
  const me = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await me.auth.getUser();
  if (!u.user) return json({ error: "Sign in first" }, 401, origin);
  const { data: role } = await me.rpc("my_role");
  if (!["super_admin", "sales", "accounts", "warehouse"].includes(role as string)) return json({ error: "Staff only" }, 403, origin);

  const { data: facts, error: fe } = await me.rpc("ai_facts");         // runs as the caller: staff only, no names or prices
  if (fe || !facts) return json({ error: fe?.message ?? "No facts" }, 500, origin);

  const model = Deno.env.get("AI_MODEL") ?? "claude-sonnet-4-5";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 2000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: buildUserPrompt(facts as Facts) }] }),
  });
  if (!r.ok) return json({ error: "The AI service did not answer", status: r.status }, 502, origin);
  const out = await r.json();
  const text = (out.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const { recs, dropped } = parseRecommendations(text, facts as Facts);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let credit = 0; const rest = [];
  for (const rec of recs) {
    if (rec.kind === "credit") {
      const { error } = await db.rpc("ai_propose_credit", { k: rec.target_kind, i: rec.target_id, to_lvl: (rec.payload as { to_level: number }).to_level, why: rec.reasons.join("; ") });
      if (!error) credit++;                                            // a duplicate open proposal is simply skipped
    } else rest.push(rec);
  }
  let stored = 0;
  if (rest.length) { const { data, error } = await db.rpc("ai_store_recommendations", { items: rest, mdl: model }); if (error) return json({ error: error.message }, 500, origin); stored = data as number; }
  return json({ ok: true, stored, credit_proposals: credit, dropped }, 200, origin);
});
