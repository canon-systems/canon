import type { HireRole, OrgTool } from '@/types/onboarding';

export interface ToolGroup {
  key: string;
  tool_name: string;
  tools: OrgTool[];
  roles: HireRole[];
  allRoles: boolean;
  owner_name: string | null;
  owner_email: string | null;
  owner_slack_id: string | null;
  primaryTool: OrgTool;
}

export function normalizeToolName(toolName: string) {
  return toolName.trim().toLowerCase();
}

export function scopeKey(role: HireRole | null) {
  return role ?? 'all';
}

function toolHasOwner(tool: Pick<OrgTool, 'owner_name' | 'owner_slack_id'>) {
  return Boolean(tool.owner_name && tool.owner_slack_id);
}

export function groupOrgTools(tools: OrgTool[]): ToolGroup[] {
  const groups = new Map<string, ToolGroup>();

  for (const tool of tools) {
    const key = normalizeToolName(tool.tool_name);
    if (!key) continue;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        tool_name: tool.tool_name,
        tools: [tool],
        roles: tool.role ? [tool.role] : [],
        allRoles: tool.role === null,
        owner_name: tool.owner_name,
        owner_email: tool.owner_email,
        owner_slack_id: tool.owner_slack_id,
        primaryTool: tool,
      });
      continue;
    }

    existing.tools.push(tool);
    if (tool.role === null) {
      existing.allRoles = true;
    } else if (!existing.roles.includes(tool.role)) {
      existing.roles.push(tool.role);
    }

    if (!toolHasOwner(existing) && toolHasOwner(tool)) {
      existing.owner_name = tool.owner_name;
      existing.owner_email = tool.owner_email;
      existing.owner_slack_id = tool.owner_slack_id;
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.tool_name.localeCompare(b.tool_name));
}
