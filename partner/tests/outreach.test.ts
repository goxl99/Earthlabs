import { describe, it, expect } from "vitest";
import { parseLeads, parseEnrich, mergeEnriched, isDirectory, ageMonths, cleanProducts, leadMail, cleanEmail, cleanPhone, quickIntent, parseIntent, replyText, senderAddress, NEXT, STATUS_FOR, INTENTS, DISCOVER_SYSTEM } from "../../supabase/functions/_shared/outreach";
import { summarize, parsePasted, statusLabel, waNumber, waLink, waMessage, cleanProducts as cleanProductsClient, leadMail as leadMailClient, type Lead } from "../src/lib/outreach";

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
    expect(parseLeads(wrap(Array.from({ length: 40 }, (_, i) => ({ ...good, email: `a${i}@acmehygiene.in`, business: "B" + i }))), urls).length).toBeLessThanOrEqual(20);
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

const L = (o: Partial<Lead>): Lead => ({ id: Math.random().toString(), district: "Vadodara", name: null, business: "B", email: "a@b.in", phone: null, website: null, address: null, products: null, source: "staff", source_url: null, status: "Found", subject: "s", body: "b", approved_at: null, outbox_id: null, sent_at: null, last_reply_at: null, wa_at: null, next_step: null, next_step_note: null, created_at: "2026-11-25", ...o });
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

describe("old pages, directories and notes that leak into drafts", () => {
  const u = new Set(["https://www.justdial.com/Surat/Yash-Enterprise", "https://yashenterprise.in/contact", "https://old.example.org/page"]);
  const lead = { business: "Yash Enterprise", email: null, phone: "08867859643", products: "Housekeeping and cleaning products (Justdial lists it as a housekeeping product dealer)", source_url: "https://www.justdial.com/Surat/Yash-Enterprise" };
  it("flags a lead found only on a directory page", () => { const r = parseLeads(wrap([lead]), u); expect(r[0].directory).toBe(true); expect(isDirectory("https://www.justdial.com/x")).toBe(true); expect(isDirectory("https://yashenterprise.in/contact")).toBe(false); });
  it("removes bracketed source notes and site names from what they deal in", () => {
    expect(cleanProducts(lead.products)).toBe("Housekeeping and cleaning products");
    expect(cleanProducts("soap listed on IndiaMART as dealer")).toBe("soap listed on");
    expect(leadMail({ business: "Yash", district: "Surat", products: lead.products }).body).not.toMatch(/justdial/i);
    expect(cleanProductsClient(lead.products)).toBe(cleanProducts(lead.products));
  });
  it("drops a lead whose page the search says is old, keeps a recent or undated one", () => {
    const ages = new Map([["https://old.example.org/page", "March 3, 2022"], ["https://yashenterprise.in/contact", "2 months ago"]]);
    expect(parseLeads(wrap([{ ...good, source_url: "https://old.example.org/page" }]), u, ages)).toHaveLength(0);
    expect(parseLeads(wrap([{ ...good, source_url: "https://yashenterprise.in/contact" }]), u, ages)).toHaveLength(1);
    expect(parseLeads(wrap([{ ...good, source_url: "https://yashenterprise.in/contact" }]), u)).toHaveLength(1);
  });
  it("reads page ages in both forms", () => { expect(ageMonths("3 months ago")).toBe(3); expect(ageMonths("1 year ago")).toBe(12); expect(ageMonths(undefined)).toBeNull(); expect(ageMonths("April 30, 2020")!).toBeGreaterThan(60); });
  it("second pass takes an e-mail only from the business's own page the search returned, never a directory", () => {
    const own = parseEnrich(JSON.stringify({ results: [{ business: "Yash Enterprise", email: "Info@YashEnterprise.in", phone: null, website: "https://yashenterprise.in", source_url: "https://yashenterprise.in/contact" }] }), u);
    expect(own.get("yash enterprise")?.email).toBe("info@yashenterprise.in");
    expect(parseEnrich(JSON.stringify({ results: [{ business: "Yash Enterprise", email: "a@b.in", source_url: "https://www.justdial.com/Surat/Yash-Enterprise" }] }), u).size).toBe(0);
    expect(parseEnrich(JSON.stringify({ results: [{ business: "Yash Enterprise", email: "a@b.in", source_url: "https://invented.example.net/" }] }), u).size).toBe(0);
  });
  it("merging makes the own page the source and fills the missing e-mail", () => {
    const l = parseLeads(wrap([lead]), u)[0]; const e = parseEnrich(JSON.stringify({ results: [{ business: "Yash Enterprise", email: "info@yashenterprise.in", source_url: "https://yashenterprise.in/contact" }] }), u).get("yash enterprise")!;
    const m = mergeEnriched(l, e); expect(m.email).toBe("info@yashenterprise.in"); expect(m.phone).toBe("08867859643"); expect(m.directory).toBe(false); expect(m.source_url).toBe("https://yashenterprise.in/contact");
  });
});

describe("WhatsApp", () => {
  it("turns an Indian mobile number into a WhatsApp number in every common form", () => {
    for (const p of ["08867859643", "8867859643", "+91 88678 59643", "91-8867859643", "0091 8867859643".replace("0091 ", "91")]) expect(waNumber(p)).toBe("918867859643");
  });
  it("gives no WhatsApp number for landlines, short or empty numbers", () => { expect(waNumber("0265 2345678")).toBeNull(); expect(waNumber("12345")).toBeNull(); expect(waNumber(null)).toBeNull(); expect(waNumber("5867859643")).toBeNull(); });
  it("builds a click-to-chat link with the message, and nothing for a landline", () => {
    const l = waLink("08867859643", waMessage({ name: "R. Shah", district: "Surat" }))!;
    expect(l.startsWith("https://wa.me/918867859643?text=")).toBe(true); expect(decodeURIComponent(l)).toContain("Hello R. Shah"); expect(decodeURIComponent(l)).toContain("Surat");
    expect(waLink("0265 2345678", "x")).toBeNull();
  });
  it("message makes no price, scheme, exclusivity or chemical-free claim and offers an opt-out", () => { const m = waMessage({ district: "Rajkot" }); expect(m).not.toMatch(/₹|rs\.?\s*\d|discount|margin|scheme|exclusive|chemical-free|germ|cure/i); expect(m).toMatch(/STOP/); expect(m).toContain("Appointment follows registration checks"); });
  it("area summary counts WhatsApp", () => { expect(summarize([L({ wa_at: "x" }), L({})])[0].wa).toBe(1); });
});
