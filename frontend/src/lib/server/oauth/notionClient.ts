import { Issuer, custom } from 'openid-client';

const NOTION_AUTHORIZATION_ENDPOINT = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_ENDPOINT = 'https://api.notion.com/v1/oauth/token';

// Notion returns JSON; ensure we request it consistently.
custom.setHttpOptionsDefaults({
  headers: {
    accept: 'application/json',
  },
});

export function createNotionOAuthClient(redirectUri?: string) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Notion OAuth env. Set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET.');
  }

  const issuer = new Issuer({
    issuer: 'https://api.notion.com',
    authorization_endpoint: NOTION_AUTHORIZATION_ENDPOINT,
    token_endpoint: NOTION_TOKEN_ENDPOINT,
  });

  return new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUri ? [redirectUri] : ['http://localhost/oauth/callback'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic',
  });
}

