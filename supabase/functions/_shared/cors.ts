// Shared helpers for Edge Functions. Allowed origins come from the ALLOWED_ORIGINS secret (comma separated), never from the request.
const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin && allowed.includes(origin) ? origin : allowed[0] ?? "null";
  return { "Access-Control-Allow-Origin": ok, "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Vary": "Origin" };
}
export const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
