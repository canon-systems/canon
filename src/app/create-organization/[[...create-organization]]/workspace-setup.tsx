'use client';

import { useMemo, useState } from 'react';
import { CreateOrganization, useOrganizationList } from '@clerk/nextjs';
import {
  ArrowRight as IconArrowRight,
  Building2 as IconBuilding,
  CheckCircle2 as IconCheckCircle,
  ExternalLink as IconExternalLink,
  Loader2 as IconLoader,
  Send as IconSend,
  UserPlus as IconUserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { AUTH_ROUTES } from '@/lib/clerk-routes';
import {
  configuredDemoWorkspaceUrl,
  summarizeWorkspaceMemberships,
  type WorkspaceMembershipLike,
  type WorkspaceMembershipSummary,
} from '@/lib/workspace-access';

function workspaceMembershipData(data: unknown): WorkspaceMembershipLike[] {
  return Array.isArray(data) ? data as WorkspaceMembershipLike[] : [];
}

type WorkspacePublicOrganizationLike = {
  id: string;
  name: string;
  slug: string | null;
};

type WorkspaceInvitationLike = {
  id: string;
  status: string;
  publicOrganizationData: WorkspacePublicOrganizationLike;
  accept: () => Promise<unknown>;
};

type WorkspaceSuggestionLike = {
  id: string;
  status: string;
  publicOrganizationData: WorkspacePublicOrganizationLike;
  accept: () => Promise<unknown>;
};

function workspaceInvitationData(data: unknown): WorkspaceInvitationLike[] {
  return Array.isArray(data) ? data as WorkspaceInvitationLike[] : [];
}

function workspaceSuggestionData(data: unknown): WorkspaceSuggestionLike[] {
  return Array.isArray(data) ? data as WorkspaceSuggestionLike[] : [];
}

function WorkspaceSetupShell({ children }: { children: React.ReactNode }) {
  const demoWorkspaceUrl = configuredDemoWorkspaceUrl();
  const isExternalDemoWorkspace = demoWorkspaceUrl.startsWith('http://') || demoWorkspaceUrl.startsWith('https://');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--auth-page-bg)] px-4 py-10">
      <section className="grid w-full max-w-[920px] gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)] lg:items-start">
        <div className="surface-panel rounded-[8px] border px-5 py-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--canon-purple-border)] bg-[var(--canon-purple-soft)] text-[var(--canon-purple)]">
              <IconBuilding size={18} />
            </div>
            <div className="min-w-0">
              <p className="type-kicker">Workspace setup</p>
              <h1 className="type-auth-title">Set up Canon</h1>
            </div>
          </div>
          <p className="type-card-body">
            Canon keeps each account tied to one working workspace for now. Join your team workspace, create a new one, and keep the demo workspace as a reference for structure and best practices.
          </p>
          {demoWorkspaceUrl && (
            <Button asChild variant="outline" className="mt-5 w-full justify-between" radius="md">
              <Link
                href={demoWorkspaceUrl}
                target={isExternalDemoWorkspace ? '_blank' : undefined}
                rel={isExternalDemoWorkspace ? 'noreferrer' : undefined}
              >
                Open demo workspace
                <IconExternalLink size={13} />
              </Link>
            </Button>
          )}
        </div>

        <div className="flex justify-center lg:justify-end">
          {children}
        </div>
      </section>
    </main>
  );
}

function LoadingPanel() {
  return (
    <div className="surface-panel flex w-full max-w-[420px] items-center gap-3 rounded-[8px] border px-5 py-5 text-[var(--text-secondary)]">
      <IconLoader size={16} className="animate-spin" />
      <span className="type-body-strong">Checking workspace access...</span>
    </div>
  );
}

function WorkspaceContinuePanel({ workspace }: { workspace: WorkspaceMembershipSummary }) {
  const router = useRouter();
  const { setActive } = useOrganizationList();
  const [submitting, setSubmitting] = useState(false);

  async function continueToWorkspace() {
    if (!setActive || submitting) return;

    setSubmitting(true);
    try {
      await setActive({ organization: workspace.clerkOrgId });
      router.replace(AUTH_ROUTES.afterSignIn);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="surface-panel w-full max-w-[420px] rounded-[8px] border px-5 py-5">
      <p className="type-kicker mb-2">Current workspace</p>
      <h2 className="type-card-title">{workspace.name}</h2>
      <p className="type-card-body mt-3">
        Canon currently supports one active workspace per account. Continue with this workspace to finish setup.
      </p>
      <Button className="mt-5 w-full justify-between" radius="md" onClick={continueToWorkspace} disabled={submitting || !setActive}>
        {submitting ? 'Opening workspace...' : 'Continue to workspace'}
        <IconArrowRight size={13} />
      </Button>
    </div>
  );
}

function WorkspaceJoinPanel({
  invitations,
  suggestions,
  onCreateWorkspace,
}: {
  invitations: WorkspaceInvitationLike[];
  suggestions: WorkspaceSuggestionLike[];
  onCreateWorkspace: () => void;
}) {
  const router = useRouter();
  const { setActive } = useOrganizationList();
  const [actionId, setActionId] = useState<string | null>(null);
  const [requestedSuggestionId, setRequestedSuggestionId] = useState<string | null>(null);

  async function acceptInvitation(invitation: WorkspaceInvitationLike) {
    if (!setActive || actionId) return;

    setActionId(invitation.id);
    try {
      await invitation.accept();
      await setActive({ organization: invitation.publicOrganizationData.id });
      router.replace(AUTH_ROUTES.afterSignIn);
      router.refresh();
    } finally {
      setActionId(null);
    }
  }

  async function requestAccess(suggestion: WorkspaceSuggestionLike) {
    if (actionId || requestedSuggestionId === suggestion.id) return;

    setActionId(suggestion.id);
    try {
      await suggestion.accept();
      setRequestedSuggestionId(suggestion.id);
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="surface-panel w-full max-w-[460px] rounded-[8px] border px-5 py-5">
      <p className="type-kicker mb-2">Join workspace</p>
      <h2 className="type-card-title">Use your team workspace</h2>
      <p className="type-card-body mt-3">
        Canon found workspaces connected to your account or email domain. Join one here before creating a new workspace.
      </p>

      <div className="mt-5 space-y-3">
        {invitations.map((invitation) => (
          <div key={invitation.id} className="rounded-[8px] border border-[var(--border-tertiary)] px-3 py-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--canon-purple-light)] text-[var(--canon-purple)]">
                <IconUserPlus size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="type-panel-title truncate">{invitation.publicOrganizationData.name}</div>
                <p className="type-caption mt-1">You have an invitation to this workspace.</p>
              </div>
            </div>
            <Button
              className="mt-3 w-full justify-between"
              radius="md"
              onClick={() => acceptInvitation(invitation)}
              disabled={Boolean(actionId) || !setActive}
            >
              {actionId === invitation.id ? 'Joining...' : 'Join invited workspace'}
              <IconArrowRight size={13} />
            </Button>
          </div>
        ))}

        {suggestions.map((suggestion) => {
          const requestSent = requestedSuggestionId === suggestion.id;

          return (
            <div key={suggestion.id} className="rounded-[8px] border border-[var(--border-tertiary)] px-3 py-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                  {requestSent ? <IconCheckCircle size={15} /> : <IconSend size={15} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="type-panel-title truncate">{suggestion.publicOrganizationData.name}</div>
                  <p className="type-caption mt-1">
                    {requestSent ? 'Your access request was sent.' : 'Request access based on your verified email domain.'}
                  </p>
                </div>
              </div>
              <Button
                className="mt-3 w-full justify-between"
                variant={requestSent ? 'secondary' : 'default'}
                radius="md"
                onClick={() => requestAccess(suggestion)}
                disabled={Boolean(actionId) || requestSent}
              >
                {actionId === suggestion.id ? 'Sending request...' : requestSent ? 'Request sent' : 'Request access'}
                {requestSent ? <IconCheckCircle size={13} /> : <IconArrowRight size={13} />}
              </Button>
            </div>
          );
        })}
      </div>

      <Button className="mt-5 w-full justify-between" variant="outline" radius="md" onClick={onCreateWorkspace}>
        Create a new workspace
        <IconArrowRight size={13} />
      </Button>
    </div>
  );
}

function WorkspaceCreatePanel({
  canReturnToJoin,
  onReturnToJoin,
}: {
  canReturnToJoin?: boolean;
  onReturnToJoin?: () => void;
}) {
  return (
    <div className="w-full max-w-[420px] space-y-3">
      {canReturnToJoin && (
        <Button variant="ghost" radius="md" onClick={onReturnToJoin}>
          Back to join options
        </Button>
      )}
      <CreateOrganization
        afterCreateOrganizationUrl={AUTH_ROUTES.afterSignIn}
        skipInvitationScreen
        appearance={{
          elements: {
            rootBox: 'mx-auto w-full',
            cardBox: 'w-full shadow-none border border-[var(--border-tertiary)]',
          },
        }}
      />
    </div>
  );
}

export function WorkspaceSetup() {
  const { isLoaded, userMemberships, userInvitations, userSuggestions } = useOrganizationList({
    userMemberships: {
      pageSize: 100,
      keepPreviousData: true,
    },
    userInvitations: {
      pageSize: 20,
      keepPreviousData: true,
    },
    userSuggestions: {
      pageSize: 20,
      keepPreviousData: true,
    },
  });
  const [setupMode, setSetupMode] = useState<'join' | 'create'>('join');
  const memberships = workspaceMembershipData(userMemberships.data);
  const { realWorkspaces } = useMemo(
    () => summarizeWorkspaceMemberships(memberships),
    [memberships]
  );
  const invitations = workspaceInvitationData(userInvitations.data)
    .filter((invitation) => invitation.status === 'pending');
  const suggestions = workspaceSuggestionData(userSuggestions.data)
    .filter((suggestion) => suggestion.status === 'pending');
  const existingWorkspace = realWorkspaces[0] ?? null;
  const hasJoinOptions = invitations.length > 0 || suggestions.length > 0;
  const loading = !isLoaded || Boolean(userMemberships.isLoading || userInvitations.isLoading || userSuggestions.isLoading);
  const errored = Boolean(userMemberships.isError || userInvitations.isError || userSuggestions.isError);

  if (loading) {
    return (
      <WorkspaceSetupShell>
        <LoadingPanel />
      </WorkspaceSetupShell>
    );
  }

  if (errored) {
    return (
      <WorkspaceSetupShell>
        <div className="surface-panel w-full max-w-[420px] rounded-[8px] border px-5 py-5">
          <p className="type-kicker mb-2">Workspace unavailable</p>
          <h2 className="type-card-title">Refresh to continue</h2>
          <p className="type-card-body mt-3">
            Canon could not confirm your workspace access. Refresh the page or sign in again.
          </p>
        </div>
      </WorkspaceSetupShell>
    );
  }

  return (
    <WorkspaceSetupShell>
      {existingWorkspace ? (
        <WorkspaceContinuePanel workspace={existingWorkspace} />
      ) : hasJoinOptions && setupMode === 'join' ? (
        <WorkspaceJoinPanel
          invitations={invitations}
          suggestions={suggestions}
          onCreateWorkspace={() => setSetupMode('create')}
        />
      ) : (
        <WorkspaceCreatePanel
          canReturnToJoin={hasJoinOptions}
          onReturnToJoin={() => setSetupMode('join')}
        />
      )}
    </WorkspaceSetupShell>
  );
}
