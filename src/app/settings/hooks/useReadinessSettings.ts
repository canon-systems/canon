'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { SlackUser } from '@/components/SlackUserPicker';
import { activeRoleProfiles, normalizeRoleName } from '@/lib/onboarding/roles';
import type { HireRole, OrgTool, RoleProfile } from '@/types/onboarding';

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

function normalizeToolName(toolName: string) {
  return toolName.trim().toLowerCase();
}

function scopeKey(role: HireRole | null) {
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

type UseReadinessSettingsParams = {
  enabled: boolean;
  setGlobalError: (message: string) => void;
};

export function useReadinessSettings({ enabled, setGlobalError }: UseReadinessSettingsParams) {
  const [tools, setTools] = useState<OrgTool[]>([]);
  const [roleProfiles, setRoleProfiles] = useState<RoleProfile[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [addRoleSaving, setAddRoleSaving] = useState(false);
  const [newRole, setNewRole] = useState({ role: '', job_description: '' });
  const [editingRole, setEditingRole] = useState<RoleProfile | null>(null);
  const [editRoleForm, setEditRoleForm] = useState({ job_description: '' });
  const [editRoleSaving, setEditRoleSaving] = useState(false);
  const [archivingRole, setArchivingRole] = useState<RoleProfile | null>(null);
  const [archiveRoleSaving, setArchiveRoleSaving] = useState(false);
  const [restoreRoleId, setRestoreRoleId] = useState<string | null>(null);
  const [addToolOpen, setAddToolOpen] = useState(false);
  const [addToolSaving, setAddToolSaving] = useState(false);
  const [addToolRole, setAddToolRole] = useState<HireRole | null>(null);
  const [newTool, setNewTool] = useState({ tool_name: '', owner: null as SlackUser | null });
  const [editingTool, setEditingTool] = useState<ToolGroup | null>(null);
  const [editTool, setEditTool] = useState({ tool_name: '', roles: [] as HireRole[], owner: null as SlackUser | null });
  const [editToolSaving, setEditToolSaving] = useState(false);
  const [deletingTool, setDeletingTool] = useState<ToolGroup | null>(null);
  const [deleteToolSaving, setDeleteToolSaving] = useState(false);

  const loadTools = useCallback(async () => {
    setToolsLoading(true);
    setRolesLoading(true);
    try {
      const [toolsRes, rolesRes] = await Promise.all([
        fetch('/api/onboarding/org-tools'),
        fetch('/api/onboarding/role-profiles?include_archived=true'),
      ]);
      const data = (await toolsRes.json()) as { tools?: OrgTool[] };
      const rolesData = (await rolesRes.json()) as { profiles?: RoleProfile[] };
      setTools(data.tools ?? []);
      setRoleProfiles(rolesData.profiles ?? []);
    } catch {
      // non-fatal
    } finally {
      setToolsLoading(false);
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void loadTools();
  }, [enabled, loadTools]);

  const activeToolRoles = activeRoleProfiles(roleProfiles).map((profile) => profile.role);

  function closeAddTool() {
    setAddToolOpen(false);
    setAddToolRole(null);
    setNewTool({ tool_name: '', owner: null });
  }

  async function addTool() {
    if (!newTool.tool_name.trim() || !newTool.owner || !addToolRole) return;

    setAddToolSaving(true);
    try {
      const existingTool = groupOrgTools(tools).find((tool) => normalizeToolName(tool.tool_name) === normalizeToolName(newTool.tool_name));
      const existingScopes = new Set(existingTool?.tools.map((tool) => scopeKey(tool.role)) ?? []);

      if (existingTool && existingScopes.has(scopeKey(addToolRole))) {
        toast.info(`${existingTool.tool_name} is already assigned to ${addToolRole}.`);
        setAddToolSaving(false);
        return;
      }

      const response = await fetch('/api/onboarding/org-tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool_name: newTool.tool_name,
          role: addToolRole,
          owner_name: newTool.owner?.name ?? null,
          owner_email: newTool.owner?.email ?? null,
          owner_slack_id: newTool.owner?.id ?? null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        if (data.error === 'Organization not found') throw new Error('org_not_found');
        throw new Error('add_tool');
      }
      closeAddTool();
      await loadTools();
      toast.success(existingTool ? 'Tool assigned to role' : 'Tool added');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'org_not_found') {
        toast.error('Organization not found', { description: 'Your account setup isn\'t complete. Finish setting up your organization to manage tools.' });
      } else {
        toast.error('Something went wrong adding the tool. Please try again.');
      }
    } finally {
      setAddToolSaving(false);
    }
  }

  async function confirmDeleteTool() {
    if (!deletingTool) return;
    setDeleteToolSaving(true);
    try {
      const responses = await Promise.all(
        deletingTool.tools.map((tool) => fetch(`/api/onboarding/org-tools?id=${tool.id}`, { method: 'DELETE' }))
      );
      const failingDeleteResponse = responses.find((res) => !res.ok);
      if (failingDeleteResponse) {
        const data = (await failingDeleteResponse.json()) as { error?: string };
        if (data.error === 'Organization not found') throw new Error('org_not_found');
        throw new Error('delete_tool');
      }
      const deletedIds = new Set(deletingTool.tools.map((tool) => tool.id));
      setTools((prev) => prev.filter((tool) => !deletedIds.has(tool.id)));
      setDeletingTool(null);
      toast.success('Tool removed');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'org_not_found') {
        toast.error('Organization not found', { description: 'Your account setup isn\'t complete. Finish setting up your organization to manage tools.' });
      } else {
        toast.error('Something went wrong removing the tool. Please try again.');
      }
    } finally {
      setDeleteToolSaving(false);
    }
  }

  async function addRole() {
    const role = normalizeRoleName(newRole.role);
    if (!role) return;
    setAddRoleSaving(true);
    try {
      const res = await fetch('/api/onboarding/role-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role,
          job_description: newRole.job_description,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'add_role');
      setNewRole({ role: '', job_description: '' });
      setAddRoleOpen(false);
      await loadTools();
      toast.success('Role added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong adding the role.');
    } finally {
      setAddRoleSaving(false);
    }
  }

  function openEditRole(profile: RoleProfile) {
    setEditingRole(profile);
    setEditRoleForm({ job_description: profile.job_description ?? '' });
  }

  async function saveRole() {
    if (!editingRole) return;
    setEditRoleSaving(true);
    try {
      const res = await fetch('/api/onboarding/role-profiles', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role: editingRole.role,
          job_description: editRoleForm.job_description,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'save_role');
      setEditingRole(null);
      await loadTools();
      toast.success('Role saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong saving the role.');
    } finally {
      setEditRoleSaving(false);
    }
  }

  async function archiveRole() {
    if (!archivingRole) return;
    setArchiveRoleSaving(true);
    try {
      const res = await fetch(`/api/onboarding/role-profiles?${new URLSearchParams({ role: archivingRole.role }).toString()}`, {
        method: 'DELETE',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'archive_role');
      setArchivingRole(null);
      await loadTools();
      toast.success('Role archived');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong archiving the role.');
    } finally {
      setArchiveRoleSaving(false);
    }
  }

  async function restoreRole(profile: RoleProfile) {
    setRestoreRoleId(profile.id);
    try {
      const res = await fetch('/api/onboarding/role-profiles', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role: profile.role,
          job_description: profile.job_description ?? '',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'restore_role');
      await loadTools();
      toast.success('Role restored');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong restoring the role.');
    } finally {
      setRestoreRoleId(null);
    }
  }

  function openEditTool(tool: ToolGroup) {
    setEditingTool(tool);
    setEditTool({
      tool_name: tool.tool_name,
      roles: tool.allRoles ? [] : tool.roles,
      owner: tool.owner_slack_id && tool.owner_name
        ? { id: tool.owner_slack_id, name: tool.owner_name, email: tool.owner_email }
        : null,
    });
  }

  function openAddTool(role: HireRole) {
    setAddToolRole(role);
    setNewTool({ tool_name: '', owner: null });
    setGlobalError('');
    setAddToolOpen(true);
  }

  async function updateTool() {
    if (!editingTool || !editTool.tool_name.trim() || !editTool.owner) return;
    const normalizedNextName = normalizeToolName(editTool.tool_name);
    if (tools.some((tool) => (
      !editingTool.tools.some((groupTool) => groupTool.id === tool.id)
      && normalizeToolName(tool.tool_name) === normalizedNextName
    ))) {
      setGlobalError(`${editTool.tool_name.trim()} is already configured. Tool names must be unique.`);
      return;
    }

    setEditToolSaving(true);
    try {
      const selectedRoles: Array<HireRole | null> = editTool.roles.length > 0 ? editTool.roles : [null];
      const desiredScopeKeys = new Set(selectedRoles.map(scopeKey));
      const existingByScope = new Map<string, OrgTool>();

      for (const tool of editingTool.tools) {
        const key = scopeKey(tool.role);
        if (!existingByScope.has(key)) existingByScope.set(key, tool);
      }

      const primaryRole = selectedRoles[0] ?? null;
      const primaryTool = existingByScope.get(scopeKey(primaryRole)) ?? editingTool.primaryTool;
      const handledToolIds = new Set<string>([primaryTool.id]);
      const responses: Response[] = [];
      const deleteRequests = editingTool.tools
        .filter((tool) => tool.id !== primaryTool.id && (
          !desiredScopeKeys.has(scopeKey(tool.role)) || existingByScope.get(scopeKey(tool.role))?.id !== tool.id
        ))
        .map((tool) => fetch(`/api/onboarding/org-tools?id=${tool.id}`, { method: 'DELETE' }));

      if (primaryRole === null) {
        responses.push(...await Promise.all(deleteRequests));
      }

      responses.push(await fetch('/api/onboarding/org-tools', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: primaryTool.id,
          tool_name: editTool.tool_name,
          role: primaryRole,
          owner_name: editTool.owner?.name ?? null,
          owner_email: editTool.owner?.email ?? null,
          owner_slack_id: editTool.owner?.id ?? null,
        }),
      }));

      if (primaryRole !== null) {
        responses.push(...await Promise.all(deleteRequests));
      }

      const createOrPatchRequests = selectedRoles
        .filter((role) => scopeKey(role) !== scopeKey(primaryRole))
        .map((role) => {
          const existingTool = existingByScope.get(scopeKey(role));
          if (existingTool && !handledToolIds.has(existingTool.id)) {
            handledToolIds.add(existingTool.id);
            return fetch('/api/onboarding/org-tools', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                id: existingTool.id,
                tool_name: editTool.tool_name,
                role,
                owner_name: editTool.owner?.name ?? null,
                owner_email: editTool.owner?.email ?? null,
                owner_slack_id: editTool.owner?.id ?? null,
              }),
            });
          }

          return fetch('/api/onboarding/org-tools', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              tool_name: editTool.tool_name,
              role,
              owner_name: editTool.owner?.name ?? null,
              owner_email: editTool.owner?.email ?? null,
              owner_slack_id: editTool.owner?.id ?? null,
            }),
          });
        });

      responses.push(...await Promise.all(createOrPatchRequests));
      const failingUpdateResponse = responses.find((response) => !response.ok);
      if (failingUpdateResponse) {
        const data = (await failingUpdateResponse.json()) as { error?: string };
        if (data.error === 'Organization not found') throw new Error('org_not_found');
        throw new Error('update_tool');
      }

      setEditingTool(null);
      await loadTools();
      toast.success('Tool saved');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'org_not_found') {
        toast.error('Organization not found', { description: 'Your account setup isn\'t complete. Finish setting up your organization to manage tools.' });
      } else {
        toast.error('Something went wrong saving your changes. Please try again.');
      }
    } finally {
      setEditToolSaving(false);
    }
  }

  return {
    tools,
    roleProfiles,
    toolGroups: groupOrgTools(tools),
    activeRoles: activeRoleProfiles(roleProfiles),
    archivedRoles: roleProfiles
      .filter((profile) => profile.status === 'archived')
      .sort((a, b) => (a.display_order - b.display_order) || a.role.localeCompare(b.role)),
    toolsLoading,
    rolesLoading,
    addRoleOpen,
    setAddRoleOpen,
    addRoleSaving,
    newRole,
    setNewRole,
    editingRole,
    setEditingRole,
    editRoleForm,
    setEditRoleForm,
    editRoleSaving,
    archivingRole,
    setArchivingRole,
    archiveRoleSaving,
    restoreRoleId,
    addToolOpen,
    setAddToolOpen,
    addToolSaving,
    addToolRole,
    newTool,
    setNewTool,
    editingTool,
    setEditingTool,
    editTool,
    setEditTool,
    editToolSaving,
    deletingTool,
    setDeletingTool,
    deleteToolSaving,
    activeToolRoles,
    configuredToolNames: groupOrgTools(tools).map((group) => group.tool_name),
    editUnavailableToolNames: groupOrgTools(tools).map((group) => group.tool_name).filter((toolName) => normalizeToolName(toolName) !== editingTool?.key),
    newToolAlreadyConfigured: Boolean(newTool.tool_name.trim())
      && groupOrgTools(tools).some((tool) => normalizeToolName(tool.tool_name) === normalizeToolName(newTool.tool_name)),
    editToolNameConflict: Boolean(editTool.tool_name.trim())
      && groupOrgTools(tools)
        .map((group) => group.tool_name)
        .filter((toolName) => normalizeToolName(toolName) !== editingTool?.key)
        .some((toolName) => normalizeToolName(toolName) === normalizeToolName(editTool.tool_name)),
    addTool,
    confirmDeleteTool,
    addRole,
    openEditRole,
    saveRole,
    archiveRole,
    restoreRole,
    openEditTool,
    openAddTool,
    closeAddTool,
    updateTool,
  };
}
