// Read-only link to the Batch Management system: returns QC-approved batches to signed-in warehouse/admin staff.
// The batch project is NEVER written to. Secrets (set in Supabase, never in the repo):
//   BATCH_SUPABASE_URL, BATCH_READ_KEY (a read-only key or a view-limited role),
//   BATCH_VIEW (name of a read-only view that exposes: batch_ref, product, qc_status, qty; default "epdms_approved_batches").
// Using a dedicated view means the batch app's own tables and files are never touched or exposed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const auth = req.headers.get("Authorization") ?? "";
  const me = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await me.auth.getUser();
  if (!u.user) return json({ error: "Sign in first" }, 401, origin);
  const { data: role } = await me.rpc("my_role");
  if (!["super_admin", "warehouse", "sales", "accounts"].includes(role as string)) return json({ error: "Not allowed" }, 403, origin);
  const url = Deno.env.get("BATCH_SUPABASE_URL") ?? "https://hgdltduqwayfepzuurke.supabase.co"; const key = Deno.env.get("BATCH_READ_KEY");
  if (!url || !key) return json({ error: "The batch system link is not configured yet" }, 503, origin);
  const batch = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await batch.from(Deno.env.get("BATCH_VIEW") ?? "epdms_approved_batches").select("batch_ref,product,qc_status,qty").order("batch_ref", { ascending: false }).limit(100);
  if (error) return json({ error: "Could not read the batch system" }, 502, origin);
  // Keep a copy of QC facts in EPDMS so challans show batch code and QC status to partners too. Only approved batches exist in the view.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (data && data.length) {
    const { error: e2 } = await admin.from("batch_qc_cache").upsert(data.map((r: Record<string, unknown>) => ({ batch_ref: r.batch_ref, product: r.product, qc_status: r.qc_status, qty: r.qty, fetched_at: new Date().toISOString() })), { onConflict: "batch_ref" });
    if (e2) return json({ error: "Could not store the batch data" }, 500, origin);
  }
  return json({ batches: data ?? [] }, 200, origin);
});
