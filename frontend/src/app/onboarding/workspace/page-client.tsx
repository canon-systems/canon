'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, Loader2, Search, Users } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type JoinRequest = {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  requester_email: string;
  requester_name: string | null;
  message: string | null;
  created_at: string;
  organizations?: {
    name: string;
    slug: string;
  } | null;
};

type WorkspaceOnboardingClientProps = {
  userEmail: string;
  initialFirstName: string;
  initialLastName: string;
};

export function WorkspaceOnboardingClient({ userEmail, initialFirstName, initialLastName }: WorkspaceOnboardingClientProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceLookup, setWorkspaceLookup] = useState('');
  const [message, setMessage] = useState('');
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRequests() {
      setLoadingRequests(true);
      try {
        const res = await fetch('/api/workspace/join-requests');
        const data = (await res.json().catch(() => ({}))) as { requests?: JoinRequest[] };
        if (active) setPendingRequests(data.requests?.filter((request) => request.status === 'pending') ?? []);
      } finally {
        if (active) setLoadingRequests(false);
      }
    }

    void loadRequests();
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile() {
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (trimmedFirstName.length < 1 || trimmedLastName.length < 1) {
      throw new Error('Enter your first and last name.');
    }

    const res = await fetch('/api/onboarding/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Unable to create your profile.');
  }

  async function createWorkspace() {
    const name = workspaceName.trim();
    if (name.length < 2) {
      setError('Enter a workspace name.');
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await saveProfile();
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Unable to create workspace.');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create workspace.');
    } finally {
      setSaving(false);
    }
  }

  async function requestAccess() {
    const workspace = workspaceLookup.trim();
    if (workspace.length < 2) {
      setError('Enter the workspace name or slug.');
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await saveProfile();
      const res = await fetch('/api/workspace/join-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { request?: JoinRequest; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Unable to request access.');
      setPendingRequests((current) => [data.request, ...current].filter(Boolean) as JoinRequest[]);
      setWorkspaceLookup('');
      setMessage('');
      setInfo('Request sent. A workspace admin can approve it from Organization settings.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request access.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="max-w-2xl">
          <div className="type-kicker text-[var(--canon-purple)]">Workspace setup</div>
          <h1 className="mt-2 text-[30px] font-semibold leading-[1.14] tracking-normal text-[var(--text-primary)] sm:text-[36px]">
            Choose how you want to use Canon
          </h1>
          <p className="type-body mt-3 leading-[1.6] text-[var(--text-secondary)]">
            {userEmail ? `${userEmail} needs a workspace before creating hire paths or connecting knowledge sources.` : 'Your account needs a workspace before creating hire paths or connecting knowledge sources.'}
          </p>
          <p className="type-body mt-2 leading-[1.6] text-[var(--text-secondary)]">
            Double-check your name and workspace details before continuing. These values are finalized when you create your profile.
          </p>
        </div>

        {(error || info) && (
          <Alert variant={error ? 'destructive' : 'default'}>
            <AlertDescription>{error ?? info}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`rounded-[8px] border px-4 py-4 text-left transition ${mode === 'create' ? 'border-[var(--canon-purple)] bg-[var(--bg-primary)] shadow-sm' : 'border-[var(--border-tertiary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)]'}`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-[var(--canon-purple-light)] text-[var(--canon-purple)]">
                <Building2 size={17} />
              </span>
              <span>
                <span className="block type-body-strong text-[var(--text-primary)]">Create workspace</span>
                <span className="block type-caption text-[var(--text-tertiary)]">Start a new team space and become owner.</span>
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('join')}
            className={`rounded-[8px] border px-4 py-4 text-left transition ${mode === 'join' ? 'border-[var(--canon-purple)] bg-[var(--bg-primary)] shadow-sm' : 'border-[var(--border-tertiary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)]'}`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-[var(--green-bg)] text-[var(--green)]">
                <Users size={17} />
              </span>
              <span>
                <span className="block type-body-strong text-[var(--text-primary)]">Join workspace</span>
                <span className="block type-caption text-[var(--text-tertiary)]">Ask an admin to approve your account.</span>
              </span>
            </div>
          </button>
        </div>

        <Card>
          <CardContent className="space-y-5 px-5 py-5">
            <div>
              <div className="type-section-title text-[var(--text-primary)]">Your profile</div>
              <p className="type-body mt-[3px] text-[var(--text-secondary)]">Canon uses your name in member lists, access requests, and shared workspace views. This name cannot be changed later.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="first-name">First name</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Jane"
                  disabled={saving}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <Label htmlFor="last-name">Last name</Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Sellers"
                  disabled={saving}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="h-px bg-[var(--border-tertiary)]" />

            {mode === 'create' ? (
              <>
                <div>
                  <div className="type-section-title text-[var(--text-primary)]">Create a new workspace</div>
                  <p className="type-body mt-[3px] text-[var(--text-secondary)]">This workspace will be the shared home for roles, sources, hire paths, and readiness settings. The workspace name is final.</p>
                </div>
                <div>
                  <Label htmlFor="workspace-name">Workspace name</Label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="Acme Technical GTM"
                    disabled={saving}
                  />
                </div>
                <Button onClick={() => void createWorkspace()} disabled={saving || firstName.trim().length < 1 || lastName.trim().length < 1 || workspaceName.trim().length < 2}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Create Workspace
                </Button>
              </>
            ) : (
              <>
                <div>
                  <div className="type-section-title text-[var(--text-primary)]">Request workspace access</div>
                  <p className="type-body mt-[3px] text-[var(--text-secondary)]">Use the workspace slug when you have it. Admins will see your request in Organization settings after your profile is finalized.</p>
                </div>
                <div>
                  <Label htmlFor="workspace-lookup">Workspace name or slug</Label>
                  <Input
                    id="workspace-lookup"
                    value={workspaceLookup}
                    onChange={(event) => setWorkspaceLookup(event.target.value)}
                    placeholder="acme-technical-gtm"
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label htmlFor="join-message">Message</Label>
                  <Textarea
                    id="join-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="I am joining the GTM enablement team."
                    disabled={saving}
                    rows={4}
                  />
                </div>
                <Button onClick={() => void requestAccess()} disabled={saving || firstName.trim().length < 1 || lastName.trim().length < 1 || workspaceLookup.trim().length < 2}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Request Access
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {(loadingRequests || pendingRequests.length > 0) && (
          <Card>
            <CardContent className="px-5 py-5">
              <div className="type-section-title text-[var(--text-primary)]">Pending requests</div>
              {loadingRequests ? (
                <div className="type-body mt-3 text-[var(--text-secondary)]">Loading requests...</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="rounded-[7px] border border-[var(--border-tertiary)] px-3 py-3">
                      <div className="type-body-strong text-[var(--text-primary)]">
                        {request.organizations?.name ?? 'Workspace request'}
                      </div>
                      <div className="type-caption text-[var(--text-tertiary)]">
                        Pending approval{request.organizations?.slug ? ` - ${request.organizations.slug}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
