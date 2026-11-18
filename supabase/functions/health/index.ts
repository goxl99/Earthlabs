// Uptime probe for the monitoring layer: GET /functions/v1/health returns 200 when the database answers.
import { createClient } from "npm:@supabase/supabase-js@2";
import { json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json({}, 204, origin);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const t = Date.now();
  const { error } = await db.from("partner_types").select("code").limit(1);
  return json({ ok: !error, db_ms: Date.now() - t, at: new Date().toISOString() }, error ? 503 : 200, origin);
});
