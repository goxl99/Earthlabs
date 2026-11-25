// Finds real dealer candidates for one district with Claude's web search and saves them as leads (status Found) for staff to review.
// Two passes: (1) search the district for dealers of similar products; (2) for leads that came from a directory or have no e-mail, look for the
// business's OWN website or contact page. Directory-only leads and stale pages are dropped. Nothing is sent from here.
// Who may call: Super Admin and Sales. The key lives only in the Supabase secret ANTHROPIC_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildDiscoverPrompt, buildEnrichPrompt, cleanDistrict, DISCOVER_SYSTEM, ENRICH_SYSTEM, leadMail, mergeEnriched, parseEnrich, parseLeads } from "../_shared/outreach.ts";

type Found = { text: string; urls: Set<string>; ages: Map<string, string> };

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
  const t0 = Date.now();
  /** One web-search conversation. Collects the pages the search returned (and how old they say they are) so every lead can be checked against them. */
  async function ask(system: string, prompt: string, maxUses: number): Promise<Found | string> {
    const urls = new Set<string>(), ages = new Map<string, string>();
    let text = "", messages: unknown[] = [{ role: "user", content: prompt }];
    for (let i = 0; i < 3; i++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "x-api-key": key!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 4000, system, messages,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses, user_location: { type: "approximate", country: "IN", region: "Gujarat" } }] }),
      });
      if (!r.ok) { const d = await r.json().catch(() => null); return `The AI service did not answer (${r.status}${d?.error?.message ? ": " + String(d.error.message).slice(0, 160) : ""})`; }
      const out = await r.json();
      text = "";
      for (const blk of out.content ?? []) {
        if (blk.type === "web_search_tool_result" && Array.isArray(blk.content)) for (const x of blk.content) if (typeof x?.url === "string") { urls.add(x.url); if (typeof x.page_age === "string") ages.set(x.url, x.page_age); }
        if (blk.type === "text" && typeof blk.text === "string") text += blk.text;
      }
      if (out.stop_reason === "pause_turn" && Date.now() - t0 < 100000) { messages = [...messages, { role: "assistant", content: out.content }]; continue; }
      break;
    }
    return { text, urls, ages };
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: have } = await db.from("dealer_leads").select("business").eq("district", district).limit(60);
  const known = (have ?? []).map((x: { business: string | null }) => x.business ?? "").filter(Boolean);

  const s1 = await ask(DISCOVER_SYSTEM, buildDiscoverPrompt(district, focus, known), 8);
  if (typeof s1 === "string") return json({ error: s1 }, 502, origin);
  let found = parseLeads(s1.text, s1.urls, s1.ages);
  const parsed = found.length;

  // Pass 2: leads from a directory, or without an e-mail, get a look at their own website / contact page.
  const need = found.filter((l) => l.directory || !l.email).slice(0, 8);
  if (need.length && Date.now() - t0 < 85000) {
    const s2 = await ask(ENRICH_SYSTEM, buildEnrichPrompt(district, need), 6);
    if (typeof s2 !== "string") {
      const m = parseEnrich(s2.text, s2.urls, s2.ages);
      found = found.map((l) => { const e = m.get(l.business.toLowerCase()); return e ? mergeEnriched(l, e) : l; });
    }
  }
  // A lead that is still only on a directory page is kept only when that page is known to be recent (12 months or less).
  const kept = found.filter((l) => !l.directory || (l.age_months !== null && l.age_months <= 12));

  let added = 0, dup = 0, withEmail = 0;
  for (const l of kept) {
    if (l.email) {
      const [p, a] = await Promise.all([db.from("partners").select("id").ilike("email", l.email).limit(1), db.from("applications").select("id").ilike("email", l.email).limit(1)]);
      if (p.data?.length || a.data?.length) { dup++; continue; }
    }
    const m = leadMail({ name: l.name, business: l.business, district, products: l.products });
    const { error } = await db.from("dealer_leads").insert({ district, name: l.name, business: l.business, email: l.email, phone: l.phone, website: l.website, address: l.address, products: l.products,
      source: "ai_search", source_url: l.source_url, subject: m.subject, body: m.body, created_by: u.user.id, next_step: l.email ? "Review, then approve" : l.phone ? "No e-mail found: WhatsApp or call them" : "Add a contact" });
    if (error) { if (error.code === "23505") dup++; continue; }
    added++; if (l.email) withEmail++;
  }
  return json({ added, withEmail, known: dup, found: parsed, dropped: parsed - kept.length }, 200, origin);
});
