-- Remove the generated name column now that all code uses first_name / last_name directly
ALTER TABLE new_hires DROP COLUMN IF EXISTS name;
