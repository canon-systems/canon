'use client';

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Calendar as IconCalendar,
  CheckCircle2 as IconCheckCircle,
  Loader2 as IconLoader,
  MessageSquare as IconMessage,
  ShieldCheck as IconShieldCheck,
  UserRound as IconUser,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlackUserPicker, type SlackUser } from '@/components/SlackUserPicker';
import {
  hasManagerCommunicationTarget,
  slackUserToManagerFields,
} from '@/lib/onboarding/manager-communication';
import { resolvedCommunicationEmail } from '@/lib/onboarding/communication-user';
import { activeRoleProfiles } from '@/lib/onboarding/roles';
import type { HireRole, RoleProfile } from '@/types/onboarding';

export type EditableNewHire = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: HireRole;
  start_date: string;
  slack_user_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_slack_user_id: string | null;
  manager_chat_provider: string | null;
  manager_chat_target_id: string | null;
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatSelectedDate(date: Date | undefined) {
  if (!date) return 'Select a Start Date';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function namePartsFromSlackName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function SelectedPersonPreview({
  label,
  name,
  detail,
  icon: Icon,
}: {
  label: string;
  name: string;
  detail: string;
  icon: typeof IconUser;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2 type-kicker text-[var(--text-tertiary)]">
        <Icon size={13} />
        {label}
      </div>
      <div className="truncate type-body-strong text-[var(--text-primary)]">{name}</div>
      <div className="mt-[2px] truncate type-caption text-[var(--text-tertiary)]">{detail}</div>
    </div>
  );
}

function SetupCheck({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 type-caption text-[var(--text-secondary)]">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
        style={{
          backgroundColor: complete ? 'var(--canon-purple-light)' : 'var(--bg-primary)',
          borderColor: complete ? 'var(--canon-purple-border)' : 'var(--border-tertiary)',
          color: complete ? 'var(--canon-purple)' : 'var(--text-tertiary)',
        }}
      >
        <IconCheckCircle size={12} />
      </span>
      <span className={complete ? 'text-[var(--text-primary)]' : undefined}>{label}</span>
    </div>
  );
}

function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof IconUser;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-[10px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)]">
      <legend className="ml-4 -translate-y-1/2 bg-[var(--bg-primary)] px-2">
        <span className="inline-flex items-center gap-2 type-body-strong text-[var(--text-primary)]">
          <Icon size={15} className="text-[var(--canon-purple)]" />
          {title}
        </span>
      </legend>
      <div className="-mt-2 space-y-4 px-4 pb-4">{children}</div>
    </fieldset>
  );
}

export function NewHireForm({
  initialHire,
  onCreated,
  onUpdated,
  onCancel,
}: {
  initialHire?: EditableNewHire;
  onCreated?: (hireId: string) => void;
  onUpdated?: (hire: EditableNewHire) => void;
  onCancel?: () => void;
}) {
  const editing = Boolean(initialHire);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<HireRole[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialHire ? fromDateInputValue(initialHire.start_date) : undefined
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hireSlackUser, setHireSlackUser] = useState<SlackUser | null>(
    initialHire?.slack_user_id
      ? {
        id: initialHire.slack_user_id,
        name: `${initialHire.first_name} ${initialHire.last_name}`,
        email: initialHire.email,
      }
      : null
  );
  const [managerSlackUser, setManagerSlackUser] = useState<SlackUser | null>(
    initialHire?.manager_slack_user_id
      ? {
        id: initialHire.manager_slack_user_id,
        name: initialHire.manager_name ?? initialHire.manager_slack_user_id,
        email: initialHire.manager_email ?? null,
      }
      : null
  );

  const [form, setForm] = useState({
    firstName: initialHire?.first_name ?? '',
    lastName: initialHire?.last_name ?? '',
    email: initialHire?.email ?? '',
    role: initialHire?.role ?? '' as HireRole | '',
    slack_user_id: initialHire?.slack_user_id ?? '',
    manager_name: initialHire?.manager_name ?? '',
    manager_email: initialHire?.manager_email ?? '',
    manager_slack_user_id: initialHire?.manager_slack_user_id ?? '',
    manager_chat_provider: initialHire?.manager_chat_provider ?? 'slack',
    manager_chat_target_id: initialHire?.manager_chat_target_id ?? initialHire?.manager_slack_user_id ?? '',
  });

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function selectHireSlackUser(user: SlackUser | null) {
    setHireSlackUser(user);
    const nameParts = namePartsFromSlackName(user?.name ?? '');
    setForm((prev) => ({
      ...prev,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: user?.email ?? '',
      slack_user_id: user?.id ?? '',
    }));
  }

  useEffect(() => {
    let cancelled = false;
    async function loadRoles() {
      try {
        const res = await fetch('/api/onboarding/role-profiles');
        const data = (await res.json()) as { profiles?: RoleProfile[] };
        const nextRoles = activeRoleProfiles(data.profiles ?? []).map((profile) => profile.role);
        if (initialHire?.role && !nextRoles.includes(initialHire.role)) nextRoles.push(initialHire.role);
        if (!cancelled) setRoles(nextRoles);
      } catch {
        if (!cancelled) setRoles(initialHire?.role ? [initialHire.role] : []);
      }
    }
    void loadRoles();
    return () => { cancelled = true; };
  }, [initialHire?.role]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const hireEmail = resolvedCommunicationEmail(hireSlackUser, form.email);
    const managerTargetReady = hasManagerCommunicationTarget({
      manager_chat_provider: form.manager_chat_provider,
      manager_chat_target_id: form.manager_chat_target_id,
      manager_email: form.manager_email,
      manager_slack_user_id: form.manager_slack_user_id,
    });
    if (!form.firstName || !form.lastName || !hireEmail || !form.role || !startDate || !form.slack_user_id || !form.manager_name || !managerTargetReady) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(
        editing ? `/api/onboarding/new-hires/${initialHire?.id}` : '/api/onboarding/new-hires',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            email: hireEmail,
            role: form.role,
            start_date: toDateInputValue(startDate),
            slack_user_id: form.slack_user_id,
            manager_name: form.manager_name.trim(),
            manager_email: form.manager_email.trim() || null,
            manager_slack_user_id: form.manager_slack_user_id || null,
            manager_chat_provider: form.manager_chat_provider,
            manager_chat_target_id: form.manager_chat_target_id || null,
          }),
        }
      );
      const data = (await res.json()) as { hire?: EditableNewHire; error?: string };
      if (!res.ok) {
        setError(data.error ?? (editing ? 'Failed to Update Hire Path' : 'Failed to Launch Hire Path'));
        return;
      }
      if (editing && data.hire) {
        onUpdated?.(data.hire);
        return;
      }
      if (data.hire?.id) onCreated?.(data.hire.id);
    } catch {
      setError('An Unexpected Error Occurred');
    } finally {
      setSubmitting(false);
    }
  }

  const hireEmail = resolvedCommunicationEmail(hireSlackUser, form.email);
  const profileComplete = Boolean(hireSlackUser && form.firstName.trim() && form.lastName.trim() && hireEmail);
  const scheduleComplete = Boolean(form.role && startDate);
  const communicationComplete = Boolean(
    form.slack_user_id
    && form.manager_name.trim()
    && hasManagerCommunicationTarget(form)
  );
  const canSubmit = profileComplete && scheduleComplete && communicationComplete && roles.length > 0 && !submitting;
  const enteredName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ');
  const hireDisplayName = hireSlackUser?.name || enteredName || 'Not selected';
  const hireDisplayDetail = hireEmail || 'Slack account needed';
  const managerDisplayName = managerSlackUser?.name || form.manager_name || 'Not selected';
  const managerDisplayDetail = managerSlackUser?.email || form.manager_email || 'Manager reviewer needed';
  const launchStatus = !hireSlackUser
    ? 'Select the new hire in Slack to launch.'
    : !hireEmail
      ? 'Slack did not return an email for this account.'
      : canSubmit
        ? 'Ready to launch.'
        : 'Complete the required fields to launch.';

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-5 py-5 lg:border-b-0 lg:border-r">
          <div className="type-kicker text-[var(--text-tertiary)]">Setup Progress</div>
          <div className="mt-3 space-y-2.5">
            <SetupCheck complete={profileComplete} label="Slack profile ready" />
            <SetupCheck complete={scheduleComplete} label="Role and start date set" />
            <SetupCheck complete={communicationComplete} label="Manager reviewer assigned" />
          </div>

          <div className="mt-5 space-y-3">
            <SelectedPersonPreview
              label="New Hire"
              name={hireDisplayName}
              detail={hireDisplayDetail}
              icon={IconUser}
            />
            <SelectedPersonPreview
              label="Manager"
              name={managerDisplayName}
              detail={managerDisplayDetail}
              icon={IconShieldCheck}
            />
          </div>
        </aside>

        <div className="min-h-0 overflow-y-auto px-5 py-6">
          <div className="mx-auto max-w-[620px] space-y-6">
            <FormSection title="Hire Identity" icon={IconUser}>
              <div className="space-y-2">
                <Label className="text-[var(--text-secondary)]">New Hire Slack Account <span className="text-[var(--red-text)]">*</span></Label>
                <SlackUserPicker
                  value={hireSlackUser}
                  onChange={selectHireSlackUser}
                  placeholder="Search workspace members..."
                />
                <p className="type-caption text-[var(--text-tertiary)]">
                  Canon will use this Slack profile for the hire name, email, and milestone delivery.
                </p>
              </div>

              {hireSlackUser && (
                <div className="grid grid-cols-1 gap-3 rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-3 sm:grid-cols-2">
                  <div>
                    <div className="type-kicker text-[var(--text-tertiary)]">Name</div>
                    <div className="mt-1 truncate type-body-strong text-[var(--text-primary)]">{hireDisplayName}</div>
                  </div>
                  <div>
                    <div className="type-kicker text-[var(--text-tertiary)]">Email</div>
                    <div className="mt-1 truncate type-body-strong text-[var(--text-primary)]">{hireEmail || 'Missing from Slack'}</div>
                  </div>
                </div>
              )}

              {hireSlackUser && !hireSlackUser.email && (
                <div className="space-y-2">
                  <Label className="text-[var(--text-secondary)]">Email Address <span className="text-[var(--red-text)]">*</span></Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="alex@company.com"
                    required
                  />
                  <p className="type-caption text-[var(--text-tertiary)]">
                    Slack did not provide an email for this account.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[var(--text-secondary)]">Role <span className="text-[var(--red-text)]">*</span></Label>
                  <Select value={form.role} onValueChange={(v) => set('role', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[var(--text-secondary)]">Start Date <span className="text-[var(--red-text)]">*</span></Label>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-9 w-full items-center justify-between rounded-[7px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-[10px] py-[6px] text-left type-body transition-colors duration-[120ms] hover:border-[var(--border-secondary)] focus-visible:outline-none focus-visible:border-[var(--canon-purple)] focus-visible:ring-2 focus-visible:ring-[var(--canon-purple)]/25"
                        style={{ color: startDate ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                      >
                        <span className="truncate">{formatSelectedDate(startDate)}</span>
                        <IconCalendar size={16} className="ml-2 shrink-0 text-[var(--canon-purple)]" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(date) => {
                          setStartDate(date);
                          if (date) setCalendarOpen(false);
                        }}
                        numberOfMonths={1}
                        className="p-4"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {roles.length === 0 && (
                <div className="rounded-[8px] border border-[var(--red-border)] bg-[var(--red-bg)] px-3 py-2 type-caption text-[var(--red-text)]">
                  Add an active role in Readiness Milestones before launching a hire path.
                </div>
              )}
            </FormSection>

            <FormSection title="Manager Review" icon={IconMessage}>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label className="text-[var(--text-secondary)]">Manager Reviewer <span className="text-[var(--red-text)]">*</span></Label>
                  <SlackUserPicker
                    value={managerSlackUser}
                    onChange={(user) => {
                      setManagerSlackUser(user);
                      setForm((prev) => ({
                        ...prev,
                        ...slackUserToManagerFields(user),
                      }));
                    }}
                    placeholder="Search workspace members..."
                  />
                  <p className="type-caption text-[var(--text-tertiary)]">Canon will send proof review and blocker actions to this manager in Slack.</p>
                </div>
              </div>
            </FormSection>
          </div>
        </div>
      </div>

      <div className="flex min-h-[76px] shrink-0 flex-col gap-3 border-t border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-h-8 flex-1 items-center">
          {error ? (
            <div
              aria-live="polite"
              className="rounded-[8px] border px-3 py-2 type-body"
              style={{ backgroundColor: 'var(--red-bg)', borderColor: 'var(--red-border)', color: 'var(--red-text)' }}
            >
              {error}
            </div>
          ) : (
            <p className="type-caption leading-[1.45] text-[var(--text-tertiary)]">
              {launchStatus}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={!canSubmit} className="min-w-[150px]">
            {submitting ? <IconLoader size={13} className="animate-spin" /> : <IconCheckCircle size={13} />}
            {submitting ? (editing ? 'Saving...' : 'Launching...') : (editing ? 'Save Changes' : 'Launch Path')}
          </Button>
        </div>
      </div>
    </form>
  );
}
