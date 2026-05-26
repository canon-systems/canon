-- Drop the denormalized Slack columns from organizations.
-- The canonical source for Slack credentials is:
--   oauth_connections  (connection metadata, team info)
--   oauth_provider_tokens  (encrypted access token, via getProviderAccessToken())
-- Nothing should read organizations.slack_bot_token or organizations.slack_team_id.

ALTER TABLE organizations
  DROP COLUMN IF EXISTS slack_bot_token,
  DROP COLUMN IF EXISTS slack_team_id;
