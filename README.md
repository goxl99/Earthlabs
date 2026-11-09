# EarthLabs – Batch Management & QA/QC

Static web app (no server needed) + Supabase backend (project `hgdltduqwayfepzuurke`).

## Deploy
Upload the contents of `dist/` to any static host (Netlify Drop, Vercel, Cloudflare Pages, GitHub Pages, cPanel).
Then in Supabase → Authentication → URL Configuration set **Site URL** to your hosted address.
(Optional: Authentication → Providers → Email → turn off "Confirm email" if you want instant sign-in.)

## First use
1. Open the app and **Create account** – the very first account becomes **Admin** automatically.
2. Admin → **Master Data**: add raw materials, products (with temperature/density/viscosity limits), and each product's formulation.
3. Admin → **User Management**: new sign-ups arrive inactive; assign role (Operator / QC Officer / Admin) and activate.
4. Operators create batches → QC Officer approves → batch code EL-YYYYMMDD-NNN is issued → filling → inventory → dispatch.

## Rebuild from source
`npm install && npx esbuild src/main.js --bundle --minify --outfile=dist/app.js && cp public/* dist/`
Supabase URL/key live in `src/lib.js` (the publishable key is safe to expose; security is enforced by database RLS).
