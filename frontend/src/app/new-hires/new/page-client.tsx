'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HireRole } from '@/types/onboarding';

const ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];

export function NewHireFormClient() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: '' as HireRole | '',
    start_date: '',
    slack_user_id: '',
  });

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.role || !form.start_date) {
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
          start_date: form.start_date,
          slack_user_id: form.slack_user_id || undefined,
        }),
      });
      const data = (await res.json()) as { hire?: { id: string }; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to create new hire'); return; }
      if (data.hire?.id) router.push(`/new-hires/${data.hire.id}`);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <Link href="/new-hires" className="flex items-center gap-1.5 text-white/40 hover:text-white/80 text-sm mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        New Hires
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Add new hire</h1>
        <p className="text-white/50 text-sm mt-0.5">Canon will set up their onboarding and default access requests.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-zinc-900 p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-white/70 text-sm">Full name <span className="text-red-400">*</span></Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Alex Johnson"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/70 text-sm">Email <span className="text-red-400">*</span></Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="alex@company.com"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/70 text-sm">Role <span className="text-red-400">*</span></Label>
            <Select value={form.role} onValueChange={(v) => set('role', v)}>
              <SelectTrigger className="border-white/10 bg-white/5 text-white">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 text-white border-white/10">
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white/70 text-sm">Start date <span className="text-red-400">*</span></Label>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
              className="border-white/10 bg-white/5 text-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/70 text-sm">Slack member ID <span className="text-white/40">(optional)</span></Label>
            <Input
              value={form.slack_user_id}
              onChange={(e) => set('slack_user_id', e.target.value)}
              placeholder="U01234ABCDE"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
            />
            <p className="text-white/30 text-xs">Find in Slack → member profile → More → Copy member ID</p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting} className="bg-white text-black hover:bg-white/90 flex-1">
            {submitting ? 'Creating...' : 'Add new hire'}
          </Button>
          <Link href="/new-hires">
            <Button type="button" variant="outline" className="border-white/20 text-white/70 hover:bg-white/10">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
