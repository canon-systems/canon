'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconBuilding,
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconMail,
  IconPencil,
  IconPlug,
  IconPlus,
  IconShieldCheck,
  IconTool,
  IconTrash,
  IconUserPlus,
  IconUser,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { getIntegrationsCached, clearIntegrationsCache } from '@/lib/client/integrationsCache';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/components/ui/utils';
import { ToolLogo } from '@/components/ToolLogo';
import { ToolNameCombobox } from '@/components/tool-name-combobox';
import { SlackUserPicker, type SlackUser } from '@/components/SlackUserPicker';
import { activeRoleProfiles, normalizeRoleName, roleAbbreviation, roleColor, roleIconColor } from '@/lib/onboarding/roles';
import type { OrgTool, HireRole, RoleProfile } from '@/types/onboarding';
import { userFullName } from '@/lib/userDisplay';

interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type WorkspaceRole = 'owner' | 'admin' | 'member';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  role: WorkspaceRole;
}

interface WorkspaceMember {
  id: string;
  user_id: string;
  role: WorkspaceRole;
  email: string | null;
  name: string | null;
  is_current_user: boolean;
  created_at: string;
}

interface WorkspaceInvitation {
  id: string;
  email: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  token: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
}

interface WorkspaceJoinRequest {
  id: string;
  requester_id: string;
  requester_email: string;
  requester_name: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reviewed_at: string | null;
  created_at: string;
}

interface SettingsPageClientProps {
  user: SupabaseUser | null;
}

const settingSections = [
  { section: 'Account', items: [{ id: 'profile', label: 'Profile', icon: IconUser }, { id: 'org', label: 'Organization', icon: IconBuilding }] },
  { section: 'Connections', items: [{ id: 'integrations', label: 'Integrations', icon: IconPlug }] },
  { section: 'Readiness', items: [{ id: 'roles', label: 'Roles', icon: IconUsers }, { id: 'tools', label: 'Tools', icon: IconTool }] },
];

const SETTINGS_TABS = ['profile', 'org', 'integrations', 'roles', 'tools', 'apikeys', 'delete'] as const;
type SettingsTab = typeof SETTINGS_TABS[number];
type ToolFilter = 'all' | 'all_roles' | 'unowned' | HireRole;
type OrgSection = 'overview' | 'members' | 'requests' | 'invitations';

interface ToolGroup {
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

function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
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

function groupOrgTools(tools: OrgTool[]): ToolGroup[] {
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

function groupHasOwner(group: ToolGroup) {
  return Boolean(group.owner_name && group.owner_slack_id);
}

function toggleRoleSelection(currentRoles: HireRole[], role: HireRole) {
  if (currentRoles.includes(role)) return currentRoles.filter((selectedRole) => selectedRole !== role);
  return [...currentRoles, role];
}

function selectedRolesLabel(roles: HireRole[]) {
  if (roles.length === 0) return 'All roles';
  if (roles.length === 1) return roles[0];
  return roles.map((role) => roleAbbreviation(role)).join(', ');
}

function RoleMultiSelect({
  value,
  onChange,
  roles,
}: {
  value: HireRole[];
  onChange: (roles: HireRole[]) => void;
  roles: HireRole[];
}) {
  const allRolesSelected = value.length === 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-[7px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-[10px] py-[6px] type-field text-[var(--text-primary)] transition-colors duration-[120ms] hover:border-[var(--border-secondary)] focus:outline-none focus:border-[var(--canon-purple)] focus:ring-2 focus:ring-[var(--canon-purple)]/25"
        >
          <span className="truncate">{selectedRolesLabel(value)}</span>
          <IconChevronDown size={14} className="flex-shrink-0 text-[var(--text-secondary)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1">
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={allRolesSelected}
          className={cn(
            'flex w-full items-center justify-between rounded-md px-3 py-[7px] text-left type-field transition-colors duration-[120ms]',
            allRolesSelected
              ? 'bg-[var(--green-bg)] text-[var(--green-text)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
          )}
        >
          <span>All roles</span>
          {allRolesSelected && <IconCheck size={14} />}
        </button>

        <div className="my-1 h-px bg-[var(--border-tertiary)]" />

        {roles.map((role, index) => {
          const selected = value.includes(role);
          return (
            <button
              key={role}
              type="button"
              onClick={() => onChange(toggleRoleSelection(value, role))}
              aria-pressed={selected}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-[7px] text-left type-field transition-colors duration-[120ms]',
                selected
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <span>{role}</span>
              {selected && <IconCheck size={14} style={{ color: roleColor(role, index) }} />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function SettingsPageClient({ user: initialUser }: SettingsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeSetting, setActiveSetting] = useState<SettingsTab>('profile');
  const [user] = useState<SupabaseUser | null>(initialUser);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] = useState<{ connectionId: string; provider: string } | null>(null);
  const [gongModalOpen, setGongModalOpen] = useState(false);
  const [gongAccessKey, setGongAccessKey] = useState('');
  const [gongAccessKeySecret, setGongAccessKeySecret] = useState('');
  const [gongApiBaseUrl, setGongApiBaseUrl] = useState('https://api.gong.io');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceInvitations, setWorkspaceInvitations] = useState<WorkspaceInvitation[]>([]);
  const [workspaceJoinRequests, setWorkspaceJoinRequests] = useState<WorkspaceJoinRequest[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [activeOrgSection, setActiveOrgSection] = useState<OrgSection>('overview');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<WorkspaceRole, 'owner'>>('member');
  const [inviteSaving, setInviteSaving] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState('');
  const [reviewingJoinRequestId, setReviewingJoinRequestId] = useState<string | null>(null);

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
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all');
  const [newTool, setNewTool] = useState({ tool_name: '', roles: [] as HireRole[], owner: null as SlackUser | null });
  const [editingTool, setEditingTool] = useState<ToolGroup | null>(null);
  const [editTool, setEditTool] = useState({ tool_name: '', roles: [] as HireRole[], owner: null as SlackUser | null });
  const [editToolSaving, setEditToolSaving] = useState(false);
  const [deletingTool, setDeletingTool] = useState<ToolGroup | null>(null);
  const [deleteToolSaving, setDeleteToolSaving] = useState(false);

  const loadConnections = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const data = await getIntegrationsCached(force);
      const mappedConnections: Connection[] = (data.connections || []).map((conn) => ({
        id: conn.id || conn.connection_id || '',
        provider: conn.provider || '',
        connection_id: conn.connection_id || conn.id || '',
        status: conn.status || 'inactive',
        metadata: conn.metadata || {},
        created_at: (conn.created_at as string) || new Date().toISOString(),
        updated_at: (conn.updated_at as string) || new Date().toISOString(),
      }));
      setConnections(mappedConnections);
    } catch {
      setError('Unable to load your integrations. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const activeToolRoles = activeRoleProfiles(roleProfiles).map((profile) => profile.role);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    try {
      const [workspaceRes, membersRes, invitationsRes, joinRequestsRes] = await Promise.all([
        fetch('/api/workspace'),
        fetch('/api/workspace/members'),
        fetch('/api/workspace/invitations'),
        fetch('/api/workspace/join-requests'),
      ]);

      const workspaceData = (await workspaceRes.json().catch(() => ({}))) as { workspace?: Workspace };
      const membersData = (await membersRes.json().catch(() => ({}))) as { members?: WorkspaceMember[] };
      const invitationsData = (await invitationsRes.json().catch(() => ({}))) as { invitations?: WorkspaceInvitation[] };
      const joinRequestsData = (await joinRequestsRes.json().catch(() => ({}))) as { requests?: WorkspaceJoinRequest[] };

      if (!workspaceRes.ok) throw new Error('workspace_load');

      setWorkspace(workspaceData.workspace ?? null);
      setWorkspaceMembers(membersRes.ok ? membersData.members ?? [] : []);
      setWorkspaceInvitations(invitationsRes.ok ? invitationsData.invitations ?? [] : []);
      setWorkspaceJoinRequests(joinRequestsRes.ok ? joinRequestsData.requests ?? [] : []);
    } catch {
      toast.error('Unable to load workspace settings.');
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  async function createInvitation() {
    if (!inviteEmail.trim()) return;
    setInviteSaving(true);
    setLastInviteUrl('');
    try {
      const res = await fetch('/api/workspace/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = (await res.json().catch(() => ({}))) as { invite_url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'invite_create');
      setInviteEmail('');
      setLastInviteUrl(data.invite_url ?? '');
      await loadWorkspace();
      toast.success('Invitation created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create invitation.');
    } finally {
      setInviteSaving(false);
    }
  }

  async function updateMemberRole(member: WorkspaceMember, role: Exclude<WorkspaceRole, 'owner'>) {
    try {
      const res = await fetch('/api/workspace/members', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ member_id: member.id, role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'member_update');
      await loadWorkspace();
      toast.success('Member updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update member.');
    }
  }

  async function removeMember(member: WorkspaceMember) {
    try {
      const res = await fetch(`/api/workspace/members?member_id=${encodeURIComponent(member.id)}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'member_remove');
      setWorkspaceMembers((prev) => prev.filter((entry) => entry.id !== member.id));
      toast.success('Member removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove member.');
    }
  }

  async function revokeInvitation(invitation: WorkspaceInvitation) {
    try {
      const res = await fetch(`/api/workspace/invitations?id=${encodeURIComponent(invitation.id)}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'invite_revoke');
      await loadWorkspace();
      toast.success('Invitation revoked');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke invitation.');
    }
  }

  async function reviewJoinRequest(joinRequest: WorkspaceJoinRequest, status: 'approved' | 'denied') {
    setReviewingJoinRequestId(joinRequest.id);
    try {
      const res = await fetch('/api/workspace/join-requests', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request_id: joinRequest.id, status, role: 'member' }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'join_request_review');
      await loadWorkspace();
      toast.success(status === 'approved' ? 'Member added' : 'Request denied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to review request.');
    } finally {
      setReviewingJoinRequestId(null);
    }
  }

  async function addTool() {
    if (!newTool.tool_name.trim() || !newTool.owner) return;
    if (tools.some((tool) => normalizeToolName(tool.tool_name) === normalizeToolName(newTool.tool_name))) {
      setError(`${newTool.tool_name.trim()} is already configured. Edit the existing tool to change its roles.`);
      return;
    }

    setAddToolSaving(true);
    try {
      const rolesToCreate: Array<HireRole | null> = newTool.roles.length > 0 ? newTool.roles : [null];
      const responses = await Promise.all(rolesToCreate.map((role) => fetch('/api/onboarding/org-tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tool_name: newTool.tool_name,
          role,
          owner_name: newTool.owner?.name ?? null,
          owner_email: newTool.owner?.email ?? null,
          owner_slack_id: newTool.owner?.id ?? null,
        }),
      })));
      const failingResponse = responses.find((res) => !res.ok);
      if (failingResponse) {
        const data = (await failingResponse.json()) as { error?: string };
        if (data.error === 'Organization not found') throw new Error('org_not_found');
        throw new Error('add_tool');
      }
      setAddToolOpen(false);
      setNewTool({ tool_name: '', roles: [], owner: null });
      await loadTools();
      toast.success('Tool added');
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

  async function updateTool() {
    if (!editingTool || !editTool.tool_name.trim() || !editTool.owner) return;
    const normalizedNextName = normalizeToolName(editTool.tool_name);
    if (tools.some((tool) => (
      !editingTool.tools.some((groupTool) => groupTool.id === tool.id)
      && normalizeToolName(tool.tool_name) === normalizedNextName
    ))) {
      setError(`${editTool.tool_name.trim()} is already configured. Tool names must be unique.`);
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

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');

    if (successParam === 'true') {
      const provider = searchParams.get('provider') || 'service';
      setSuccess(`Successfully connected to ${provider}!`);
      router.replace(`/settings?tab=integrations`);
      setActiveSetting('integrations');
      return;
    }

    if (errorParam) {
      setError('Something went wrong connecting your integration. Please try again.');
      router.replace(`/settings?tab=integrations`);
      setActiveSetting('integrations');
      return;
    }

    if (isSettingsTab(tabParam)) {
      setActiveSetting(tabParam);
      return;
    }

    setActiveSetting('profile');
  }, [searchParams, router]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (activeSetting === 'tools' || activeSetting === 'roles') loadTools();
  }, [activeSetting, loadTools]);

  useEffect(() => {
    if (activeSetting === 'org') loadWorkspace();
  }, [activeSetting, loadWorkspace]);

  async function connectSlack() {
    setConnecting(true);
    try {
      window.location.href = '/api/oauth/slack/start';
    } catch {
      toast.error('Unable to connect Slack right now. Please try again.');
      setConnecting(false);
    }
  }

  async function connectGong() {
    setConnecting(true);
    try {
      const response = await fetch('/api/integrations/gong/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accessKey: gongAccessKey,
          accessKeySecret: gongAccessKeySecret,
          apiBaseUrl: gongApiBaseUrl,
        }),
      });

      if (!response.ok) throw new Error('gong_connect');

      toast.success('Gong connected successfully');
      setGongModalOpen(false);
      setGongAccessKey('');
      setGongAccessKeySecret('');
      setGongApiBaseUrl('https://api.gong.io');
      clearIntegrationsCache();
      await loadConnections(true);
    } catch {
      toast.error('Unable to connect Gong. Please check your credentials and try again.');
    } finally {
      setConnecting(false);
    }
  }

  function openDisconnectModal(connectionId: string, provider: string) {
    setConnectionToDisconnect({ connectionId, provider });
    setDisconnectModalOpen(true);
  }

  function closeDisconnectModal() {
    setDisconnectModalOpen(false);
    setConnectionToDisconnect(null);
  }

  async function disconnect(connectionId: string, provider: string) {
    try {
      const response = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId, provider })
      });

      if (!response.ok) throw new Error('disconnect');

      toast.success(`Disconnected from ${providerLabel(provider)}`);
      clearIntegrationsCache();
      await loadConnections(true);
    } catch {
      toast.error('Something went wrong disconnecting. Please try again.');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function setActiveSettingAndUpdateUrl(value: string) {
    if (!isSettingsTab(value)) return;
    setActiveSetting(value);
    router.push(`/settings?tab=${value}`, { scroll: false });
  }

  const slackConnection = connections.find(c => c.provider === 'slack' && c.status === 'active');
  const gongConnection = connections.find(c => c.provider === 'gong' && c.status === 'active');
  const displayName = userFullName(user);

  function providerLabel(provider: string) {
    if (provider === 'gong') return 'Gong';
    if (provider === 'slack') return 'Slack';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function disconnectDescription(provider: string) {
    if (provider === 'gong') {
      return 'Canon will stop syncing Gong calls and remove Gong knowledge sources.';
    }
    if (provider === 'slack') {
      return 'Canon will no longer be able to send DMs or sync Slack channel knowledge.';
    }
    return 'Canon will remove connected knowledge sources for this integration.';
  }

  const integrations = [
    {
      id: 'slack',
      provider: 'slack' as const,
      name: 'Slack',
      description: 'Send hire-path DMs and sync channel knowledge.',
      iconBg: 'var(--slack-bg)',
      iconColor: 'var(--slack-text)',
      connected: !!slackConnection,
      workspace: slackConnection ? `Connected ${formatDate(slackConnection.created_at)}` : '',
      action: slackConnection ? () => openDisconnectModal(slackConnection.connection_id, 'slack') : connectSlack,
    },
    {
      id: 'gong',
      provider: 'gong' as const,
      name: 'Gong',
      description: 'Sync customer call transcripts as readiness knowledge.',
      iconBg: 'var(--gong-bg)',
      iconColor: 'var(--gong-text)',
      connected: !!gongConnection,
      workspace: gongConnection ? `Connected ${formatDate(gongConnection.created_at)}` : '',
      action: gongConnection ? () => openDisconnectModal(gongConnection.connection_id, 'gong') : () => setGongModalOpen(true),
    },
  ];

  function renderProfile() {
    return (
      <div className="max-w-2xl">
        <Card className="mb-4 flex items-center gap-[14px] px-[18px] py-4">
          <Avatar name={displayName} size="lg" />
          <div>
            <div className="type-card-title" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
            <div className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-secondary)' }}>{user?.email || 'Not Available'}</div>
            <div className="type-caption mt-[2px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{user?.id || 'N/A'}</div>
          </div>
        </Card>

        {[
          { label: 'Display Name', value: displayName, hint: 'Display name is finalized during onboarding.' },
          { label: 'Email', value: user?.email || '', hint: 'Email is managed by your authentication provider.' },
        ].map((field) => (
          <div key={field.label} className="mb-[14px]">
            <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
              {field.label}
            </label>
            <Input
              value={field.value}
              readOnly
            />
            <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>{field.hint}</p>
          </div>
        ))}
      </div>
    );
  }

  function renderIntegrations() {
    return (
      <div className="max-w-3xl">
        {success && (
          <Alert variant="success" className="mb-4 type-body-strong">
            {success}
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-4 type-body-strong">
            {error}
          </Alert>
        )}

        {integrations.map((int) => {
          return (
            <Card key={int.id} className="mb-[10px] flex items-center gap-[14px] px-4 py-[14px]">
              <div className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: int.iconBg, color: int.iconColor }}>
                <IntegrationLogos provider={int.provider} size={22} color={int.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="type-section-title" style={{ color: 'var(--text-primary)' }}>{int.name}</div>
                <div className="type-body mt-[2px]" style={{ color: 'var(--text-secondary)' }}>{int.description}</div>
                <div className="flex items-center gap-[5px] mt-1">
                  <div className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: int.connected ? 'var(--green)' : 'var(--border-secondary)' }} />
                  <span className="type-caption" style={{ color: int.connected ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
                    {int.connected ? `Active · ${int.workspace}` : 'Not Connected'}
                  </span>
                </div>
              </div>
              {int.connected ? (
                <Button variant="destructive" onClick={int.action}>Disconnect</Button>
              ) : (
                <Button variant="secondary" onClick={int.action} disabled={connecting}>
                  {connecting ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlug size={13} />}
                  Connect
                </Button>
              )}
            </Card>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
            <IconLoader2 size={14} className="animate-spin" /> Loading Integration Status...
          </div>
        )}
      </div>
    );
  }

  function renderRoles() {
    const activeRoles = activeRoleProfiles(roleProfiles);
    const archivedRoles = roleProfiles
      .filter((profile) => profile.status === 'archived')
      .sort((a, b) => (a.display_order - b.display_order) || a.role.localeCompare(b.role));

    return (
      <div className="max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="type-section-title" style={{ color: 'var(--text-primary)' }}>
              Role Catalog
            </div>
            <p className="type-body mt-[3px]" style={{ color: 'var(--text-secondary)' }}>
              Configure which roles Canon should include in readiness milestones, field briefs, hire paths, and tool access scoping.
            </p>
          </div>
          <Button onClick={() => setAddRoleOpen(true)} className="flex-shrink-0">
            <IconPlus size={13} />
            Add Role
          </Button>
        </div>

        {rolesLoading ? (
          <div className="flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
            <IconLoader2 size={14} className="animate-spin" /> Loading Roles...
          </div>
        ) : activeRoles.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Active Roles</div>
            <div className="type-body mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Add a role before generating readiness milestones or field briefs.
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeRoles.map((profile, index) => (
              <Card key={profile.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div
                      className="mt-[1px] flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px] type-caption font-medium"
                      style={{ backgroundColor: roleIconColor(profile.role, index), color: 'var(--text-on-accent)' }}
                    >
                      {roleAbbreviation(profile.role)}
                    </div>
                    <div className="min-w-0">
                      <div className="type-card-title text-[var(--text-primary)]">{profile.role}</div>
                      <div className="type-caption mt-[2px] text-[var(--text-tertiary)]">Active role</div>
                      <p className="type-body mt-2 line-clamp-2 text-[var(--text-secondary)]">
                        {profile.job_description || 'No job description saved yet.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openEditRole(profile)}>
                      <IconPencil size={13} /> Edit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setArchivingRole(profile)}>
                      <IconTrash size={13} /> Archive
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {archivedRoles.length > 0 && (
              <div className="pt-4">
                <div className="type-kicker mb-2 text-[var(--text-tertiary)]">Archived Roles</div>
                <div className="space-y-2">
                  {archivedRoles.map((profile) => (
                    <Card key={profile.id} className="flex items-center justify-between gap-3 px-4 py-3 opacity-80">
                      <div className="min-w-0">
                        <div className="type-card-title truncate text-[var(--text-primary)]">{profile.role}</div>
                        <div className="type-caption text-[var(--text-tertiary)]">Excluded from readiness milestones and field briefs</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => void restoreRole(profile)} disabled={restoreRoleId === profile.id}>
                        {restoreRoleId === profile.id ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
                        Restore
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderTools() {
    const toolGroups = groupOrgTools(tools);
    const roleSpecificCount = toolGroups.filter((group) => !group.allRoles).length;
    const unownedCount = toolGroups.filter((group) => !groupHasOwner(group)).length;
    const filterOptions: Array<{ id: ToolFilter; label: string; count: number }> = [
      { id: 'all', label: 'All tools', count: toolGroups.length },
      { id: 'all_roles', label: 'All roles', count: toolGroups.filter((group) => group.allRoles).length },
      ...activeToolRoles.map((role) => ({
        id: role,
        label: roleAbbreviation(role),
        count: toolGroups.filter((group) => group.allRoles || group.roles.includes(role)).length,
      })),
      { id: 'unowned', label: 'Needs owner', count: unownedCount },
    ];
    const filteredTools = toolGroups.filter((tool) => {
      if (toolFilter === 'all') return true;
      if (toolFilter === 'all_roles') return tool.allRoles;
      if (toolFilter === 'unowned') return !groupHasOwner(tool);
      if (activeToolRoles.includes(toolFilter)) return tool.allRoles || tool.roles.includes(toolFilter);
      return true;
    });

    return (
      <div className="max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="type-section-title" style={{ color: 'var(--text-primary)' }}>
              Tool Access Registry
            </div>
            <p className="type-body mt-[3px]" style={{ color: 'var(--text-secondary)' }}>
              Configure the tools each hire path needs, the role scope, and the owner who can grant access.
            </p>
          </div>
          <Button onClick={() => setAddToolOpen(true)} className="flex-shrink-0">
            <IconPlus size={13} />
            Add Tool
          </Button>
        </div>

        {toolsLoading ? (
          <div className="flex items-center gap-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
            <IconLoader2 size={14} className="animate-spin" /> Loading Tools...
          </div>
        ) : toolGroups.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Tools Configured</div>
            <div className="type-body mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Add the tools each role needs access to and assign an owner who can grant it. Canon will prompt the hire and notify owners automatically.
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {filterOptions.map((option) => {
                const selected = toolFilter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setToolFilter(option.id)}
                    className={cn(
                      'inline-flex h-7 items-center gap-2 rounded-full border px-3 type-control-sm transition-colors duration-[120ms]',
                      selected ? 'filter-chip-selected' : 'filter-chip'
                    )}
                    aria-pressed={selected}
                  >
                    <span>{option.label}</span>
                    <span
                      className="rounded-full px-[6px] py-[1px] type-caption"
                      style={{
                        backgroundColor: selected ? 'var(--canon-purple-light)' : 'var(--bg-primary)',
                        color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      }}
                    >
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div
                    className="grid grid-cols-[minmax(220px,1.35fr)_minmax(170px,0.75fr)_minmax(230px,1fr)_78px] items-center border-b px-4 py-[9px] type-kicker"
                    style={{ borderColor: 'var(--border-tertiary)', color: 'var(--text-tertiary)' }}
                  >
                    <div>Tool</div>
                    <div>Scope</div>
                    <div>Owner</div>
                    <div className="text-right">Actions</div>
                  </div>

                  {filteredTools.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>
                        No Matching Tools
                      </div>
                      <div className="type-body mt-2" style={{ color: 'var(--text-tertiary)' }}>
                        Try a different role filter or add another tool.
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-y-auto" style={{ maxHeight: 'min(560px, calc(100vh - 320px))' }}>
                      {filteredTools.map((tool) => {
                        const ownerLabel = tool.owner_name || 'Owner required';

                        return (
                          <div
                            key={tool.key}
                            className="grid min-h-[58px] grid-cols-[minmax(220px,1.35fr)_minmax(170px,0.75fr)_minmax(230px,1fr)_78px] items-center border-b px-4 py-[9px] transition-colors duration-[120ms] last:border-b-0 hover:bg-[var(--bg-secondary)]"
                            style={{ borderColor: 'var(--border-tertiary)' }}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <ToolLogo toolName={tool.tool_name} size={16} containerSize={32} borderRadius={8} />
                              <div className="min-w-0">
                                <div className="truncate type-card-title" style={{ color: 'var(--text-primary)' }}>
                                  {tool.tool_name}
                                </div>
                                <div className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
                                  {tool.allRoles ? 'Shared access requirement' : 'Role-specific access'}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {tool.allRoles ? (
                                <span
                                  className="inline-flex items-center rounded-full border px-2 py-[3px] type-caption font-medium"
                                  style={{
                                    backgroundColor: 'var(--green-bg)',
                                    borderColor: 'var(--green-border)',
                                    color: 'var(--green-text)',
                                  }}
                                >
                                  All roles
                                </span>
                              ) : (
                                tool.roles.map((role) => {
                                  const roleIndex = activeToolRoles.indexOf(role);
                                  const color = roleColor(role, roleIndex === -1 ? 0 : roleIndex);
                                  return (
                                    <span
                                      key={role}
                                      className="inline-flex items-center rounded-full border px-2 py-[3px] type-caption font-medium"
                                      style={{
                                        backgroundColor: 'var(--bg-secondary)',
                                        borderColor: 'var(--border-secondary)',
                                        color,
                                      }}
                                    >
                                      {roleAbbreviation(role)}
                                    </span>
                                  );
                                })
                              )}
                            </div>

                            <div className="min-w-0">
                              <div
                                className="truncate type-body-strong"
                                style={{ color: groupHasOwner(tool) ? 'var(--text-primary)' : 'var(--amber-text)' }}
                              >
                                {ownerLabel}
                              </div>
                            </div>

                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="border-transparent"
                                aria-label={`Edit ${tool.tool_name}`}
                                onClick={() => openEditTool(tool)}
                              >
                                <IconPencil size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="border-transparent hover:text-[var(--red-text)]"
                                aria-label={`Remove ${tool.tool_name}`}
                                onClick={() => setDeletingTool(tool)}
                              >
                                <IconX size={14} />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <div className="flex flex-wrap gap-3 type-caption" style={{ color: 'var(--text-tertiary)' }}>
              <span>{toolGroups.length} total</span>
              <span>{roleSpecificCount} role-specific</span>
              <span>{unownedCount} missing owner</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderOrg() {
    const canAdmin = workspace?.role === 'owner' || workspace?.role === 'admin';
    const activeInvitations = workspaceInvitations.filter((invitation) => !invitation.accepted_at && !invitation.revoked_at);
    const pendingJoinRequests = workspaceJoinRequests.filter((request) => request.status === 'pending');
    const orgSections: Array<{
      id: OrgSection;
      label: string;
      count?: number;
      icon: typeof IconBuilding;
    }> = [
        { id: 'overview', label: 'Overview', icon: IconBuilding },
        { id: 'members', label: 'Members', count: workspaceMembers.length, icon: IconUsers },
        { id: 'requests', label: 'Requests', count: pendingJoinRequests.length, icon: IconUserPlus },
        { id: 'invitations', label: 'Invites', count: activeInvitations.length, icon: IconMail },
      ];

    const summaryItems = [
      { label: 'Members', value: workspaceMembers.length, icon: IconUsers },
      { label: 'Pending Requests', value: pendingJoinRequests.length, icon: IconUserPlus },
      { label: 'Active Invites', value: activeInvitations.length, icon: IconMail },
      { label: 'Your Access', value: workspace?.role ?? 'member', icon: IconShieldCheck },
    ];

    return (
      <div className="max-w-6xl space-y-5">
        <section className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)]">
          <div className="border-b border-[var(--border-tertiary)] px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="type-section-title text-[var(--text-primary)]">Organization</div>
                <div className="type-body mt-[3px] text-[var(--text-secondary)]">
                  {workspaceLoading ? 'Loading workspace...' : workspace?.slug ?? 'Workspace Setup'}
                </div>
              </div>
              {workspace?.role && (
                <span className="w-fit rounded-[6px] border border-[var(--border-secondary)] px-2 py-1 type-caption capitalize text-[var(--text-secondary)]">
                  {workspace.role}
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {summaryItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-[7px] bg-[var(--bg-secondary)] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="type-caption text-[var(--text-tertiary)]">{item.label}</span>
                      <Icon size={14} className="text-[var(--text-tertiary)]" />
                    </div>
                    <div className="mt-2 truncate text-[20px] font-semibold capitalize leading-none text-[var(--text-primary)]">
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <nav aria-label="Organization sections" className="flex gap-1 overflow-x-auto px-3 py-2">
            {orgSections.map((section) => {
              const Icon = section.icon;
              const selected = activeOrgSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveOrgSection(section.id)}
                  className={cn(
                    'flex h-9 flex-shrink-0 items-center gap-2 rounded-[7px] px-3 type-field transition-colors duration-[120ms] focus:outline-none focus:ring-2 focus:ring-[var(--canon-purple)]/25',
                    selected
                      ? 'bg-[var(--canon-purple-light)] text-[var(--canon-purple)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <Icon size={14} />
                  <span>{section.label}</span>
                  {section.count !== undefined && (
                    <span className={cn(
                      'rounded-full px-1.5 py-[1px] text-[11px] leading-4',
                      selected ? 'bg-[var(--auth-illustration-card-strong)] text-[var(--canon-purple)]' : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'
                    )}>
                      {section.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </section>

        {activeOrgSection === 'overview' && (
          <Card className="px-5 py-5">
            <div className="mb-4">
              <div className="type-section-title text-[var(--text-primary)]">Workspace Profile</div>
              <p className="type-body mt-[3px] max-w-2xl text-[var(--text-secondary)]">
                Workspace identity is finalized during onboarding and stays consistent for teammates, invitations, and access requests.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[7px] border border-[var(--border-tertiary)] px-3 py-3">
                <div className="type-caption text-[var(--text-tertiary)]">Workspace Name</div>
                <div className="mt-1 type-body-strong text-[var(--text-primary)]">{workspace?.name ?? 'Not available'}</div>
              </div>
              <div className="rounded-[7px] border border-[var(--border-tertiary)] px-3 py-3">
                <div className="type-caption text-[var(--text-tertiary)]">Workspace Slug</div>
                <div className="mt-1 break-all font-mono text-[12px] text-[var(--text-primary)]">{workspace?.slug ?? 'Not available'}</div>
              </div>
              <div className="rounded-[7px] border border-[var(--border-tertiary)] px-3 py-3">
                <div className="type-caption text-[var(--text-tertiary)]">Admin Access</div>
                <div className="mt-1 type-body text-[var(--text-primary)]">
                  {canAdmin ? 'You can manage members, requests, and invites.' : 'Ask an owner or admin to make organization changes.'}
                </div>
              </div>
            </div>
          </Card>
        )}

        {activeOrgSection === 'members' && (
          <Card className="px-5 py-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="type-section-title text-[var(--text-primary)]">Members</div>
                <p className="type-body mt-[3px] text-[var(--text-secondary)]">Manage role-level access for everyone in this workspace.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setActiveOrgSection('invitations')} disabled={!canAdmin}>
                <IconPlus size={13} /> Invite Member
              </Button>
            </div>

            <div className="space-y-2">
              {workspaceMembers.length === 0 ? (
                <div className="rounded-[7px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-3 type-body text-[var(--text-secondary)]">
                  No workspace members found.
                </div>
              ) : workspaceMembers.map((member) => (
                <div key={member.id} className="flex flex-col gap-3 rounded-[7px] border border-[var(--border-tertiary)] px-3 py-3 md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={member.name ?? member.email ?? member.user_id} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate type-body-strong text-[var(--text-primary)]">
                        {member.name ?? member.email ?? member.user_id}
                      </div>
                      <div className="type-caption text-[var(--text-tertiary)]">
                        {member.email ?? member.user_id}
                      </div>
                      <div className="type-caption capitalize text-[var(--text-tertiary)]">
                        {member.role}{member.is_current_user ? ' - You' : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {member.role === 'owner' ? (
                      <Button size="sm" variant="secondary" disabled>Owner</Button>
                    ) : (
                      <>
                        <select
                          value={member.role}
                          disabled={!canAdmin}
                          aria-label={`Role for ${member.name ?? member.email ?? member.user_id}`}
                          onChange={(event) => void updateMemberRole(member, event.target.value as Exclude<WorkspaceRole, 'owner'>)}
                          className="h-8 rounded-[6px] border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-2 type-field text-[var(--text-primary)]"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                        <Button size="sm" variant="secondary" onClick={() => void removeMember(member)} disabled={!canAdmin || member.is_current_user}>
                          <IconTrash size={13} /> Remove
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeOrgSection === 'requests' && (
          <Card className="px-5 py-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="type-section-title text-[var(--text-primary)]">Access Requests</div>
                <p className="type-body mt-[3px] text-[var(--text-secondary)]">Approve or deny people who asked to join without an invite link.</p>
              </div>
              <span className="w-fit rounded-[6px] border border-[var(--border-secondary)] px-2 py-1 type-caption text-[var(--text-secondary)]">
                {pendingJoinRequests.length} pending
              </span>
            </div>

            {pendingJoinRequests.length === 0 ? (
              <div className="rounded-[7px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-3 type-body text-[var(--text-secondary)]">
                No pending access requests.
              </div>
            ) : (
              <div className="space-y-2">
                {pendingJoinRequests.map((joinRequest) => (
                  <div key={joinRequest.id} className="flex flex-col gap-3 rounded-[7px] border border-[var(--border-tertiary)] px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="truncate type-body-strong text-[var(--text-primary)]">{joinRequest.requester_name ?? joinRequest.requester_email}</div>
                      {joinRequest.requester_name && (
                        <div className="type-caption text-[var(--text-tertiary)]">{joinRequest.requester_email}</div>
                      )}
                      <div className="type-caption text-[var(--text-tertiary)]">Requested {formatDate(joinRequest.created_at)}</div>
                      {joinRequest.message && (
                        <div className="type-body mt-2 text-[var(--text-secondary)]">{joinRequest.message}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => void reviewJoinRequest(joinRequest, 'approved')}
                        disabled={!canAdmin || reviewingJoinRequestId === joinRequest.id}
                      >
                        {reviewingJoinRequestId === joinRequest.id ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void reviewJoinRequest(joinRequest, 'denied')}
                        disabled={!canAdmin || reviewingJoinRequestId === joinRequest.id}
                      >
                        <IconX size={13} /> Deny
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeOrgSection === 'invitations' && (
          <Card className="px-5 py-5">
            <div className="mb-4">
              <div className="type-section-title text-[var(--text-primary)]">Invitations</div>
              <p className="type-body mt-[3px] text-[var(--text-secondary)]">Create invite links for teammates and revoke pending invites when plans change.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_130px_auto] md:items-end">
              <div>
                <label className="mb-[5px] block type-body font-medium text-[var(--text-secondary)]">Email</label>
                <Input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="teammate@company.com"
                  disabled={!canAdmin}
                />
              </div>
              <div>
                <label className="mb-[5px] block type-body font-medium text-[var(--text-secondary)]">Role</label>
                <select
                  value={inviteRole}
                  disabled={!canAdmin}
                  aria-label="Invitation role"
                  onChange={(event) => setInviteRole(event.target.value as Exclude<WorkspaceRole, 'owner'>)}
                  className="h-9 w-full rounded-[7px] border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-2 type-field text-[var(--text-primary)]"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button onClick={() => void createInvitation()} disabled={!canAdmin || inviteSaving || !inviteEmail.trim()}>
                {inviteSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlus size={13} />}
                Invite
              </Button>
            </div>

            {lastInviteUrl && (
              <div className="mt-3 rounded-[7px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-2">
                <div className="type-caption text-[var(--text-tertiary)]">Invite Link</div>
                <div className="mt-1 break-all font-mono text-[12px] text-[var(--text-primary)]">{lastInviteUrl}</div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {activeInvitations.length === 0 ? (
                <div className="rounded-[7px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-3 type-body text-[var(--text-secondary)]">
                  No active invitations.
                </div>
              ) : activeInvitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-2 rounded-[7px] border border-[var(--border-tertiary)] px-3 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="type-body-strong text-[var(--text-primary)]">{invitation.email}</div>
                    <div className="type-caption capitalize text-[var(--text-tertiary)]">{invitation.role} - Expires {formatDate(invitation.expires_at)}</div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void revokeInvitation(invitation)} disabled={!canAdmin}>
                    <IconX size={13} /> Revoke
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  function renderPlaceholder(label: string) {
    return (
      <Card className="max-w-2xl px-5 py-8 text-center">
        <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>{label}</div>
        <div className="type-body mt-2" style={{ color: 'var(--text-tertiary)' }}>This settings section is ready for configuration content.</div>
      </Card>
    );
  }

  const configuredToolNames = groupOrgTools(tools).map((group) => group.tool_name);
  const editUnavailableToolNames = configuredToolNames.filter((toolName) => normalizeToolName(toolName) !== editingTool?.key);
  const newToolAlreadyConfigured = Boolean(newTool.tool_name.trim())
    && configuredToolNames.some((toolName) => normalizeToolName(toolName) === normalizeToolName(newTool.tool_name));
  const editToolNameConflict = Boolean(editTool.tool_name.trim())
    && editUnavailableToolNames.some((toolName) => normalizeToolName(toolName) === normalizeToolName(editTool.tool_name));

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="app-page-header border-b">
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>Manage the roles, sources, and integrations behind team readiness</p>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="split-sidebar w-[180px] flex-shrink-0 py-5 overflow-y-auto border-r">
            {settingSections.map(({ section, items }) => (
              <div key={section}>
                <div className="type-kicker px-4 pt-[10px] pb-1" style={{ color: 'var(--text-tertiary)' }}>
                  {section}
                </div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const danger = 'danger' in item && item.danger;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSettingAndUpdateUrl(item.id)}
                      className={cn(
                        'flex w-[calc(100%-16px)] items-center gap-2 px-4 py-[7px] text-left type-nav mx-2 rounded-[5px] cursor-pointer border border-transparent transition-colors duration-[120ms]',
                        activeSetting === item.id && 'nav-item-selected'
                      )}
                      style={{
                        color: danger ? 'var(--red-text)' : activeSetting === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: activeSetting === item.id ? 500 : 400,
                      }}
                    >
                      <Icon size={14} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="surface-page flex-1 overflow-y-auto px-7 py-6">
            {activeSetting === 'profile' && renderProfile()}
            {activeSetting === 'integrations' && renderIntegrations()}
            {activeSetting === 'roles' && renderRoles()}
            {activeSetting === 'tools' && renderTools()}
            {activeSetting === 'delete' && renderPlaceholder('Delete Account')}
            {activeSetting === 'org' && renderOrg()}
            {activeSetting === 'apikeys' && renderPlaceholder('API Keys')}
          </div>
        </div>
      </div>

      <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
        <DialogContent className="max-w-2xl border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Add Role</DialogTitle>
            <DialogDescription>Add a role Canon should include in readiness milestones, field briefs, hire paths, and tool scoping.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                Role Name <span style={{ color: 'var(--red-text)' }}>*</span>
              </label>
              <Input
                value={newRole.role}
                onChange={(e) => setNewRole((p) => ({ ...p, role: e.target.value }))}
                placeholder="Customer Success Engineer"
                maxLength={120}
              />
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                Job Description
              </label>
              <Textarea
                value={newRole.job_description}
                onChange={(e) => setNewRole((p) => ({ ...p, job_description: e.target.value }))}
                placeholder="Paste responsibilities, tools, customer interactions, and success criteria."
                maxLength={12000}
                className="textarea-ui min-h-[220px] w-full border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddRoleOpen(false)} disabled={addRoleSaving}>Cancel</Button>
            <Button onClick={() => void addRole()} disabled={addRoleSaving || !normalizeRoleName(newRole.role)}>
              {addRoleSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlus size={13} />}
              Add Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingRole !== null} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="max-w-2xl border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>{editingRole?.role ?? 'Edit Role'}</DialogTitle>
            <DialogDescription>Update the role context Canon should use when targeting readiness milestones and signals.</DialogDescription>
          </DialogHeader>
          <div>
            <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
              Job Description
            </label>
            <Textarea
              value={editRoleForm.job_description}
              onChange={(e) => setEditRoleForm({ job_description: e.target.value })}
              placeholder="Paste responsibilities, tools, customer interactions, and success criteria."
              maxLength={12000}
              className="textarea-ui min-h-[280px] w-full border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
            />
            <p className="type-caption mt-1 text-[var(--text-tertiary)]">{editRoleForm.job_description.length}/12000</p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditingRole(null)} disabled={editRoleSaving}>Cancel</Button>
            <Button onClick={() => void saveRole()} disabled={editRoleSaving}>
              {editRoleSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPencil size={13} />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archivingRole !== null} onOpenChange={(open) => !open && setArchivingRole(null)}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Archive Role</DialogTitle>
            <DialogDescription>
              Archive <strong>{archivingRole?.role}</strong>? Canon will stop generating readiness milestones and field briefs for this role.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-2 type-body text-[var(--text-secondary)]">
            Active readiness milestones and draft proposals for this role will be archived. Existing hire paths and historical evidence stay intact.
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setArchivingRole(null)} disabled={archiveRoleSaving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void archiveRole()} disabled={archiveRoleSaving}>
              {archiveRoleSaving ? <IconLoader2 size={13} className="animate-spin" /> : null}
              Archive Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingTool !== null} onOpenChange={(open) => !open && setDeletingTool(null)}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Remove Tool</DialogTitle>
            <DialogDescription>
              Remove <strong>{deletingTool?.tool_name}</strong> from your tool list? This won&apos;t affect access requests already created for existing hires.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeletingTool(null)} disabled={deleteToolSaving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteTool()} disabled={deleteToolSaving}>
              {deleteToolSaving ? <IconLoader2 size={13} className="animate-spin" /> : null}
              Remove Tool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingTool !== null} onOpenChange={(open) => !open && setEditingTool(null)}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Edit Tool</DialogTitle>
            <DialogDescription>Update the tool details and required Slack owner.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                Tool Name <span style={{ color: 'var(--red-text)' }}>*</span>
              </label>
              <ToolNameCombobox
                value={editTool.tool_name}
                onChange={(toolName) => setEditTool((p) => ({ ...p, tool_name: toolName }))}
                unavailableToolNames={editUnavailableToolNames}
              />
              {editToolNameConflict && (
                <p className="type-caption mt-1" style={{ color: 'var(--amber-text)' }}>This tool is already configured.</p>
              )}
            </div>
            <div>
              <div className="mb-[5px] flex items-center justify-between gap-3">
                <label className="block type-body font-medium" style={{ color: 'var(--text-secondary)' }}>Roles</label>
                <span className="type-caption" style={{ color: 'var(--text-tertiary)' }}>{selectedRolesLabel(editTool.roles)}</span>
              </div>
              <RoleMultiSelect
                value={editTool.roles}
                onChange={(roles) => setEditTool((p) => ({ ...p, roles }))}
                roles={activeToolRoles}
              />
              <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>Select multiple roles, or use All roles for a shared requirement.</p>
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                Owner <span style={{ color: 'var(--red-text)' }}>*</span>
              </label>
              <SlackUserPicker
                value={editTool.owner}
                onChange={(user) => setEditTool((p) => ({ ...p, owner: user }))}
                placeholder="Search workspace members..."
              />
              <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>Canon will DM this Slack owner when a hire needs access.</p>
            </div>
            {editTool.owner && (
              <div>
                <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>Owner Slack ID</label>
                <Input value={editTool.owner.id} readOnly />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditingTool(null)} disabled={editToolSaving}>Cancel</Button>
            <Button onClick={() => void updateTool()} disabled={editToolSaving || !editTool.tool_name.trim() || !editTool.owner || editToolNameConflict}>
              {editToolSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPencil size={13} />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addToolOpen} onOpenChange={setAddToolOpen}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Add Tool</DialogTitle>
            <DialogDescription>
              Define a tool hire paths need access to and the required Slack owner for access requests.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                Tool Name <span style={{ color: 'var(--red-text)' }}>*</span>
              </label>
              <ToolNameCombobox
                value={newTool.tool_name}
                onChange={(toolName) => setNewTool((p) => ({ ...p, tool_name: toolName }))}
                unavailableToolNames={configuredToolNames}
              />
              {newToolAlreadyConfigured && (
                <p className="type-caption mt-1" style={{ color: 'var(--amber-text)' }}>This tool is already configured.</p>
              )}
            </div>
            <div>
              <div className="mb-[5px] flex items-center justify-between gap-3">
                <label className="block type-body font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Roles
                </label>
                <span className="type-caption" style={{ color: 'var(--text-tertiary)' }}>{selectedRolesLabel(newTool.roles)}</span>
              </div>
              <RoleMultiSelect
                value={newTool.roles}
                onChange={(roles) => setNewTool((p) => ({ ...p, roles }))}
                roles={activeToolRoles}
              />
              <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>Select multiple roles, or use All roles for a shared requirement.</p>
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                Owner <span style={{ color: 'var(--red-text)' }}>*</span>
              </label>
              <SlackUserPicker
                value={newTool.owner}
                onChange={(user) => setNewTool((p) => ({ ...p, owner: user }))}
                placeholder="Search workspace members..."
              />
              <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>Canon will DM this Slack owner when a hire needs access.</p>
            </div>
            {newTool.owner && (
              <div>
                <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                  Owner Slack ID
                </label>
                <Input value={newTool.owner.id} readOnly />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddToolOpen(false)} disabled={addToolSaving}>
              Cancel
            </Button>
            <Button onClick={() => void addTool()} disabled={addToolSaving || !newTool.tool_name.trim() || !newTool.owner || newToolAlreadyConfigured}>
              {addToolSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconTool size={13} />}
              Add Tool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disconnectModalOpen && connectionToDisconnect !== null} onOpenChange={(open) => !open && closeDisconnectModal()}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Disconnect {connectionToDisconnect ? providerLabel(connectionToDisconnect.provider) : 'Integration'}</DialogTitle>
            <DialogDescription>
              {connectionToDisconnect ? disconnectDescription(connectionToDisconnect.provider) : 'Canon will remove this integration.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={closeDisconnectModal}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (connectionToDisconnect) {
                  await disconnect(connectionToDisconnect.connectionId, connectionToDisconnect.provider);
                  closeDisconnectModal();
                }
              }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gongModalOpen} onOpenChange={setGongModalOpen}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Connect Gong</DialogTitle>
            <DialogDescription>
              Add a Gong access key and secret so Canon can sync recent call transcripts.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }} htmlFor="gong-access-key">
                Access Key
              </label>
              <Input
                id="gong-access-key"
                value={gongAccessKey}
                onChange={(event) => setGongAccessKey(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }} htmlFor="gong-access-key-secret">
                Access Key Secret
              </label>
              <Input
                id="gong-access-key-secret"
                type="password"
                value={gongAccessKeySecret}
                onChange={(event) => setGongAccessKeySecret(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }} htmlFor="gong-api-base-url">
                API Base URL
              </label>
              <Input
                id="gong-api-base-url"
                value={gongApiBaseUrl}
                onChange={(event) => setGongApiBaseUrl(event.target.value)}
                autoComplete="off"
              />
              <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>Use the default unless your Gong workspace has a regional API host.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setGongModalOpen(false)} disabled={connecting}>
              Cancel
            </Button>
            <Button onClick={connectGong} disabled={connecting || !gongAccessKey.trim() || !gongAccessKeySecret.trim()}>
              {connecting ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlug size={13} />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
