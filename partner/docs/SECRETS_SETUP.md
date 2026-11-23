# Setting up secrets and credentials (do this yourself, by hand)

**Why by hand.** A secret is a password for a service. Anyone who has it can use that service as you (read your database, send e-mail from your domain, spend your AI credit). A secret that leaks does not stop working, it works for the wrong person. So: type each secret only into the place named below, never into this repository, a chat, an e-mail or a screenshot. If one is ever exposed, treat it as stolen and replace it (rotate) at once.

**What is safe to be public.** The Supabase *project URL* and the *publishable key* (starts `sb_publishable_`) are meant to be in the browser. The database rules (row-level security) protect the data. The **service role / secret key** is the opposite: server only.

Work in this order. Tick as you go. Keep a private note of WHERE each secret is stored, never the value.

## 0. Before you start
- [ ] Use a password manager. Turn on two-step sign-in for GitHub, Supabase, Cloudflare, Resend, Leegality, Anthropic.
- [ ] Open the Supabase project `earthlabs-partner-platform` (region ap-south-1).

## 1. Supabase values for the website build (public values)
1. Supabase dashboard, Project Settings, **API Keys**. Copy the **Project URL** and the **Publishable key**. Do not copy the secret / service_role key for this step.
2. GitHub repo `goxl99/Earthlabs`, Settings, Secrets and variables, Actions:
   - New repository secret `NEXT_PUBLIC_SUPABASE_URL` = the Project URL.
   - New repository secret `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the publishable key.
   - Variables tab, New variable `PARTNER_BASE_PATH` = empty for `partner.earthlabsproducts.com`, or `/partner` if the site is served under that path.
3. If you host on Cloudflare Pages (a project `earthlabs-partner` already exists): Cloudflare, Workers & Pages, earthlabs-partner, Settings, Variables: add the same two `NEXT_PUBLIC_...` variables and `PARTNER_BASE_PATH`, then redeploy.

## 2. Supabase Edge Function secrets (private values)
Supabase already provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically. You add only the ones below.
Where: dashboard, **Edge Functions, Secrets** (or CLI: `supabase secrets set NAME=value`). Paste into the field; never into a file in the repo.

| Secret | Where to get it | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com, API keys, Create key (name it `epdms`; set a monthly spend limit) | `ai-recommend` |
| `AI_MODEL` (optional) | model name from Anthropic docs | `ai-recommend` |
| `RESEND_API_KEY` | resend.com, verify your sending domain, API Keys, Create (sending access only) | `send-emails` |
| `WA_PHONE_ID`, `WA_TOKEN` (optional `WA_TEMPLATE`, `WA_TEMPLATE_LANG`) | Meta Business, WhatsApp Cloud API: phone number ID and a permanent token; outside the 24-hour window Meta only delivers an approved template with one body variable | `send-whatsapp` (only after Super Admin sets the `whatsapp` setting to enabled; schedule it like `send-emails`, with `CRON_SECRET`) |
| `MAIL_FROM` | an address on the verified domain, e.g. `Name <partners@yourdomain>` | `send-emails` |
| `CRON_SECRET` | make up a random 32+ character string (password manager generator) | `send-emails` |
| `LEEGALITY_AUTH_TOKEN`, `LEEGALITY_PROFILE_ID`, `LEEGALITY_PRIVATE_SALT` | Leegality account, API / workflow settings | `esign-send`, `esign-webhook` |
| `LEEGALITY_BASE_URL` | sandbox first; production is `https://app1.leegality.com/api` | e-sign functions |
| `BATCH_SUPABASE_URL`, `BATCH_READ_KEY`, `BATCH_VIEW` | the batch project: a READ-ONLY key and a view that exposes only QC-approved batches | `batch-qc` |
| `ALLOWED_ORIGINS` | the exact portal address(es), comma separated | functions that check origin |

Then:
1. Deploy the functions (dashboard, Edge Functions, or `supabase functions deploy <name>`): `ai-recommend`, `send-emails`, `esign-send`, `esign-webhook`, `batch-qc`, `health`.
2. Schedule `send-emails` every 5 minutes (dashboard, Integrations, Cron) with the header `x-cron-secret: <CRON_SECRET>`.
3. In Leegality set the webhook URL to the `esign-webhook` function address. Test one document in the sandbox.
4. Test `health`: open its URL; it should answer OK and show no secret values.

## 3. Supabase Auth settings
Authentication: Site URL = portal address; add Redirect URL; turn on **Leaked password protection**; minimum length 12; turn on e-mail confirmation; add Cloudflare Turnstile CAPTCHA if you want sign-up protection.

## 4. First account
Open the portal and register your own account first. The first account becomes Super Admin. Then activate staff in Users & access.

## 5. If a secret is exposed (rotate)
1. Create a new key at the provider, put the new value in the same place as above.
2. Delete the old key at the provider.
3. For Supabase keys: Project Settings, API Keys, create a new secret key and delete the old one; update the Edge Function secrets.
4. Check Audit trail and the provider's usage page for use you do not recognise.
5. If it was ever committed to GitHub, rotating is mandatory: removing the file does not remove it from history.

## 6. Check nothing secret is in the repo
Run `git grep -nEi "sk-ant|service_role|eyJ"` in the repo: only code that READS an environment variable should appear. The test suite also fails if a key-shaped string is committed.
