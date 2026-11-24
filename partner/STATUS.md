# Walkthrough completion pass (branch `epdms-walkthrough-complete`)

Read `docs/WALKTHROUGH_GAP_MATRIX.md` for the page-by-page picture. Summary:

- Two diverged lines were merged without removing anything that worked.
- New migrations, all additive: 018b to 025. **None of them is applied to the live database.** The new screens call functions and columns from these migrations, so apply them before deploying the front end. Users & access falls back gracefully before migration 024.
- New edge function `create-staff-user`. **Not deployed.**
- Tests: 124 unit and component tests (`npm test`), type check, static build, and the database role tests (`supabase/run_local_tests.sh`, all suites pass).
- Not done: live click-through against Supabase, pixel comparison with the walkthrough, and the open items in the matrix.
- Nothing has been merged into another branch, deployed, or run against production data.


## UI rebuild (prototype design ported)
- `globals.css` now carries the review prototype's design system: top bar, grouped icon sidebar with count badges, KPI cards, buttons (plain `.btn` = primary, `.out` = outline, `.gold-fill`, `.ghost`), tables, badges, steps, public-site classes. Bare inputs/labels/tables are styled, so all existing screens pick up the look.
- New public pages: home (hero, path cards, journey, sign-in), `/become/` (Become a Partner), 4-step `/register/` wizard. Dealer and Distributor buttons go straight to `/register/?type=DLR|DST`.
- `website/become-a-partner.html`: self-contained copy for the WordPress site; its buttons link to `https://www.earthlabsproducts.com/partner/register/?type=DLR|DST`.
- Not done: application document upload step (backend has no upload RPC yet).
