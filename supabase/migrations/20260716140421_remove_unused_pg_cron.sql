-- Canon schedules background work with Inngest. The obsolete Supabase Cron job
-- was removed by the canonical cleanup migration, so the extension is no longer
-- part of the application runtime.
drop extension if exists pg_cron;
