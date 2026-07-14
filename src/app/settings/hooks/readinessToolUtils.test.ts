import { describe, expect, it } from 'vitest';

import type { OrgTool } from '../../../types/onboarding';
import { groupOrgTools, normalizeToolName, scopeKey } from './readinessToolUtils';

function tool(overrides: Partial<OrgTool>): OrgTool {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    organization_id: 'org_1',
    tool_name: 'Slack',
    role: null,
    owner_name: null,
    owner_email: null,
    owner_slack_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('readiness tool utilities', () => {
  it('normalizes tool names and role scopes', () => {
    expect(normalizeToolName('  Slack Connect  ')).toBe('slack connect');
    expect(scopeKey(null)).toBe('all');
    expect(scopeKey('Sales Engineer')).toBe('Sales Engineer');
  });

  it('groups tools by normalized name and inherits the first available owner', () => {
    const groups = groupOrgTools([
      tool({ id: '1', tool_name: 'Slack', role: 'Sales Engineer' }),
      tool({
        id: '2',
        tool_name: ' slack ',
        role: 'Implementation Engineer',
        owner_name: 'Avery Owner',
        owner_email: 'avery@example.com',
        owner_slack_id: 'U123',
      }),
      tool({ id: '3', tool_name: 'Slack', role: null }),
      tool({ id: '4', tool_name: 'GitHub', role: 'AI Engineer' }),
      tool({ id: '5', tool_name: '   ', role: 'AI Engineer' }),
    ]);

    expect(groups.map((group) => group.tool_name)).toEqual(['GitHub', 'Slack']);

    const slack = groups.find((group) => group.key === 'slack');
    expect(slack).toBeDefined();
    expect(slack?.allRoles).toBe(true);
    expect(slack?.roles).toEqual(['Sales Engineer', 'Implementation Engineer']);
    expect(slack?.tools.map((groupedTool) => groupedTool.id)).toEqual(['1', '2', '3']);
    expect(slack?.owner_name).toBe('Avery Owner');
    expect(slack?.owner_email).toBe('avery@example.com');
    expect(slack?.owner_slack_id).toBe('U123');
  });
});
