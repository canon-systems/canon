import {
  Building2 as IconBuilding,
  Check as IconCheck,
  Loader2 as IconLoader2,
  Mail as IconMail,
  Plus as IconPlus,
  ShieldCheck as IconShieldCheck,
  Trash2 as IconTrash,
  UserPlus as IconUserPlus,
  Users as IconUsers,
  X as IconX,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';
import type {
  OrgSection,
  WorkspaceRole,
  useWorkspaceSettings,
} from '../hooks/useWorkspaceSettings';

type WorkspaceSettings = ReturnType<typeof useWorkspaceSettings>;

type OrganizationSettingsProps = {
  workspaceSettings: WorkspaceSettings;
};

function formatDate(dateString: string | null) {
  if (!dateString) return 'Unknown';

  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function OrganizationSettings({ workspaceSettings }: OrganizationSettingsProps) {
  const {
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
  } = workspaceSettings;
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
