# Dealer Outreach: one-time setup

The screen is at **Partners, Dealer Outreach**. Searching and approving work as soon as `ANTHROPIC_API_KEY` is set. Mail to dealers stays off until steps 1 to 3 are done.

1. **Receive replies (Resend).** Resend dashboard, Emails, Receiving: turn on receiving for a domain or subdomain you control (for example `replies.yourdomain.com`) and add the MX record Resend shows. Replies to `anything@replies.yourdomain.com` are then received by Resend.
2. **Tell the portal where replies go.** In the portal, Dealer Outreach, Sending settings (Super Admin): enter an address on that domain (for example `partners@replies.yourdomain.com`) and a daily cap, then Save. Until this is saved nothing is sent to dealers.
3. **Connect replies to the portal.** Supabase, Edge Functions, Secrets: add `LEAD_REPLY_TOKEN` (a random 32+ character string). In Resend, Webhooks, add an endpoint for the event `email.received` at
   `https://dkkwlipkhvuigkgjwizn.supabase.co/functions/v1/lead-reply?t=<LEAD_REPLY_TOKEN>`
   (`RESEND_API_KEY` is already used by `send-emails`; `ANTHROPIC_API_KEY` lets the AI read each reply and suggest the next step. Without it replies are still matched and shown, with "Read the reply and decide").
4. Test: add yourself as a lead (Add my own list), approve it, reply from that address, and check that the lead shows Replied with a next step.

How it behaves
- The AI finds dealers only from pages the web search really returned and saves the page link with each lead. It never guesses an e-mail address.
- Nothing is sent without a person approving that lead. The first e-mail is fixed wording (no prices, schemes or claims) that you can edit before approving, with a STOP line added automatically.
- A reply of STOP, unsubscribe or similar marks the dealer Opted out and they are never mailed again.
- At most the daily cap goes out each day (India time); the rest follow automatically.

## Brochure and video in the first e-mail
- The two files live on the website server in `public_html/partner-assets/` (outside `/partner`, so a portal upload never removes them): `EarthLabs-Product-Brochure.pdf` (1.4 MB) and `EarthLabs-Intro-Video.mp4` (3.4 MB, 720p).
- The settings row `lead_attachments` lists them (`filename` and an https `path`). `release_approved_leads()` copies it onto each queued mail and adds "I have attached our product brochure and a short video."; `send-emails` passes the links to Resend, which fetches and attaches the files. To stop attaching, delete that settings row.
- WhatsApp messages link to the same two files (`BROCHURE_URL`, `VIDEO_URL` in `src/lib/outreach.ts`). To replace a file, upload a new one with the same name to that folder.
- Keep the total under about 10 MB: Gmail refuses messages over 25 MB after encoding, and large attachments in first e-mails are more likely to land in spam.
