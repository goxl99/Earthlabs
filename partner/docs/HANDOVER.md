# Hand-over checklist

Owner after hand-over: Viraj (Super Admin). Tick each box when done. Nothing here is executed by the build routine; items marked **Viraj** need a person.

## A. Accounts and access
- [ ] **Viraj**: create the first (Super Admin) account on the live site BEFORE sharing the link; confirm it shows as Super Admin and active.
- [ ] Enable a second Super Admin as backup (Users & access), stored with a different e-mail.
- [ ] **Viraj**: Supabase dashboard, Authentication, turn on *Leaked password protection* and set minimum password length to 12 (advisor warning; a dashboard setting, not SQL).
- [ ] Turn on e-mail confirmation and set Site URL and Redirect URLs (see DEPLOY.md).
- [ ] Add a CAPTCHA (Cloudflare Turnstile is already allowed in the security headers) on sign-up and sign-in.
- [ ] Rate limits: Supabase Auth rate limits left at default or tightened; public registration function is flood-guarded in the database.

## B. Secrets (set in Supabase and GitHub, never in the repo)
- [ ] `ANTHROPIC_API_KEY` (and optional `AI_MODEL`) for `ai-recommend`
- [ ] `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET` for `send-emails`, plus a 5-minute schedule
- [ ] `LEEGALITY_AUTH_TOKEN`, `LEEGALITY_PROFILE_ID`, `LEEGALITY_PRIVATE_SALT`, `LEEGALITY_BASE_URL`; webhook URL set in Leegality; verify the MAC encoding against one sandbox webhook
- [ ] `BATCH_*` secrets and the read-only view in the batch project for `batch-qc`
- [ ] GitHub: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, variable `PARTNER_BASE_PATH`
- [ ] Deploy the five Edge Functions (`ai-recommend`, `batch-qc`, `esign-send`, `esign-webhook`, `send-emails`) and `health`

## C. Database
- [ ] Migrations 001 to 015 applied to the live project (repo files 014 and 015 are Day 5: security hardening and speed). Run `get_advisors` for security and performance afterwards.
- [ ] Storage buckets exist and are private: payment advice, signed agreements, MOU templates. Check each bucket's policy limits files to the owner's folder.
- [ ] Load real masters through the screens (products, margins, schemes, partner types). Never commit real prices or partner data to the repo.
- [ ] Confirm the invoice number format with the accountant (currently a plain sequence, not financial-year style).

## D. Backups and restore drill
- [ ] **Viraj**: upgrade the Supabase organisation to Pro (daily backups; point-in-time recovery recommended for 1,000+ users).
- [ ] Restore drill: restore the latest backup into a new throw-away project, sign in as Super Admin, check partner count, order count and one ledger balance, then delete the throw-away project. Record the date and who did it here: ____
- [ ] Monthly: export Reports (orders, ledger, partners) as CSV to a secure drive.

## E. Quality gates before go-live
- [ ] CI green on the pull request (typecheck, unit tests, database tests including attack tests, build).
- [ ] Click-test each role on the live project: Super Admin, Sales, Accounts, Warehouse, Dealer, Distributor, Vendor (one real journey each: apply, approve, order, pay, confirm, dispatch, invoice).
- [ ] Mobile and accessibility pass on every screen (NOT done by the build routine, see STATUS.md).
- [ ] Attack test: sign in as a test dealer and try to open another partner's order link; it must show nothing.
- [ ] Supabase advisors: no security errors; accepted warnings listed below.

### Accepted advisor notes
- Functions callable by signed-in users (`authenticated_security_definer_function_executable`): by design. Each function checks the caller's role inside; the attack tests prove it.
- `email_outbox` and `id_counters` have RLS on and no policy: intentional, only server code with the service key touches them.
- "Unused index" notes on a new empty project disappear once there is traffic. Re-check after one month.

## F. Go-live (needs Viraj's approval, see DEPLOY.md)
- [ ] Merge the pull request to `main` (Viraj only).
- [ ] Deploy the static site.
- [ ] Add the `/partner` redirect on www.earthlabsproducts.com.
- [ ] Announce to the first pilot partners; watch Audit trail and Notifications for a week.

## G. Run-books
- Locked-out Super Admin: another Super Admin resets it in Users & access; if none, use the Supabase dashboard to set `profiles.role='super_admin', active=true` for the user, then record the change in the audit note.
- Payment wrongly confirmed: Accounts issues a credit note or reversing adjustment; ledger rows are never edited.
- Suspected leak: rotate the publishable key and all secrets, review Audit trail, pause the project in Supabase if needed.
