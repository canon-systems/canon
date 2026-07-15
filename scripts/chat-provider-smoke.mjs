#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROVIDER_CONFIG_DEFAULTS = {
  teams: ['NANGO_TEAMS_INTEGRATION_ID', 'NANGO_TEAMS_PROVIDER_CONFIG_KEY', 'NANGO_MICROSOFT_TEAMS_INTEGRATION_ID', 'NANGO_MICROSOFT_TEAMS_PROVIDER_CONFIG_KEY', 'microsoft-teams'],
};

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index++;
  }
  return args;
}

function usage() {
  return `Usage:
  npm run smoke:chat -- --provider teams --connection-id <conn> --list
  npm run smoke:chat -- --provider teams --organization-id <org> --list
  CANON_SMOKE_ALLOW_SEND=true npm run smoke:chat -- --provider teams --connection-id <conn> --send --target-type channel --target-id <teamId/channelId>
  CANON_SMOKE_ALLOW_SEND=true npm run smoke:chat -- --provider teams --connection-id <conn> --send --target-type dm --target-id <chatId>

Options:
  --provider       teams
  --connection-id  Nango connection id for a sandbox connection
  --organization-id Canon organization id, used to discover a tagged Nango connection
  --list           List available Teams targets
  --send           Send one smoke-test message
  --target-type    Teams only: channel | dm
  --target-id      Teams channel teamId/channelId or Teams chatId
  --message        Optional message text`;
}

function providerConfigKey(provider) {
  const candidates = PROVIDER_CONFIG_DEFAULTS[provider];
  if (!candidates) throw new Error(`Unsupported provider: ${provider}`);
  for (const candidate of candidates) {
    if (candidate in process.env && process.env[candidate]) return process.env[candidate];
  }
  return candidates[candidates.length - 1];
}

function nangoBaseUrl() {
  return (process.env.NANGO_API_BASE_URL || 'https://api.nango.dev').replace(/\/$/, '');
}

async function nangoProxy({ provider, connectionId, endpoint, method = 'GET', query, body }) {
  const url = new URL(`${nangoBaseUrl()}/proxy${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${process.env.NANGO_API_KEY}`,
      'provider-config-key': providerConfigKey(provider),
      'connection-id': connectionId,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Nango proxy ${method} ${endpoint} failed with ${response.status}: ${text || response.statusText}`);
  }
  return data;
}

async function nangoApi({ path, query }) {
  const url = new URL(`${nangoBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${process.env.NANGO_API_KEY}`,
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Nango API ${path} failed with ${response.status}: ${text || response.statusText}`);
  }
  return data;
}

function providerAliases(provider) {
  if (provider === 'teams') return new Set(['teams', 'microsoft-teams', 'microsoft_teams', 'ms-teams', providerConfigKey(provider)]);
  return new Set([providerConfigKey(provider)]);
}

async function resolveConnectionId({ provider, connectionId, organizationId }) {
  if (connectionId) return connectionId;
  if (!organizationId) return null;

  const response = await nangoApi({
    path: '/connections',
    query: {
      'tags[organization_id]': organizationId,
      limit: 100,
    },
  });
  const aliases = providerAliases(provider);
  const connection = (response.connections ?? []).find((candidate) => (
    typeof candidate?.connection_id === 'string' &&
    typeof candidate?.provider_config_key === 'string' &&
    aliases.has(candidate.provider_config_key)
  ));
  return connection?.connection_id ?? null;
}

function arrayField(response, keys) {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(response[key])) return response[key];
  }
  return [];
}

function stringField(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function listTeamsTargets(connectionId) {
  const targets = [];
  const teamsResponse = await nangoProxy({ provider: 'teams', connectionId, endpoint: '/v1.0/me/joinedTeams' });
  for (const team of arrayField(teamsResponse, ['value', 'teams'])) {
    const teamId = stringField(team, ['id']);
    if (!teamId) continue;
    const teamName = stringField(team, ['displayName', 'name']) ?? teamId;
    const channelsResponse = await nangoProxy({
      provider: 'teams',
      connectionId,
      endpoint: `/v1.0/teams/${encodeURIComponent(teamId)}/channels`,
    }).catch((error) => ({ error: error.message, value: [] }));
    for (const channel of arrayField(channelsResponse, ['value', 'channels'])) {
      const channelId = stringField(channel, ['id']);
      if (!channelId) continue;
      const channelName = stringField(channel, ['displayName', 'name']) ?? channelId;
      targets.push({ type: 'channel', id: `${teamId}/${channelId}`, name: `${teamName} / ${channelName}` });
    }
  }

  const chatsResponse = await nangoProxy({
    provider: 'teams',
    connectionId,
    endpoint: '/v1.0/me/chats',
    query: { '$top': 50 },
  }).catch((error) => ({ error: error.message, value: [] }));
  for (const chat of arrayField(chatsResponse, ['value', 'chats'])) {
    const chatId = stringField(chat, ['id']);
    if (!chatId) continue;
    targets.push({ type: 'dm', id: chatId, name: stringField(chat, ['topic', 'displayName']) ?? 'Teams chat' });
  }

  return targets;
}

function teamsChannelParts(targetId) {
  const separator = targetId.includes('/') ? '/' : ':';
  const [teamId, channelId] = targetId.split(separator).map((part) => part.trim()).filter(Boolean);
  if (!teamId || !channelId) throw new Error('Teams channel target must be teamId/channelId or teamId:channelId');
  return { teamId, channelId };
}

function smokeMessage(provider, message) {
  return message || `[Canon smoke test] ${provider} delivery check at ${new Date().toISOString()}`;
}

async function sendTeams({ connectionId, targetType, targetId, message }) {
  const body = {
    body: {
      contentType: 'html',
      content: smokeMessage('Teams', message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    },
  };

  if (targetType === 'channel') {
    const { teamId, channelId } = teamsChannelParts(targetId);
    return nangoProxy({
      provider: 'teams',
      connectionId,
      endpoint: `/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
      method: 'POST',
      body,
    });
  }

  return nangoProxy({
    provider: 'teams',
    connectionId,
    endpoint: `/v1.0/chats/${encodeURIComponent(targetId)}/messages`,
    method: 'POST',
    body,
  });
}

function printTargets(targets) {
  if (targets.length === 0) {
    console.log('No targets returned. Check provider scopes, tenant permissions, and the Nango connection.');
    return;
  }
  console.table(targets.map((target) => ({
    type: target.type,
    id: target.id,
    name: target.name,
  })));
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  const args = parseArgs(process.argv.slice(2));
  const provider = args.provider;

  if (!provider || provider !== 'teams' || (!args['connection-id'] && !args['organization-id'] && !process.env.CANON_SMOKE_NANGO_CONNECTION_ID) || (!args.list && !args.send)) {
    console.error(usage());
    process.exit(2);
  }
  if (!process.env.NANGO_API_KEY) throw new Error('Missing NANGO_API_KEY');

  const connectionId = await resolveConnectionId({
    provider,
    connectionId: args['connection-id'] || process.env.CANON_SMOKE_NANGO_CONNECTION_ID,
    organizationId: args['organization-id'],
  });
  if (!connectionId) throw new Error(`No ${provider} Nango connection found. Pass --connection-id or a tagged --organization-id.`);

  if (args.list) {
    const targets = await listTeamsTargets(connectionId);
    printTargets(targets);
  }

  if (args.send) {
    if (process.env.CANON_SMOKE_ALLOW_SEND !== 'true') {
      throw new Error('Refusing to send. Set CANON_SMOKE_ALLOW_SEND=true and use a sandbox target.');
    }
    if (!args['target-id']) throw new Error('Missing --target-id');

    const result = await sendTeams({
      connectionId,
      targetType: args['target-type'] === 'dm' ? 'dm' : 'channel',
      targetId: args['target-id'],
      message: args.message,
    });

    console.log(JSON.stringify({
      ok: true,
      provider,
      sentTo: args['target-id'],
      result,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
