'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { SlackUser } from '@/components/SlackUserPicker';
import { activeRoleProfiles } from '@/lib/onboarding/roles';
import type { HireRole, OrgTool, RoleProfile } from '@/types/onboarding';
import { groupOrgTools, normalizeToolName, scopeKey, type ToolGroup } from './readinessToolUtils';

type UseReadinessToolsParams = {
  tools: OrgTool[];
  setTools: Dispatch<SetStateAction<OrgTool[]>>;
  roleProfiles: RoleProfile[];
  reload: () => Promise<void>;
  setGlobalError: (message: string) => void;
};

function showOrganizationNotFoundToast() {
  toast.error('Organization not found', {
    description: 'Your account setup isn\'t complete. Finish setting up your organization to manage tools.',
  });
}

export function useReadinessTools({
  tools,
  setTools,
  roleProfiles,
  reload,
  setGlobalError,
}: UseReadinessToolsParams) {
  const [addToolOpen, setAddToolOpen] = useState(false);
  const [addToolSaving, setAddToolSaving] = useState(false);
  const [addToolRole, setAddToolRole] = useState<HireRole | null>(null);
  const [newTool, setNewTool] = useState({ tool_name: '', owner: null as SlackUser | null });
  const [editingTool, setEditingTool] = useState<ToolGroup | null>(null);
  const [editTool, setEditTool] = useState({ tool_name: '', roles: [] as HireRole[], owner: null as SlackUser | null });
  const [editToolSaving, setEditToolSaving] = useState(false);
  const [deletingTool, setDeletingTool] = useState<ToolGroup | null>(null);
  const [deleteToolSaving, setDeleteToolSaving] = useState(false);

  const toolGroups = useMemo(() => groupOrgTools(tools), [tools]);
  const activeToolRoles = useMemo(() => activeRoleProfiles(roleProfiles).map((profile) => profile.role), [roleProfiles]);
  const configuredToolNames = useMemo(() => toolGroups.map((group) => group.tool_name), [toolGroups]);
  const editUnavailableToolNames = useMemo(
    () => configuredToolNames.filter((toolName) => normalizeToolName(toolName) !== editingTool?.key),
    [configuredToolNames, editingTool?.key]
  );
  const newToolAlreadyConfigured = Boolean(newTool.tool_name.trim())
    && toolGroups.some((tool) => normalizeToolName(tool.tool_name) === normalizeToolName(newTool.tool_name));
  const editToolNameConflict = Boolean(editTool.tool_name.trim())
    && editUnavailableToolNames.some((toolName) => normalizeToolName(toolName) === normalizeToolName(editTool.tool_name));

  function closeAddTool() {
    setAddToolOpen(false);
    setAddToolRole(null);
    setNewTool({ tool_name: '', owner: null });
  }

  async function addTool() {
    if (!newTool.tool_name.trim() || !newTool.owner || !addToolRole) return;

    setAddToolSaving(true);
    try {
      const existingTool = toolGroups.find((tool) => normalizeToolName(tool.tool_name) === normalizeToolName(newTool.tool_name));
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
      await reload();
      toast.success(existingTool ? 'Tool assigned to role' : 'Tool added');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'org_not_found') {
        showOrganizationNotFoundToast();
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
        showOrganizationNotFoundToast();
      } else {
        toast.error('Something went wrong removing the tool. Please try again.');
      }
    } finally {
      setDeleteToolSaving(false);
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
      await reload();
      toast.success('Tool saved');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'org_not_found') {
        showOrganizationNotFoundToast();
      } else {
        toast.error('Something went wrong saving your changes. Please try again.');
      }
    } finally {
      setEditToolSaving(false);
    }
  }

  return {
    toolGroups,
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
    configuredToolNames,
    editUnavailableToolNames,
    newToolAlreadyConfigured,
    editToolNameConflict,
    addTool,
    confirmDeleteTool,
    openEditTool,
    openAddTool,
    closeAddTool,
    updateTool,
  };
}
