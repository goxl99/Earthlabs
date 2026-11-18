# Deploying the partner portal

1. **Database**: create the Supabase project (Pro plan recommended for 1,000+ users), then run the files in `supabase/migrations` in order (`supabase db push`). Turn on daily backups.
2. **Auth settings** (Supabase → Authentication → URL Configuration): Site URL = the public address below; add it to Redirect URLs.
3. **Secrets**: in GitHub repo Settings add secrets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and variable `PARTNER_BASE_PATH`.
4. **Build**: run the "Partner platform build for deploy" workflow. It produces the static site in the `partner-site` artifact.
5. **Host**: publish that folder on Vercel / Cloudflare Pages / Netlify, ideally as `partner.earthlabsproducts.com` (`PARTNER_BASE_PATH` empty).
6. **www.earthlabsproducts.com/partner**: on the website host add a redirect `/partner` → the hosted address (the same way `/batch` was done). If the site host can proxy instead, set `PARTNER_BASE_PATH=/partner` and proxy that path.
7. **First sign-in**: the first account created becomes Super Admin. Create it yourself before sharing the link, then activate staff and partners in Users.
