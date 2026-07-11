'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type OrgSection = 'overview' | 'members' | 'requests' | 'invitations';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  id: string;
  user_id: string;
  role: WorkspaceRole;
  email: string | null;
  name: string | null;
  is_current_user: boolean;
  created_at: string;
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  token: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface WorkspaceJoinRequest {
  id: string;
  requester_id: string;
  requester_email: string;
  requester_name: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reviewed_at: string | null;
  created_at: string;
}

export function useWorkspaceSettings(enabled: boolean) {
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

  useEffect(() => {
    if (enabled) void loadWorkspace();
  }, [enabled, loadWorkspace]);

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

  return {
    workspace,
    workspaceMembers,
    workspaceInvitations,
    workspaceJoinRequests,
    workspaceLoading,
    activeOrgSection,
    setActiveOrgSection,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    inviteSaving,
    lastInviteUrl,
    reviewingJoinRequestId,
    createInvitation,
    updateMemberRole,
    removeMember,
    revokeInvitation,
    reviewJoinRequest,
  };
}
