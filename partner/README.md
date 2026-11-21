# EarthLabs Partner & Distribution Management System

Next.js (static export) + Supabase. See `docs/BUILD_PLAN.md` for the plan and status, `docs/DEPLOY.md` to go live.

```
cd partner && npm install && cp .env.example .env.local   # add Supabase URL and key
npm run dev          # local
npm test && npm run typecheck && npm run build
../supabase/run_local_tests.sh   # database + security tests on a local Postgres
```
The repo is public: never commit secrets, real prices, margins or partner data.
