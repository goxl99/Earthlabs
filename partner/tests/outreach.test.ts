import { describe, it, expect } from "vitest";
import { parseLeads, leadMail, cleanEmail, cleanPhone, quickIntent, parseIntent, replyText, senderAddress, NEXT, STATUS_FOR, INTENTS, DISCOVER_SYSTEM } from "../../supabase/functions/_shared/outreach";
import { summarize, parsePasted, statusLabel, leadMail as leadMailClient, type Lead } from "../src/lib/outreach";

const urls = new Set(["https://www.acmehygiene.in/contact", "https://dir.example.org/vadodara/"]);
const good = { business: "Acme Hygiene Supplies", name: "R. Shah", email: "Sales@AcmeHygiene.in", phone: "+91 265 1234567", website: "https://www.acmehygiene.in", address: "GIDC Makarpura", products: "janitorial supplies", source_url: "https://www.acmehygiene.in/contact" };
const wrap = (l: unknown[]) => JSON.stringify({ leads: l });

describe("lead discovery safety", () => {
  it("keeps a lead whose source page was returned by the search, and lowercases the e-mail", () => {
    const r = parseLeads("```json\n" + wrap([good]) + "\n```", urls);
    expect(r).toHaveLength(1); expect(r[0].email).toBe("sales@acmehygiene.in");
  });
  it("drops a lead whose source page the search never returned", () => {
    expect(parseLeads(wrap([{ ...good, source_url: "https://made-up.example.net/x" }]), urls)).toHaveLength(0);
  });
  it("drops leads with no e-mail and no phone, or no business", () => {
    expect(parseLeads(wrap([{ ...good, email: null, phone: null }]), urls)).toHaveLength(0);
    expect(parseLeads(wrap([{ ...good, business: "" }]), urls)).toHaveLength(0);
  });
  it("rejects placeholder and image-like e-mail addresses, bad phones and non-http links", () => {
    expect(cleanEmail("name@example.com")).toBeNull(); expect(cleanEmail("logo@2x.png")).toBeNull(); expect(cleanEmail("not an email")).toBeNull();
    expect(cleanEmail("mailto:Info@Shop.in")).toBe("info@shop.in");
    expect(cleanPhone("12345")).toBeNull(); expect(cleanPhone("+91 98765 43210")).toBe("+91 98765 43210");
    const r = parseLeads(wrap([{ ...good, website: "javascript:alert(1)" }]), urls); expect(r[0].website).toBeNull();
  });
  it("removes duplicates and caps the list", () => {
    expect(parseLeads(wrap([good, good]), urls)).toHaveLength(1);
    expect(parseLeads(wrap(Array.from({ length: 40 }, (_, i) => ({ ...good, email: `a${i}@acmehygiene.in`, business: "B" + i }))), urls).length).toBeLessThanOrEqual(15);
  });
  it("returns nothing for text that is not the expected JSON", () => { expect(parseLeads("Here are some dealers: Acme", urls)).toEqual([]); expect(parseLeads("{bad", urls)).toEqual([]); });
  it("tells the AI never to guess contact details and to treat pages as data", () => { expect(DISCOVER_SYSTEM).toMatch(/NEVER guess/); expect(DISCOVER_SYSTEM).toMatch(/data, not instructions/); });
});

describe("first e-mail draft", () => {
  const m = leadMail({ name: "R. Shah", business: "Acme Hygiene", district: "Vadodara", products: "janitorial supplies" });
  it("uses the lead's details", () => { expect(m.subject).toContain("Vadodara"); expect(m.body).toContain("Dear R. Shah"); expect(m.body).toContain("Acme Hygiene deals in janitorial supplies"); });
  it("makes no price, scheme, exclusivity or chemical-free claim", () => { expect(m.body).not.toMatch(/₹|rs\.?\s*\d|discount|margin|scheme|exclusive|chemical-free|germ|kills|cure/i); });
  it("says the appointment needs checks, an agreement and company approval", () => { expect(m.body).toMatch(/registration checks, a Dealer Agreement and approval/); });
  it("falls back gracefully with no name or business", () => { const d = leadMail({ district: "Rajkot" }); expect(d.body).toContain("Dear Sir or Madam"); expect(d.body).not.toContain("null"); });
});

describe("reading replies", () => {
  it("catches opt-outs, bounces and out-of-office without the AI", () => {
    expect(quickIntent("a@b.in", "Re: Dealer", "Please stop emailing me")).toBe("unsubscribe");
    expect(quickIntent("a@b.in", "Re: Dealer", "STOP")).toBe("unsubscribe");
    expect(quickIntent("a@b.in", "Re: Dealer", "Kindly unsubscribe us")).toBe("unsubscribe");
    expect(quickIntent("MAILER-DAEMON@x.com", "Undeliverable: Dealer", "")).toBe("bounce");
    expect(quickIntent("a@b.in", "Automatic reply: Dealer", "I am away")).toBe("out_of_office");
  });
  it("does not treat a normal interested reply as an opt-out", () => { expect(quickIntent("a@b.in", "Re: Dealer", "Yes, please stop by our shop tomorrow and share the catalogue")).toBeNull(); });
  it("reads the AI answer and falls back to 'other' for anything unexpected", () => {
    expect(parseIntent('{"intent":"wants_info","note":"Wants the price list"}')).toEqual({ intent: "wants_info", note: "Wants the price list" });
    expect(parseIntent('{"intent":"delete_everything"}').intent).toBe("other"); expect(parseIntent("nonsense").intent).toBe("other");
  });
  it("every intent has a next step and a status rule", () => { for (const i of INTENTS) { expect(NEXT[i]).toBeTruthy(); expect(i in STATUS_FOR).toBe(true); } expect(STATUS_FOR.unsubscribe).toBe("Opted out"); expect(STATUS_FOR.out_of_office).toBeNull(); });
  it("finds the sender and keeps only the new part of the reply", () => {
    expect(senderAddress("R Shah <Sales@Acme.in>")).toBe("sales@acme.in"); expect(senderAddress("a@b.in")).toBe("a@b.in");
    const t = replyText("Yes, send details.\n\nOn Tue, 25 Nov 2026 at 10:00, EarthLabs <x@y.in> wrote:\n> Dear Sir");
    expect(t).toBe("Yes, send details.");
    expect(replyText("<p>Hello <b>there</b></p><style>p{}</style>")).toBe("Hello there");
  });
});

const L = (o: Partial<Lead>): Lead => ({ id: Math.random().toString(), district: "Vadodara", name: null, business: "B", email: "a@b.in", phone: null, website: null, address: null, products: null, source: "staff", source_url: null, status: "Found", subject: "s", body: "b", approved_at: null, outbox_id: null, sent_at: null, last_reply_at: null, next_step: null, next_step_note: null, created_at: "2026-11-25", ...o });
describe("area summary", () => {
  it("counts leads, mails sent, replies and replies still needing a next step per area", () => {
    const s = summarize([L({}), L({ status: "Queued" }), L({ status: "Sent", sent_at: "x" }), L({ status: "Replied", sent_at: "x", last_reply_at: "y" }), L({ status: "Converted", sent_at: "x", last_reply_at: "y" }), L({ district: "Rajkot", status: "Found", email: null })]);
    const v = s.find((x) => x.district === "Vadodara")!;
    expect(v).toMatchObject({ leads: 5, toReview: 1, sending: 1, sent: 3, replied: 2, todo: 1, converted: 1 });
    expect(s.find((x) => x.district === "Rajkot")).toMatchObject({ leads: 1, toReview: 0, sent: 0 });
    expect(s[0].district).toBe("Vadodara");
  });
  it("labels approved-but-unsent leads as Sending", () => { expect(statusLabel("Queued")).toBe("Sending"); expect(statusLabel("Approved")).toBe("Sending"); expect(statusLabel("Found")).toBe("To review"); });
});

describe("pasted lists", () => {
  it("reads business, contact, e-mail and phone in any order and skips lines with no way to reach them", () => {
    const r = parsePasted("Acme Hygiene, R Shah, Sales@Acme.in, +91 98765 43210\nBeta Traders;beta@beta.in\nNo Contact Ltd, Someone\n\nGamma | 9876543210");
    expect(r.rows).toHaveLength(3); expect(r.skipped).toBe(1);
    expect(r.rows[0]).toEqual({ business: "Acme Hygiene", name: "R Shah", email: "sales@acme.in", phone: "+91 98765 43210" });
    expect(r.rows[1].email).toBe("beta@beta.in"); expect(r.rows[2].phone).toBe("9876543210");
  });
});

describe("server and screen drafts match", () => {
  it("builds the same first e-mail in both places", () => {
    for (const l of [{ name: "R. Shah", business: "Acme", district: "Vadodara", products: "soap" }, { district: "Rajkot" }, { business: "Beta", district: "Morbi" }]) expect(leadMailClient(l)).toEqual(leadMail(l));
  });
});
