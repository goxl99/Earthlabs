// Leegality calls this when a signer signs. Configure the URL in the Leegality workflow (no JWT: the MAC proves the sender).
// Secrets: LEEGALITY_PRIVATE_SALT (Dashboard > API Settings), LEEGALITY_AUTH_TOKEN, LEEGALITY_BASE_URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyWebhook, isPdf } from "../_shared/leegality.ts";
import { provisionPartnerLogin } from "../_shared/provision.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const salt = Deno.env.get("LEEGALITY_PRIVATE_SALT"), token = Deno.env.get("LEEGALITY_AUTH_TOKEN");
  if (!salt || !token) return new Response("not configured", { status: 503 });
  let b: { webhookType?: string; documentId?: string; documentStatus?: string; mac?: string };
  try { b = await req.json(); } catch { return new Response("bad request", { status: 400 }); }
  if (!(await verifyWebhook(b.documentId, b.mac, salt))) return new Response("forbidden", { status: 403 });
  if (b.webhookType !== "Success" || b.documentStatus !== "Completed") return new Response("ok");   // a partial signature or an error: nothing to do yet
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: ag } = await db.from("agreements").select("id,partner_id,status").eq("esign_document_id", b.documentId).maybeSingle();
  if (!ag) return new Response("unknown document", { status: 404 });
  if (ag.status === "Signed") return new Response("ok");
  const base = Deno.env.get("LEEGALITY_BASE_URL") ?? "https://sandbox.leegality.com/api";
  const meta = await fetch(`${base}/v3.3/document/fetchDocument?documentId=${encodeURIComponent(b.documentId!)}&documentDownloadType=DOCUMENT`, { headers: { "X-Auth-Token": token } });
  const mj = await meta.json().catch(() => null);
  if (!meta.ok || mj?.status !== 1 || !mj?.data?.file) return new Response("could not fetch the signed document", { status: 502 });
  const pdf = new Uint8Array(await (await fetch(mj.data.file)).arrayBuffer());    // the link expires in 15 seconds: download now
  if (!isPdf(pdf)) return new Response("signed file is not a PDF", { status: 502 });
  const path = `${ag.partner_id}/${ag.id}-signed.pdf`;
  const up = await db.storage.from("agreements").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) return new Response("could not store the signed copy", { status: 500 });
  const { error } = await db.rpc("esign_completed", { docid: b.documentId, path });
  if (error) return new Response(error.message, { status: 500 });
  // Signed: the application is now Approved (database trigger). Issue the login and e-mail the Login ID and password.
  try { const r = await provisionPartnerLogin(db, ag.partner_id); if (!r.ok) console.error("login not issued:", r.error); } catch (e) { console.error("login not issued:", (e as Error).message); }
  return new Response("ok");
});
