// Public (no sign-in) document upload for applicants. The applicant proves who they are with the reference number + the e-mail used on the application.
// Actions: list | sign (get a one-time upload URL) | confirm (record the uploaded file) | na (mark a document not applicable, with a reason) | submit (send all documents for review)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const EXT = ["pdf", "jpg", "jpeg", "png"], MAX = 8 * 1024 * 1024, OPEN = ["Documents requested", "More info needed"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

Deno.serve(async (req) => {
  const o = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(o) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, o);
  let b: { action?: string; ref?: string; email?: string; kind?: string; file_name?: string; size?: number; path?: string; reason?: string };
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400, o); }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: app } = await db.from("applications").select("id,status,type_code,email,ref_no,business_name").eq("ref_no", String(b.ref ?? "").trim().toUpperCase()).maybeSingle();
  if (!app || String(app.email ?? "").trim().toLowerCase() !== String(b.email ?? "").trim().toLowerCase()) return json({ error: "Check the reference number and e-mail" }, 404, o);
  const { data: req_ } = await db.rpc("required_docs", { t: app.type_code });
  const required = (req_ as string[]) ?? [];
  const canUpload = OPEN.includes(app.status);
  const { data: docs } = await db.from("application_documents").select("kind,file_name,status,note,uploaded_at,not_applicable").eq("application_id", app.id).eq("is_current", true);

  if (b.action === "list") return json({ status: app.status, can_upload: canUpload, required, docs: docs ?? [] }, 200, o);
  if (!canUpload) return json({ error: "Documents are not being collected for this application right now" }, 409, o);

  if (b.action === "sign") {
    if (!b.kind || !required.includes(b.kind)) return json({ error: "Unknown document type" }, 400, o);
    const ext = String(b.file_name ?? "").split(".").pop()?.toLowerCase() ?? "";
    if (!EXT.includes(ext)) return json({ error: "Upload a PDF, JPG or PNG file" }, 400, o);
    if (!b.size || b.size > MAX) return json({ error: "The file must be 8 MB or smaller" }, 400, o);
    const path = `${app.id}/${slug(b.kind)}-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
    const { data, error } = await db.storage.from("application-docs").createSignedUploadUrl(path);
    if (error || !data) return json({ error: "Could not prepare the upload. Please try again." }, 500, o);
    return json({ path, token: data.token }, 200, o);
  }
  if (b.action === "confirm") {
    if (!b.kind || !required.includes(b.kind) || !b.path || !b.path.startsWith(app.id + "/") || b.path.includes("..")) return json({ error: "Bad request" }, 400, o);
    const name = b.path.split("/").pop()!;
    const { data: ls } = await db.storage.from("application-docs").list(app.id, { search: name });
    if (!ls?.some((x) => x.name === name)) return json({ error: "The file did not arrive. Please upload it again." }, 400, o);
    // Earlier versions stay in the document wallet (is_current = false); the new file becomes the current one.
    await db.from("application_documents").update({ is_current: false }).eq("application_id", app.id).eq("kind", b.kind).eq("is_current", true);
    const { error } = await db.from("application_documents").insert({ application_id: app.id, kind: b.kind, file_path: b.path, file_name: String(b.file_name ?? name).slice(0, 200), size_bytes: b.size ?? null, status: "Uploaded" });
    if (error) return json({ error: error.message }, 500, o);
    return json({ ok: true }, 200, o);
  }
  if (b.action === "na") {
    const why = String(b.reason ?? "").trim();
    if (!b.kind || !required.includes(b.kind)) return json({ error: "Unknown document type" }, 400, o);
    if (why.length < 3 || why.length > 300) return json({ error: "Please give a short reason (for example: no company registration, I run as an individual)" }, 400, o);
    await db.from("application_documents").update({ is_current: false }).eq("application_id", app.id).eq("kind", b.kind).eq("is_current", true);
    const { error } = await db.from("application_documents").insert({ application_id: app.id, kind: b.kind, file_path: null, file_name: "Not applicable", status: "Uploaded", note: why, not_applicable: true });
    if (error) return json({ error: error.message }, 500, o);
    return json({ ok: true }, 200, o);
  }
  if (b.action === "submit") {
    const have = new Map((docs ?? []).map((d) => [d.kind, d.status]));
    const missing = required.filter((k) => !have.has(k)), rejected = required.filter((k) => have.get(k) === "Rejected");
    if (missing.length) return json({ error: "Still to upload: " + missing.join(", ") }, 400, o);
    if (rejected.length) return json({ error: "Please upload a corrected file for: " + rejected.join(", ") }, 400, o);
    const { error } = await db.from("applications").update({ status: "Documents submitted", reason: null }).eq("id", app.id);
    if (error) return json({ error: error.message }, 500, o);
    return json({ ok: true }, 200, o);
  }
  return json({ error: "Bad request" }, 400, o);
});
