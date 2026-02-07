import { Issuer } from 'openid-client';

const CONFLUENCE_AUTHORIZATION_ENDPOINT = 'https://auth.atlassian.com/authorize';
const CONFLUENCE_TOKEN_ENDPOINT = 'https://auth.atlassian.com/oauth/token';

export function getConfluenceOAuthScopes(): string[] {
  return [
    'read:content:confluence',
    'write:content:confluence',
    'read:page:confluence',
    'write:page:confluence',
    'read:space:confluence',
    'offline_access',
    'read:jira-work',
    'manage:jira-webhook'
  ];
}

export function createConfluenceOAuthClient(redirectUri?: string) {
  const clientId = process.env.ATLASSIAN_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Atlassian OAuth env. Set ATLASSIAN_OAUTH_CLIENT_ID and ATLASSIAN_OAUTH_CLIENT_SECRET.');
  }

  const issuer = new Issuer({
    issuer: 'https://auth.atlassian.com',
    authorization_endpoint: CONFLUENCE_AUTHORIZATION_ENDPOINT,
    token_endpoint: CONFLUENCE_TOKEN_ENDPOINT,
  });

  return new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUri ? [redirectUri] : ['http://localhost/oauth/callback'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  });
}
