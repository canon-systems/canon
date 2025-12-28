import { Issuer, custom } from 'openid-client';

const GITHUB_AUTHORIZATION_ENDPOINT = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';

// GitHub returns `application/x-www-form-urlencoded` unless `Accept: application/json` is set.
custom.setHttpOptionsDefaults({
  headers: {
    accept: 'application/json',
  },
});

export function getGitHubOAuthScopes(): string[] {
  const configured = process.env.GITHUB_OAUTH_SCOPES?.trim();
  if (configured) {
    return configured.split(/\s+/).filter(Boolean);
  }

  // Matches prior Nango scopes (+ user:email for email lookup).
  return ['repo', 'read:user', 'user:email'];
}

export function createGitHubOAuthClient(redirectUri?: string) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing GitHub OAuth env. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET.');
  }

  const issuer = new Issuer({
    issuer: 'https://github.com',
    authorization_endpoint: GITHUB_AUTHORIZATION_ENDPOINT,
    token_endpoint: GITHUB_TOKEN_ENDPOINT,
  });

  return new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUri ? [redirectUri] : ['http://localhost/oauth/callback'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  });
}
