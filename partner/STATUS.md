
## UI rebuild (prototype design ported)
- `globals.css` now carries the review prototype's design system: top bar, grouped icon sidebar with count badges, KPI cards, buttons (plain `.btn` = primary, `.out` = outline, `.gold-fill`, `.ghost`), tables, badges, steps, public-site classes. Bare inputs/labels/tables are styled, so all existing screens pick up the look.
- New public pages: home (hero, path cards, journey, sign-in), `/become/` (Become a Partner), 4-step `/register/` wizard. Dealer and Distributor buttons go straight to `/register/?type=DLR|DST`.
- `website/become-a-partner.html`: self-contained copy for the WordPress site; its buttons link to `https://www.earthlabsproducts.com/partner/register/?type=DLR|DST`.
- Not done: application document upload step (backend has no upload RPC yet).
