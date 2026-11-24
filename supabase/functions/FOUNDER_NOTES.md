# Founder dashboard backend notes
- DB: founder_goals, epdms_network, founder_triggers; RPCs founder_snapshot, save_founder_goals, save_founder_trigger, save_epdms_network, evaluate_founder_triggers.
- Cron `founder-triggers` runs daily 8:15 AM IST; alerts go to admin notifications (and WhatsApp when enabled).
- Edge function `epdms-network` (deployed in Supabase, admin only) reads EPDMS `network-feed` using EPDMS_FEED_URL and EPDMS_FEED_SECRET.
- EPDMS project dkkwlipkhvuigkgjwizn hosts `network-feed` (header x-feed-secret = FEED_SECRET).

# Team & plans backend
- Migration `team_plans_and_password_reset`: profiles.plan_mode/plan_email/must_change, task_templates, assignments.template_id, password_resets, generate_plan(), save_member_plan(), clear_must_change().
- Cron: `plan-daily` 6:45 IST fills the next 5 weeks of tasks; `plan-email` 7:00 IST emails weekly plans on Mondays and monthly plans on the 1st.
- Functions: admin-users (admin only), send-plan-email (admin or cron secret), password-reset (public, emailed 6-digit code).
