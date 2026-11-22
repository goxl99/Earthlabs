// Pure helpers for the Leegality integration (no Deno-only APIs, so they are unit-tested with Vitest).
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

/** Leegality webhook MAC = HMAC-SHA1(key = private salt, message = documentId). Accepts hex (documented example) or base64. */
export async function webhookMac(documentId: string, salt: string): Promise<{ hex: string; base64: string }> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(documentId));
  return { hex: hex(sig), base64: b64(sig) };
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function verifyWebhook(documentId: unknown, mac: unknown, salt: string): Promise<boolean> {
  if (typeof documentId !== "string" || typeof mac !== "string" || !documentId || !mac || !salt) return false;
  const m = await webhookMac(documentId, salt);
  return safeEqual(mac.toLowerCase(), m.hex) || safeEqual(mac, m.base64);
}

export type Invitee = { name: string; email?: string; phone?: string };
/** Body for POST /v3.0/sign/request. `irn` is our agreement id so the webhook can be matched back. */
export function buildSignRequest(profileId: string, fileName: string, fileBase64: string, invitee: Invitee, irn: string) {
  const phone = (invitee.phone ?? "").replace(/\D/g, "").slice(-10);
  const inv: Invitee = { name: invitee.name.slice(0, 255) };
  if (invitee.email) inv.email = invitee.email;
  if (phone.length === 10) inv.phone = phone;
  if (!inv.email && !inv.phone) throw new Error("The partner needs an e-mail or a 10-digit phone number for e-sign");
  return { profileId, file: { name: fileName.slice(0, 255), file: fileBase64 }, invitees: [inv], irn: irn.slice(0, 255) };
}
export const isPdf = (bytes: Uint8Array) => bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
