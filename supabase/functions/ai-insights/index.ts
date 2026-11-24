// Business advisor: turns the numbers sent from the app into plain-language recommendations.
// Needs the ANTHROPIC_API_KEY secret (optional: ANTHROPIC_MODEL). Admin only. Always answers HTTP 200 with { insights } or { error, message }.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

const TOOL = {
  name: "give_insights",
  description: "Return the advice for the founder.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "One or two plain sentences: the single most important thing to know right now." },
      recommendations: {
        type: "array", maxItems: 6,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            why: { type: "string", description: "Evidence from the supplied numbers, quoting the figures." },
            action: { type: "string", description: "A concrete next step the founder can do this week." },
            impact: { type: "string", enum: ["high", "medium", "low"] },
            area: { type: "string", enum: ["pricing", "cost", "sales", "collections", "stock", "production", "data_quality", "cash"] },
          },
          required: ["title", "why", "action", "impact", "area"],
        },
      },
      watch_out: { type: "array", maxItems: 4, items: { type: "string" }, description: "Risks or data problems that make the numbers unreliable." },
    },
    required: ["headline", "recommendations"],
  },
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: role } = await sb.rpc("app_role");
    if (String(role) !== "admin") return json({ error: "forbidden", message: "Only admin can use this." });
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "not_configured", message: "AI advice is not switched on yet (API key missing)." });

    const { topic, context } = await req.json();
    const focus = topic === "unit_economics"
      ? "Focus on unit economics: price, margins, packaging, fixed-cost absorption, and what MRP or cost change would reach the target margin."
      : "Look across sales, profit by order and customer, collections, expenses, stock and production, and say what to do first.";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
        max_tokens: 2500,
        system: "You advise the non-technical founder of EarthLabs, a small Indian herbal hand-wash and cleaning-products manufacturer in Vadodara, selling sachets (5 ml) and bottles (250 ml) mostly B2B. " +
          "Use only the numbers supplied. Never invent figures. Quote the numbers you rely on, in rupees. If costs look incomplete (zero or missing rates, a packing cost larger than the sale, one order carrying all overheads), say the numbers are unreliable and put fixing the data first. " +
          "Be specific, short and practical. Plain English, no jargon. Rank by impact. The model is indicative, not exact.",
        tools: [TOOL], tool_choice: { type: "tool", name: "give_insights" },
        messages: [{ role: "user", content: `${focus}\n\nData (JSON):\n${JSON.stringify(context).slice(0, 30000)}` }],
      }),
    });
    if (!r.ok) return json({ error: "failed", message: `The advice service returned ${r.status}` });
    const out = await r.json();
    const tu = (out.content ?? []).find((c: { type: string }) => c.type === "tool_use");
    if (!tu) return json({ error: "failed", message: "No advice came back" });
    return json({ insights: tu.input });
  } catch (e) {
    return json({ error: "failed", message: String((e as Error)?.message || e) });
  }
});
