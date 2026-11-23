// Reads a supplier bill (PDF or photo) stored in the private "supplier-bills" bucket and returns its details as JSON.
// Needs the ANTHROPIC_API_KEY secret (set in Supabase > Edge Functions > Secrets). Optional: ANTHROPIC_MODEL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TOOL = {
  name: "record_invoice",
  description: "Record the details printed on a supplier bill / tax invoice exactly as shown.",
  input_schema: {
    type: "object",
    properties: {
      supplier_name: { type: ["string", "null"], description: "Seller / supplier name" },
      invoice_no: { type: ["string", "null"] },
      invoice_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      due_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      currency: { type: ["string", "null"], description: "ISO code, usually INR" },
      subtotal: { type: ["number", "null"], description: "Taxable amount before tax" },
      tax_amount: { type: ["number", "null"], description: "Total GST / tax" },
      total: { type: ["number", "null"], description: "Grand total payable" },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            qty: { type: ["number", "null"] },
            unit: { type: ["string", "null"], description: "kg, g, L, mL, pcs ... as printed" },
            rate: { type: ["number", "null"], description: "Price per unit before tax" },
            tax_pct: { type: ["number", "null"] },
            amount: { type: ["number", "null"], description: "Line amount as printed" },
            matched_material: {
              type: ["string", "null"],
              description: "The exact name from the provided item list that this line is, or null if none clearly matches",
            },
          },
          required: ["description"],
        },
      },
    },
    required: ["lines"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "Not signed in" }, 401);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "not_configured", message: "Bill reading is not switched on yet (API key missing)." });

    const { path } = await req.json();
    if (typeof path !== "string" || !/^[\w\-./]+$/.test(path) || path.includes("..")) return json({ error: "Bad file path" }, 400);

    const { data: file, error: dErr } = await sb.storage.from("supplier-bills").download(path);
    if (dErr || !file) return json({ error: "Could not open the uploaded bill" }, 403);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) return json({ error: "File is too large (max 20 MB)" }, 413);
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const mime = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const b64 = encodeBase64(bytes);

    const { data: mats } = await sb.from("raw_materials").select("name,unit,category").eq("active", true).order("name");
    const list = (mats ?? []).map((m) => `${m.name} (${m.unit}${m.category === "packaging" ? ", packaging" : ""})`).join("\n");

    const block = mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mime, data: b64 } }
      : { type: "image", source: { type: "base64", media_type: mime, data: b64 } };

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
        max_tokens: 4096,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "record_invoice" },
        messages: [{
          role: "user",
          content: [
            block,
            {
              type: "text",
              text:
                "This is a supplier bill / tax invoice received by an Indian cleaning-products manufacturer. Read it and call record_invoice. " +
                "Copy numbers exactly as printed; use null for anything you cannot read - never guess. Dates as YYYY-MM-DD. " +
                "Rate is per unit before tax. For each line set matched_material to the exact name from this list when the line is clearly that item, otherwise null.\n\nItems we buy:\n" +
                list,
            },
          ],
        }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: "reader_failed", message: `The reading service returned ${r.status}`, detail: t.slice(0, 300) }, 502);
    }
    const out = await r.json();
    const tu = (out.content ?? []).find((c: { type: string }) => c.type === "tool_use");
    if (!tu) return json({ error: "reader_failed", message: "Could not read this bill" }, 502);
    return json({ extracted: tu.input });
  } catch (e) {
    return json({ error: "reader_failed", message: String(e?.message ?? e) }, 500);
  }
});
