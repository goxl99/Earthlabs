import { supabase } from "@/lib/supabase";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
/** Calls an Edge Function and returns a plain {ok, error, data}. Sends the signed-in token when there is one. */
export async function callFn(name: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const { data: s } = await supabase.auth.getSession();
    const r = await fetch(`${url}/functions/v1/${name}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${s.session?.access_token ?? key}` }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: d } : { ok: false, error: (d as { error?: string }).error ?? "Something went wrong. Please try again." };
  } catch { return { ok: false, error: "Could not reach the server. Check your connection and try again." }; }
}
