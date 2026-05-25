const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

type SlackTeamInfo = {
  id?: string;
  name?: string;
};

type SlackEnterpriseInfo = {
  id?: string;
  name?: string;
};

type SlackAuthedUserInfo = {
  id?: string;
  scope?: string;
  access_token?: string;
  token_type?: string;
};

export type SlackOAuthTokenResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: SlackTeamInfo;
  enterprise?: SlackEnterpriseInfo | null;
  authed_user?: SlackAuthedUserInfo;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
};

function getSlackOAuthEnv() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Slack OAuth env. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.');
  }

  return { clientId, clientSecret };
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const message = (payload as Record<string, unknown>).error;
  return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
}

async function parseSlackOAuthResponse(response: Response, fallback: string): Promise<SlackOAuthTokenResponse> {
  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || fallback);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, fallback));
  }

  const parsed = payload as SlackOAuthTokenResponse;
  if (!parsed.ok) {
    throw new Error(getErrorMessage(parsed, fallback));
  }

  return parsed;
}

export function getSlackOAuthScopes(): string[] {
  return [
    'chat:write',
    'channels:read',
    'channels:history',
    'groups:read',
    'groups:history',
    'mpim:read',
    'mpim:history',
    'im:read',
    'im:write',
    'im:history',
    'users:read',
  ];
}

export function buildSlackAuthorizeUrl(params: {
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const { clientId } = getSlackOAuthEnv();
  const scopes = (params.scopes || getSlackOAuthScopes()).join(',');

  const url = new URL(SLACK_AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', params.state);
  url.searchParams.set('redirect_uri', params.redirectUri);
  return url.toString();
}

export async function exchangeSlackCode(params: {
  code: string;
  redirectUri: string;
}): Promise<SlackOAuthTokenResponse> {
  const { clientId, clientSecret } = getSlackOAuthEnv();
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', params.code);
  body.set('redirect_uri', params.redirectUri);
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);

  const response = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  return parseSlackOAuthResponse(response, 'Slack token exchange failed.');
}

export async function refreshSlackToken(params: {
  refreshToken: string;
}): Promise<SlackOAuthTokenResponse> {
  const { clientId, clientSecret } = getSlackOAuthEnv();
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', params.refreshToken);
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);

  const response = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  return parseSlackOAuthResponse(response, 'Slack token refresh failed.');
}
