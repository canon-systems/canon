'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type ResponseDetails = {
  used_at: string | null;
  new_hire_name: string;
  milestone_title: string;
  capability_outcome: string | null;
  real_work_trigger: string | null;
};

export function MilestoneResponseClient({ token }: { token: string }) {
  const [details, setDetails] = useState<ResponseDetails | null>(null);
  const [responseType, setResponseType] = useState<'need_context' | 'blocked'>('need_context');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/onboarding/milestone-response?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as { response?: ResponseDetails; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Failed to load response link');
        if (!cancelled) setDetails(data.response ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load response link');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  async function submit() {
    if (!message.trim()) {
      setError('Add a short note so your manager knows what context you need.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/milestone-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, response_type: responseType, message }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit response');
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-page)] px-4 py-10 text-[var(--text-primary)]">
      <div className="mx-auto max-w-xl rounded-[10px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] p-6">
        <div className="type-kicker mb-2 text-[var(--text-tertiary)]">Canon Milestone</div>
        {loading ? (
          <div className="type-body text-[var(--text-secondary)]">Loading...</div>
        ) : error && !details ? (
          <div className="type-body text-[var(--red-text)]">{error}</div>
        ) : submitted ? (
          <div>
            <h1 className="type-page-title mb-2">Response sent</h1>
            <p className="type-body leading-[1.6] text-[var(--text-secondary)]">
              Canon recorded this as a context gap or blocker for manager review. It will not mark the milestone complete.
            </p>
          </div>
        ) : details ? (
          <div className="space-y-5">
            <div>
              <h1 className="type-page-title">{details.milestone_title}</h1>
              <p className="type-body mt-2 leading-[1.6] text-[var(--text-secondary)]">
                {details.capability_outcome ?? 'Share what context would help before this real-work milestone.'}
              </p>
              {details.real_work_trigger && (
                <p className="type-body mt-3 rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-secondary)]">
                  Expected work: {details.real_work_trigger}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setResponseType('need_context')}
                className="rounded-[7px] border px-3 py-2 type-body transition-colors"
                style={{
                  borderColor: responseType === 'need_context' ? 'var(--canon-purple)' : 'var(--border-tertiary)',
                  backgroundColor: responseType === 'need_context' ? 'var(--canon-purple-light)' : 'var(--bg-secondary)',
                  color: responseType === 'need_context' ? 'var(--canon-purple-dark)' : 'var(--text-secondary)',
                }}
              >
                Need more context
              </button>
              <button
                type="button"
                onClick={() => setResponseType('blocked')}
                className="rounded-[7px] border px-3 py-2 type-body transition-colors"
                style={{
                  borderColor: responseType === 'blocked' ? 'var(--amber)' : 'var(--border-tertiary)',
                  backgroundColor: responseType === 'blocked' ? 'var(--amber-bg-subtle)' : 'var(--bg-secondary)',
                  color: responseType === 'blocked' ? 'var(--amber-text)' : 'var(--text-secondary)',
                }}
              >
                I am blocked
              </button>
            </div>

            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What would help you move forward?"
              className="min-h-[120px]"
            />

            {error && <div className="type-body text-[var(--red-text)]">{error}</div>}

            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Response'}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
