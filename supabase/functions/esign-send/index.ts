// Staff sends an agreement PDF to Leegality for e-signing. Secrets (set in Supabase, never in the repo):
//   LEEGALITY_AUTH_TOKEN, LEEGALITY_PROFILE_ID, LEEGALITY_BASE_URL (default sandbox: https://sandbox.leegality.com/api; production: https://app1.leegality.com/api).
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildSignRequest, isPdf } from "../_shared/leegality.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, origin);
  const token = Deno.env.get("LEEGALITY_AUTH_TOKEN"), profile = Deno.env.get("LEEGALITY_PROFILE_ID");
  if (!token || !profile) return json({ error: "E-sign (Leegality) is not configured yet" }, 503, origin);
  const me = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await me.auth.getUser();
  if (!u.user) return json({ error: "Sign in first" }, 401, origin);
  const { data: role } = await me.rpc("my_role");
  if (!["super_admin", "sales"].includes(role as string)) return json({ error: "Only Super Admin or Sales can send agreements" }, 403, origin);

  let body: { agreement_id?: string; pdf_path?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400, origin); }
  const { agreement_id: aid, pdf_path: path } = body;
  if (!aid || !path) return json({ error: "agreement_id and pdf_path are required" }, 400, origin);
  const { data: ag } = await me.from("agreements").select("id,partner_id,status").eq("id", aid).maybeSingle();
  if (!ag) return json({ error: "Agreement not found" }, 404, origin);
  if (ag.status === "Signed") return json({ error: "Already signed" }, 409, origin);
  if (path.includes("..") || path.split("/")[0] !== ag.partner_id || !path.toLowerCase().endsWith(".pdf")) return json({ error: "Upload the agreement as a PDF in the partner's own folder" }, 400, origin);
  const { data: p } = await me.from("partners").select("name,contact_name,email,phone").eq("id", ag.partner_id).maybeSingle();
  if (!p) return json({ error: "Partner not found" }, 404, origin);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: file, error: fe } = await db.storage.from("agreements").download(path);
  if (fe || !file) return json({ error: "Could not read the PDF" }, 400, origin);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes)) return json({ error: "The file is not a PDF" }, 400, origin);
  if (bytes.length > 15 * 1024 * 1024) return json({ error: "The PDF is over 15 MB" }, 400, origin);

  // Signers in order: the partner first, then the EarthLabs authorised signatory (set by Super Admin under Agreements > Company details).
  const { data: cp } = await db.from("company_profile").select("key,value");
  const co = Object.fromEntries((cp ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const invitees = [{ name: p.contact_name || p.name, email: p.email ?? undefined, phone: p.phone ?? undefined }];
  if (co.signatory_name && (co.signatory_email || co.signatory_phone)) invitees.push({ name: co.signatory_name, email: co.signatory_email || undefined, phone: co.signatory_phone || undefined });
  let payload;
  try { payload = buildSignRequest(profile, `EarthLabs MOU ${ag.partner_id}.pdf`, encodeBase64(bytes), invitees, aid); }
  catch (e) { return json({ error: (e as Error).message }, 400, origin); }
  const base = Deno.env.get("LEEGALITY_BASE_URL") ?? "https://sandbox.leegality.com/api";
  const r = await fetch(`${base}/v3.0/sign/request`, { method: "POST", headers: { "X-Auth-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const out = await r.json().catch(() => null);
  if (!r.ok || !out || out.status !== 1 || !out.data?.documentId) return json({ error: "Leegality did not accept the document", detail: out?.messages ?? null }, 502, origin);
  const { error } = await db.rpc("esign_started", { aid, docid: out.data.documentId, url: out.data.invitees?.[0]?.signUrl ?? null });
  const signers = invitees.length;
  if (error) return json({ error: error.message }, 500, origin);
  return json({ ok: true, document_id: out.data.documentId, signers }, 200, origin);
});
