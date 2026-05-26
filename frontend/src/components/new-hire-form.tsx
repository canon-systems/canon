'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { IconCalendar } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HireRole } from '@/types/onboarding';

const ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];

export type EditableNewHire = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: HireRole;
  start_date: string;
  slack_user_id: string | null;
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
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialHire ? fromDateInputValue(initialHire.start_date) : undefined
  );
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [form, setForm] = useState({
    firstName: initialHire?.first_name ?? '',
    lastName: initialHire?.last_name ?? '',
    email: initialHire?.email ?? '',
    role: initialHire?.role ?? '' as HireRole | '',
    slack_user_id: initialHire?.slack_user_id ?? '',
  });

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.role || !startDate || !form.slack_user_id) {
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
            email: form.email,
            role: form.role,
            start_date: toDateInputValue(startDate),
            slack_user_id: form.slack_user_id,
          }),
        }
      );
      const data = (await res.json()) as { hire?: EditableNewHire; error?: string };
      if (!res.ok) {
        setError(data.error ?? (editing ? 'Failed to Update New Hire' : 'Failed to Create New Hire'));
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-[var(--text-secondary)]">First Name <span className="text-[var(--red-text)]">*</span></Label>
            <Input
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              placeholder="Alex"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-secondary)]">Last Name <span className="text-[var(--red-text)]">*</span></Label>
            <Input
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              placeholder="Johnson"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[var(--text-secondary)]">Email <span className="text-[var(--red-text)]">*</span></Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="alex@company.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[var(--text-secondary)]">Role <span className="text-[var(--red-text)]">*</span></Label>
          <Select value={form.role} onValueChange={(v) => set('role', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a Role" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
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
                <span>{formatSelectedDate(startDate)}</span>
                <IconCalendar size={16} style={{ color: 'var(--canon-purple)' }} />
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

        <div className="space-y-2">
          <Label className="text-[var(--text-secondary)]">Slack Member ID <span className="text-[var(--red-text)]">*</span></Label>
          <Input
            value={form.slack_user_id}
            onChange={(e) => set('slack_user_id', e.target.value)}
            placeholder="U01234ABCDE"
            required
          />
          <p className="text-[var(--text-secondary)] type-caption">Find in Slack &gt; Member Profile &gt; More &gt; Copy Member ID</p>
        </div>
      </Card>

      {error && (
        <div className="rounded-[8px] border px-3 py-2 type-body" style={{ backgroundColor: 'var(--red-bg)', borderColor: 'var(--red-border)', color: 'var(--red-text)' }}>
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting ? (editing ? 'Saving...' : 'Creating...') : (editing ? 'Save Changes' : 'Add New Hire')}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
