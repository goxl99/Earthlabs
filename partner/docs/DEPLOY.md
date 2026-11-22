# Deploying the partner portal

1. **Database**: create the Supabase project (Pro plan recommended for 1,000+ users), then run the files in `supabase/migrations` in order (`supabase db push`). Turn on daily backups.
2. **Auth settings** (Supabase → Authentication → URL Configuration): Site URL = the public address below; add it to Redirect URLs.
3. **Secrets**: in GitHub repo Settings add secrets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and variable `PARTNER_BASE_PATH`.
4. **Build**: run the "Partner platform build for deploy" workflow. It produces the static site in the `partner-site` artifact.
5. **Host**: publish that folder on Vercel / Cloudflare Pages / Netlify, ideally as `partner.earthlabsproducts.com` (`PARTNER_BASE_PATH` empty).
6. **www.earthlabsproducts.com/partner**: on the website host add a redirect `/partner` → the hosted address (the same way `/batch` was done). If the site host can proxy instead, set `PARTNER_BASE_PATH=/partner` and proxy that path.
7. **First sign-in**: the first account created becomes Super Admin. Create it yourself before sharing the link, then activate staff and partners in Users.

## Exact go-live steps (prepared in build 8; NOT executed: every step below needs Viraj's approval)

Order matters. Stop and ask if any check fails.

1. **Review and merge.** Open the pull request `partner-platform` into `main`. Check that CI is green. Merge only when you are satisfied. Do not merge while the Supabase advisors show a security error.
2. **Database.** In the Supabase project `earthlabs-partner-platform`, make sure migrations up to `20261122000015_day5_rls_performance.sql` are applied (list them with `supabase migration list`, or ask the build routine to apply them: the live project is behind repo files 014 and 015 until you approve that). Then open Advisors, Security and Performance. Expected leftovers are listed in HANDOVER.md.
3. **Auth settings.** Authentication, URL Configuration: Site URL = the portal address from step 5; add the same to Redirect URLs. Turn on leaked-password protection and minimum length 12.
4. **First account.** Open the portal address, create your own account FIRST (it becomes Super Admin), sign in and confirm the Users & access screen opens.
5. **Host the site.** Run the "Partner platform build for deploy" workflow with `PARTNER_BASE_PATH` empty and publish the `partner-site` artifact at `partner.earthlabsproducts.com` (Vercel, Cloudflare Pages or Netlify). Add the DNS CNAME your host asks for. Check `https://partner.earthlabsproducts.com/` loads, Verify and Track pages work logged out.
6. **Redirect (the only change to the public website).** On the website host for www.earthlabsproducts.com add one rule: `/partner` and `/partner/*` -> `https://partner.earthlabsproducts.com/` with status 302 first (use 301 only after a week without problems). With Vercel this is a `redirects` entry in the website project's `vercel.json`:
   `{ "source": "/partner/:path*", "destination": "https://partner.earthlabsproducts.com/:path*", "permanent": false }`
   Do not touch the existing `/batch` rule. Open `https://www.earthlabsproducts.com/partner` in a private window to test.
7. **Smoke test** with a test dealer and the checklist in HANDOVER.md section E. Remove test accounts afterwards.
8. **Rollback.** Delete the redirect rule (the website is unchanged otherwise) and unpublish the hosted site. The database needs no rollback; set `partner_types.registration_open = false` for both types to close registration.
