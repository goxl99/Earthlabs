// Shared helpers for Edge Functions. Allowed origins: the ALLOWED_ORIGINS secret (comma separated) plus the portal's own addresses. Never taken from the request.
const base = ["https://www.earthlabsproducts.com", "https://earthlabsproducts.com", "https://earthlabs-partner.pages.dev"];
const allowed = [...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean), ...base];
// supabase-js adds apikey and x-client-info to every call, so the browser's preflight must allow them.
const HEADERS = "authorization, content-type, apikey, x-client-info";

export function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin && allowed.includes(origin) ? origin : allowed[0] ?? "null";
  return { "Access-Control-Allow-Origin": ok, "Access-Control-Allow-Headers": HEADERS, "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Vary": "Origin" };
}
export const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
