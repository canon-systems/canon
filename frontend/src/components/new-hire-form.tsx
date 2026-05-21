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

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSelectedDate(date: Date | undefined) {
  if (!date) return 'Select a Start Date';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function NewHireForm({
  onCreated,
  onCancel,
}: {
  onCreated: (hireId: string) => void;
  onCancel?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: '' as HireRole | '',
    slack_user_id: '',
  });

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.role || !startDate) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/new-hires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          role: form.role,
          start_date: toDateInputValue(startDate),
          slack_user_id: form.slack_user_id || undefined,
        }),
      });
      const data = (await res.json()) as { hire?: { id: string }; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to Create New Hire');
        return;
      }
      if (data.hire?.id) onCreated(data.hire.id);
    } catch {
      setError('An Unexpected Error Occurred');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label className="text-[var(--text-secondary)]">Full Name <span className="text-[var(--red-text)]">*</span></Label>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Alex Johnson"
            required
          />
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
          <Label className="text-[var(--text-secondary)]">Slack Member ID <span className="text-[var(--text-secondary)]">(Optional)</span></Label>
          <Input
            value={form.slack_user_id}
            onChange={(e) => set('slack_user_id', e.target.value)}
            placeholder="U01234ABCDE"
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
          {submitting ? 'Creating...' : 'Add New Hire'}
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
