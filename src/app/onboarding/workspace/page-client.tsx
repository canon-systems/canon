'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Building2, Check, Clock3, Loader2, Search, ShieldCheck, Users } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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

  const profileReady = firstName.trim().length > 0 && lastName.trim().length > 0;
  const canCreate = profileReady && workspaceName.trim().length >= 2;
  const canJoin = profileReady && workspaceLookup.trim().length >= 2;

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--auth-page-bg)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(var(--auth-grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--auth-grid-line)_1px,transparent_1px)] bg-[length:72px_72px] opacity-25" />
      <div className="relative mx-auto grid min-h-[calc(100vh-48px)] w-full max-w-6xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-between rounded-[8px] border border-[var(--canon-purple-border)] bg-[var(--auth-illustration-bg)] p-5 shadow-[var(--shadow-md)] sm:p-7">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[var(--canon-purple)] text-[15px] font-semibold text-[var(--text-on-accent)]">C</div>
              <div>
                <div className="text-[15px] font-semibold leading-none">Canon</div>
                <div className="mt-1 type-caption">Workspace Setup</div>
              </div>
            </div>
            <h1 className="mt-10 max-w-xl text-[38px] font-semibold leading-[1.04] tracking-normal text-[var(--text-primary)] sm:text-[52px]">
              Choose the Workspace Path That Matches Your Team
            </h1>
            <p className="mt-5 max-w-lg text-[14px] leading-7 text-[var(--text-secondary)]">
              {userEmail ? `${userEmail} is signed in. Finish setup once, then Canon will route you into the right readiness workspace.` : 'Finish setup once, then Canon will route you into the right readiness workspace.'}
            </p>
          </div>

          <div className="mt-10 space-y-3">
            <div className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--auth-panel-bg-translucent)] p-4">
              <div className="flex items-center gap-2 type-body-strong">
                <ShieldCheck size={16} className="text-[var(--green-text)]" />
                Profile Names Are Finalized Here
              </div>
              <p className="mt-2 type-caption leading-5">They appear in member lists, access requests, and technical GTM readiness workflows.</p>
            </div>
            {(loadingRequests || pendingRequests.length > 0) && (
              <div className="rounded-[8px] border border-[var(--amber-border)] bg-[var(--amber-bg-subtle)] p-4">
                <div className="flex items-center gap-2 type-body-strong">
                  <Clock3 size={16} className="text-[var(--amber-text)]" />
                  Pending Workspace Requests
                </div>
                {loadingRequests ? (
                  <div className="mt-2 type-caption">Loading requests...</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {pendingRequests.map((request) => (
                      <div key={request.id} className="rounded-[7px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-3 py-2">
                        <div className="type-body-strong">{request.organizations?.name ?? 'Workspace Request'}</div>
                        <div className="type-caption">
                          Pending approval{request.organizations?.slug ? ` - ${request.organizations.slug}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--auth-panel-bg)] p-5 text-[var(--text-primary)] shadow-[var(--shadow-lg)] sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`rounded-[8px] border px-4 py-4 text-left transition ${mode === 'create' ? 'border-[var(--canon-purple)] bg-[var(--bg-primary)] shadow-sm' : 'border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)]'}`}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-[var(--canon-purple-light)] text-[var(--canon-purple)]">
                  <Building2 size={17} />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-[var(--text-primary)]">Create Workspace</span>
                  <span className="block text-[11px] leading-5 text-[var(--text-tertiary)]">Start a new team space as owner.</span>
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode('join')}
              className={`rounded-[8px] border px-4 py-4 text-left transition ${mode === 'join' ? 'border-[var(--canon-purple)] bg-[var(--bg-primary)] shadow-sm' : 'border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)]'}`}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-[var(--green-bg)] text-[var(--green)]">
                  <Users size={17} />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-[var(--text-primary)]">Join Workspace</span>
                  <span className="block text-[11px] leading-5 text-[var(--text-tertiary)]">Ask an admin to approve access.</span>
                </span>
              </span>
            </button>
          </div>

          {(error || info) && (
            <Alert variant={error ? 'destructive' : 'success'} className="mt-5 bg-[var(--bg-primary)]">
              {error ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              <AlertDescription>{error ?? info}</AlertDescription>
            </Alert>
          )}

          <form
            className="mt-6 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (mode === 'create') void createWorkspace();
              else void requestAccess();
            }}
          >
            <div>
              <h2 className="text-[22px] font-semibold leading-[1.12] tracking-normal text-[var(--text-primary)]">Finalize Your Profile</h2>
              <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">Use the name teammates should see in requests, readiness reviews, and workspace activity.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first-name" className="text-[var(--text-secondary)]">First Name</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Jane"
                  disabled={saving}
                  autoComplete="given-name"
                  className="h-11 border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name" className="text-[var(--text-secondary)]">Last Name</Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Sellers"
                  disabled={saving}
                  autoComplete="family-name"
                  className="h-11 border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                />
              </div>
            </div>

            <div className="h-px bg-[var(--border-tertiary)]" />

            {mode === 'create' ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[16px] font-semibold leading-tight text-[var(--text-primary)]">Create a New Workspace</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">This becomes the shared home for roles, sources, launch context, and readiness settings.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-name" className="text-[var(--text-secondary)]">Workspace Name</Label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="Acme Technical GTM"
                    disabled={saving}
                    className="h-11 border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                  />
                </div>
                <Button type="submit" className="h-11 rounded-[8px] bg-[var(--canon-purple)] text-[var(--text-on-accent)]" disabled={saving || !canCreate}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Create workspace
                  <ArrowRight size={14} />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[16px] font-semibold leading-tight text-[var(--text-primary)]">Request Workspace Access</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">Use the workspace slug when you have it. Admins will see this in Organization settings.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-lookup" className="text-[var(--text-secondary)]">Workspace Name or Slug</Label>
                  <Input
                    id="workspace-lookup"
                    value={workspaceLookup}
                    onChange={(event) => setWorkspaceLookup(event.target.value)}
                    placeholder="acme-technical-gtm"
                    disabled={saving}
                    className="h-11 border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-message" className="text-[var(--text-secondary)]">Message</Label>
                  <Textarea
                    id="join-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="I am joining the technical GTM readiness workspace."
                    disabled={saving}
                    rows={4}
                    className="border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                  />
                </div>
                <Button type="submit" className="h-11 rounded-[8px] bg-[var(--canon-purple)] text-[var(--text-on-accent)]" disabled={saving || !canJoin}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Request access
                  <ArrowRight size={14} />
                </Button>
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
