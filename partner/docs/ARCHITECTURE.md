# EPDMS architecture, expert review and hosting

## Layers (top to bottom)
1. **Users**: partners, vendors, EarthLabs staff, public applicants.
2. **Edge security layer (added in review)**: Cloudflare in front of the site: DNS, CDN, WAF, rate limiting, bot check (Turnstile) on sign-in and registration, security headers (`partner/public/_headers`, `partner/vercel.json`).
3. **Frontend**: Next.js static export (`partner/`), served from a static host at `partner.earthlabsproducts.com`; `www.earthlabsproducts.com/partner` redirects to it.
4. **Backend (Supabase, Mumbai `ap-south-1`)**:
   - Auth: logins; roles via `profiles`.
   - Postgres with row-level security: every rule (prices, margins, scheme visibility, payment gate, Partner ID) is enforced here, not in the browser.
   - Storage: private buckets `payment-proofs`, `agreements`, `certificates`, folder per Partner ID.
   - Edge Functions (`supabase/functions`): AI recommendations (Claude API), e-mail/WhatsApp, scheduled jobs, `health` probe. Secrets live only in Supabase.
5. **External services**: e-mail, WhatsApp Cloud API, Claude API, the existing Batch Management system (read-only link to QC-approved batches).
6. **Operations layer (added in review)**: daily backups with point-in-time recovery (Supabase Pro), uptime probe on `/functions/v1/health`, error tracking, CI/CD (GitHub Actions), migration-only schema changes.

## Hosting plan
| Piece | Where | Why |
|---|---|---|
| Static app | Cloudflare Pages (or Vercel) | Free CDN, custom domain, HTTP headers, instant rollback |
| Database, auth, files, functions | Supabase Pro, Mumbai | Low latency in India, backups, 1,000+ users comfortably |
| DNS, WAF, rate limits, bot check | Cloudflare | One place for the edge layer |
| Source and CI | GitHub (`goxl99/Earthlabs`, folder `partner/`, `supabase/`) | Already in use |
Needs Viraj: Supabase upgrade, Cloudflare account for the domain, and approval to point `/partner`.

## Expert review: findings and what was done
| # | Finding | Risk | Action |
|---|---|---|---|
| 1 | "First sign-up becomes Super Admin" could be won by a stranger or by two simultaneous sign-ups | High | Replaced with a one-time, row-locked bootstrap switch (migration 006) and tested |
| 2 | Audit trail could be edited by a privileged user | High | Update/delete blocked by trigger and revoked privileges (006), tested |
| 3 | Public registration open to floods and bots | Medium | Hourly cap in the database (006) plus edge rate limit and Turnstile (edge layer) |
| 4 | Application tracking could leak other applicants | Medium | Tracking needs reference AND e-mail; returns one row only (005), tested |
| 5 | Approval could bypass issuing the Partner ID | High | Guard trigger: approval only through `approve_application()` (005), tested |
| 6 | Partners could read margins | High | Margins staff-only; partners get price via `my_unit_price()` (003), tested |
| 7 | No file storage rules for payment proofs and MOUs | High | Private buckets with per-partner folder policies (006) |
| 8 | No security headers or CSP | Medium | `_headers` and `vercel.json` added |
| 9 | No uptime probe or backups defined | Medium | `health` function; backups need the Pro plan (blocked on upgrade) |
| 10 | Repo is public | Medium | No secrets, real prices or partner data in the repo; real data only in Supabase |
| 11 | Static export cannot run server code | Info | By design: server logic is in the database and Edge Functions |
| 12 | Screens are not click-tested against a live database | Medium | Blocked until the Supabase project exists; Day 5 browser tests |

## Rules that must always hold (each has a database test)
Only Super Admin changes products, prices, margins, schemes · partner IDs never change · an order cannot advance without verified payment (Build 5) · partners see only their own data, SKUs and schemes · every important change is audited and the audit cannot be altered.
