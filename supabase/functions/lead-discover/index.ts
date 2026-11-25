// Finds real dealer candidates for one district with Claude's web search and saves them as leads (status Found) for staff to review.
// Nothing is sent from here. Who may call: Super Admin and Sales. The key lives only in the Supabase secret ANTHROPIC_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildDiscoverPrompt, cleanDistrict, DISCOVER_SYSTEM, leadMail, parseLeads } from "../_shared/outreach.ts";

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
  if (!["super_admin", "sales"].includes(role as string)) return json({ error: "Only Super Admin or Sales can search for dealers" }, 403, origin);

  let b: { district?: unknown; focus?: unknown };
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400, origin); }
  const district = cleanDistrict(b.district);
  if (district.length < 3) return json({ error: "Choose a district" }, 400, origin);
  const focus = typeof b.focus === "string" ? b.focus.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300) : "";

  const model = Deno.env.get("AI_MODEL") ?? "claude-sonnet-5-5";
  const urls = new Set<string>();
  let text = "";
  let messages: unknown[] = [{ role: "user", content: buildDiscoverPrompt(district, focus) }];
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 4000, system: DISCOVER_SYSTEM, messages,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "IN", region: "Gujarat" } }] }),
    });
    if (!r.ok) { const d = await r.json().catch(() => null); return json({ error: `The AI service did not answer (${r.status}${d?.error?.message ? ": " + String(d.error.message).slice(0, 160) : ""})` }, 502, origin); }
    const out = await r.json();
    text = "";
    for (const blk of out.content ?? []) {
      if (blk.type === "web_search_tool_result" && Array.isArray(blk.content)) for (const x of blk.content) if (typeof x?.url === "string") urls.add(x.url);
      if (blk.type === "text" && typeof blk.text === "string") text += blk.text;
    }
    if (out.stop_reason === "pause_turn") { messages = [...messages, { role: "assistant", content: out.content }]; continue; }
    break;
  }

  const found = parseLeads(text, urls);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let added = 0, known = 0;
  for (const l of found) {
    if (l.email) {
      const [p, a] = await Promise.all([db.from("partners").select("id").ilike("email", l.email).limit(1), db.from("applications").select("id").ilike("email", l.email).limit(1)]);
      if (p.data?.length || a.data?.length) { known++; continue; }
    }
    const m = leadMail({ name: l.name, business: l.business, district, products: l.products });
    const { error } = await db.from("dealer_leads").insert({ district, name: l.name, business: l.business, email: l.email, phone: l.phone, website: l.website, address: l.address, products: l.products,
      source: "ai_search", source_url: l.source_url, subject: m.subject, body: m.body, created_by: u.user.id, next_step: l.email ? "Review, then approve" : "No e-mail found: call them" });
    if (error) { if (error.code === "23505") known++; continue; }
    added++;
  }
  return json({ added, known, found: found.length }, 200, origin);
});
