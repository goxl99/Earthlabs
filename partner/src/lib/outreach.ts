// Dealer outreach: types and pure helpers for the Outreach tab (no network).
export type Lead = {
  id: string; district: string; name: string | null; business: string | null; email: string | null; phone: string | null; website: string | null; address: string | null; products: string | null;
  source: "ai_search" | "staff"; source_url: string | null; status: string; subject: string | null; body: string | null;
  approved_at: string | null; outbox_id: number | null; sent_at: string | null; last_reply_at: string | null; wa_at: string | null; next_step: string | null; next_step_note: string | null; created_at: string;
};
export type Reply = { id: number; lead_id: string | null; from_email: string | null; subject: string | null; body: string | null; intent: string | null; ai_note: string | null; received_at: string };

export const STATUSES = ["Found", "Approved", "Queued", "Sent", "Replied", "Not interested", "Opted out", "Send failed", "Converted", "Rejected"] as const;
export const statusKind = (s: string): "good" | "warn" | "crit" | "info" | "mute" | "gold" =>
  s === "Converted" || s === "Replied" ? "good" : s === "Sent" ? "info" : s === "Approved" || s === "Queued" ? "warn" : s === "Send failed" || s === "Opted out" ? "crit" : s === "Found" ? "gold" : "mute";
/** The label staff see. A lead that is approved but not yet sent reads "Sending". */
export const statusLabel = (s: string) => (s === "Approved" || s === "Queued" ? "Sending" : s === "Found" ? "To review" : s);

export type AreaRow = { district: string; leads: number; toReview: number; sending: number; sent: number; replied: number; todo: number; converted: number; wa: number };

/** One row per area: how many leads, how many mails went out, how many replied, how many replies still need a next step. */
export function summarize(leads: Lead[]): AreaRow[] {
  const m = new Map<string, AreaRow>();
  for (const l of leads) {
    const r = m.get(l.district) ?? { district: l.district, leads: 0, toReview: 0, sending: 0, sent: 0, replied: 0, todo: 0, converted: 0, wa: 0 };
    r.leads++;
    if (l.status === "Found" && l.email) r.toReview++;
    if (l.status === "Approved" || l.status === "Queued") r.sending++;
    if (l.sent_at) r.sent++;
    if (l.last_reply_at) r.replied++;
    if (l.status === "Replied") r.todo++;
    if (l.status === "Converted") r.converted++;
    if (l.wa_at) r.wa++;
    m.set(l.district, r);
  }
  return [...m.values()].sort((a, b) => b.sent - a.sent || b.leads - a.leads || a.district.localeCompare(b.district));
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
/** Reads a pasted list, one dealer per line: business, contact name, e-mail, phone (comma, semicolon, tab or | between). Lines without a business name are skipped. */
export function parsePasted(text: string): { rows: { business: string; name: string | null; email: string | null; phone: string | null }[]; skipped: number } {
  const rows: { business: string; name: string | null; email: string | null; phone: string | null }[] = []; let skipped = 0;
  for (const line of text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    const parts = line.split(/\t|;|\||,/).map((s) => s.trim());
    const business = parts[0]?.slice(0, 120);
    if (!business) { skipped++; continue; }
    const rest = parts.slice(1).filter(Boolean);
    const email = rest.find((p) => EMAIL.test(p))?.toLowerCase() ?? null;
    const phone = rest.find((p) => !EMAIL.test(p) && p.replace(/\D/g, "").length >= 8 && /^[0-9+()\- ]+$/.test(p)) ?? null;
    const name = rest.find((p) => !EMAIL.test(p) && p !== phone && /[A-Za-z]/.test(p))?.slice(0, 80) ?? null;
    if (!email && !phone) { skipped++; continue; }
    rows.push({ business, name, email, phone });
  }
  return { rows, skipped };
}

/** The first-contact draft used for pasted leads (the AI search builds the same text on the server; a test keeps the two identical). */
/** A short plain phrase for what a business trades in. Brackets and the name of the website it was found on are removed (same rule as the server). */
export function cleanProducts(v: unknown): string {
  return (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "").replace(/\([^)]*\)/g, " ").replace(/\b(justdial|indiamart|sulekha|tradeindia|exportersindia|yellow ?pages)\b[^,.;]*/gi, " ").replace(/\s+/g, " ").replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "").slice(0, 80);
}

export function leadMail(l: { name?: string | null; business?: string | null; district: string; products?: string | null }): { subject: string; body: string } {
  const who = l.name ? `Dear ${l.name},` : "Dear Sir or Madam,";
  const fit = l.business ? `As ${l.business} deals in ${cleanProducts(l.products) || "related products"}, we felt this could suit your range.` : "We felt this could suit your range.";
  return {
    subject: `Dealer opportunity: EarthLabs herbal hand wash and cleaning products in ${l.district}`,
    body: `${who}\n\nI am writing from EarthLabs Innovative Products Pvt. Ltd., Vadodara. We make herbal, eco-conscious hand wash and cleaning products and are appointing authorised dealers in ${l.district}. ${fit}\n\nIf you would like to know more, please reply to this e-mail and our sales team will call you to explain how the dealer programme works. Appointment follows registration checks, a Dealer Agreement and approval by the company.\n\nRegards,\nEarthLabs Sales Team`,
  };
}

/** WhatsApp click-to-chat. Only an Indian MOBILE number can be messaged on WhatsApp (6-9 then nine digits); landlines return null. */
export function waNumber(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2); else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? "91" + d : null;
}
/** The first WhatsApp message. Fixed wording: no prices, schemes, claims or promises. */
/** Public files shared with dealers: attached to the first e-mail (setting lead_attachments) and linked in the WhatsApp message. */
export const BROCHURE_URL = "https://www.earthlabsproducts.com/partner-assets/EarthLabs-Product-Brochure.pdf";
export const VIDEO_URL = "https://www.earthlabsproducts.com/partner-assets/EarthLabs-Intro-Video.mp4";
export function waMessage(l: { name?: string | null; district: string }): string {
  return `Hello${l.name ? " " + l.name : ""}, this is EarthLabs Innovative Products, Vadodara. We make herbal, eco-conscious hand wash and cleaning products and are appointing authorised dealers in ${l.district}. May we call you to explain how the dealer programme works? Appointment follows registration checks, a Dealer Agreement and company approval.\n\nBrochure: ${BROCHURE_URL}\nShort video: ${VIDEO_URL}\n\nIf you would rather not hear from us, reply STOP.`;
}
export const waLink = (phone: string | null | undefined, msg: string): string | null => { const n = waNumber(phone); return n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : null; };
