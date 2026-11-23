// Sends one e-mail straight through Resend (used where the person is waiting: verification codes, logins, password resets).
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("MAIL_FROM"), to, subject, text }),
  });
  return r.ok;
}
export const PORTAL = "https://www.earthlabsproducts.com/partner/";
