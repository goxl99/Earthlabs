// Dealer outreach: types and pure helpers for the Outreach tab (no network).
export type Lead = {
  id: string; district: string; name: string | null; business: string | null; email: string | null; phone: string | null; website: string | null; address: string | null; products: string | null;
  source: "ai_search" | "staff"; source_url: string | null; status: string; subject: string | null; body: string | null;
  approved_at: string | null; outbox_id: number | null; sent_at: string | null; last_reply_at: string | null; next_step: string | null; next_step_note: string | null; created_at: string;
};
export type Reply = { id: number; lead_id: string | null; from_email: string | null; subject: string | null; body: string | null; intent: string | null; ai_note: string | null; received_at: string };

export const STATUSES = ["Found", "Approved", "Queued", "Sent", "Replied", "Not interested", "Opted out", "Send failed", "Converted", "Rejected"] as const;
export const statusKind = (s: string): "good" | "warn" | "crit" | "info" | "mute" | "gold" =>
  s === "Converted" || s === "Replied" ? "good" : s === "Sent" ? "info" : s === "Approved" || s === "Queued" ? "warn" : s === "Send failed" || s === "Opted out" ? "crit" : s === "Found" ? "gold" : "mute";
/** The label staff see. A lead that is approved but not yet sent reads "Sending". */
export const statusLabel = (s: string) => (s === "Approved" || s === "Queued" ? "Sending" : s === "Found" ? "To review" : s);

export type AreaRow = { district: string; leads: number; toReview: number; sending: number; sent: number; replied: number; todo: number; converted: number };

/** One row per area: how many leads, how many mails went out, how many replied, how many replies still need a next step. */
export function summarize(leads: Lead[]): AreaRow[] {
  const m = new Map<string, AreaRow>();
  for (const l of leads) {
    const r = m.get(l.district) ?? { district: l.district, leads: 0, toReview: 0, sending: 0, sent: 0, replied: 0, todo: 0, converted: 0 };
    r.leads++;
    if (l.status === "Found" && l.email) r.toReview++;
    if (l.status === "Approved" || l.status === "Queued") r.sending++;
    if (l.sent_at) r.sent++;
    if (l.last_reply_at) r.replied++;
    if (l.status === "Replied") r.todo++;
    if (l.status === "Converted") r.converted++;
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
export function leadMail(l: { name?: string | null; business?: string | null; district: string; products?: string | null }): { subject: string; body: string } {
  const who = l.name ? `Dear ${l.name},` : "Dear Sir or Madam,";
  const fit = l.business ? `As ${l.business} deals in ${l.products || "related products"}, we felt this could suit your range.` : "We felt this could suit your range.";
  return {
    subject: `Dealer opportunity: EarthLabs herbal hand wash and cleaning products in ${l.district}`,
    body: `${who}\n\nI am writing from EarthLabs Innovative Products Pvt. Ltd., Vadodara. We make herbal, eco-conscious hand wash and cleaning products and are appointing authorised dealers in ${l.district}. ${fit}\n\nIf you would like to know more, please reply to this e-mail and our sales team will call you to explain how the dealer programme works. Appointment follows registration checks, a Dealer Agreement and approval by the company.\n\nRegards,\nEarthLabs Sales Team`,
  };
}
