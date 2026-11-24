# Founder dashboard backend notes
- DB: founder_goals, epdms_network, founder_triggers; RPCs founder_snapshot, save_founder_goals, save_founder_trigger, save_epdms_network, evaluate_founder_triggers.
- Cron `founder-triggers` runs daily 8:15 AM IST; alerts go to admin notifications (and WhatsApp when enabled).
- Edge function `epdms-network` (deployed in Supabase, admin only) reads EPDMS `network-feed` using EPDMS_FEED_URL and EPDMS_FEED_SECRET.
- EPDMS project dkkwlipkhvuigkgjwizn hosts `network-feed` (header x-feed-secret = FEED_SECRET).
