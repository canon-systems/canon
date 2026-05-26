-- Add first_name and last_name as nullable columns initially so we can backfill
ALTER TABLE new_hires
  ADD COLUMN first_name text,
  ADD COLUMN last_name text;

-- Backfill from existing name column
UPDATE new_hires
  SET
    first_name = split_part(name, ' ', 1),
    last_name = CASE
      WHEN strpos(name, ' ') > 0 THEN substr(name, strpos(name, ' ') + 1)
      ELSE ''
    END;

-- Make NOT NULL after backfill
ALTER TABLE new_hires
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL;

-- Drop the old name column (all code now uses first_name / last_name directly)
ALTER TABLE new_hires DROP COLUMN IF EXISTS name;
