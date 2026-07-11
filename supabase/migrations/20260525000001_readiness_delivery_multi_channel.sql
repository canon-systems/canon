ALTER TABLE readiness_delivery_settings
  ADD COLUMN channel_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN channel_names text[] NOT NULL DEFAULT '{}';

UPDATE readiness_delivery_settings
SET
  channel_ids = CASE WHEN channel_id IS NOT NULL THEN ARRAY[channel_id] ELSE '{}' END,
  channel_names = CASE WHEN channel_name IS NOT NULL THEN ARRAY[channel_name] ELSE '{}' END;

ALTER TABLE readiness_delivery_settings
  DROP COLUMN channel_id,
  DROP COLUMN channel_name;
