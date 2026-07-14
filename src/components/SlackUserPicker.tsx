'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown as IconChevronDown, Loader2 as IconLoader2, Search as IconSearch, X as IconX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface SlackUser {
  id: string;
  name: string;
  email: string | null;
}

interface SlackUserPickerProps {
  value: SlackUser | null;
  onChange: (user: SlackUser | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SlackUserPicker({ value, onChange, placeholder = 'Search teammates...', disabled }: SlackUserPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<SlackUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  const loadUsers = useCallback(async () => {
    if (loaded.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/slack/users');
      const data = (await res.json()) as { users?: SlackUser[]; error?: string; reconnect_required?: boolean };
      if (data.reconnect_required) {
        setError('Reconnect Slack in Settings → Integrations to enable member lookup.');
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to load teammates.');
        return;
      }
      setUsers(data.users ?? []);
      loaded.current = true;
    } catch {
      setError('Failed to load teammates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadUsers();
      // focus the search input after the popover animates in
      setTimeout(() => searchRef.current?.focus(), 60);
    } else {
      setQuery('');
    }
  }, [open, loadUsers]);

  const filtered = query.trim()
    ? users.filter((u) =>
        u.name.toLowerCase().includes(query.toLowerCase()) ||
        (u.email ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : users;

  function select(user: SlackUser) {
    onChange(user);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-3 py-[7px] text-left type-body transition-colors hover:border-[var(--border-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: value ? 'var(--text-primary)' : 'var(--text-tertiary)', minHeight: 36 }}
        >
          <span className="min-w-0 flex-1 truncate">
            {value ? value.name : placeholder}
          </span>
          <span className="flex flex-shrink-0 items-center gap-1">
            {value && (
              <span
                role="button"
                tabIndex={0}
                onClick={clear}
                onKeyDown={(e) => e.key === 'Enter' && clear(e as unknown as React.MouseEvent)}
                className="rounded p-[1px] opacity-50 hover:opacity-100 transition-opacity"
              >
                <IconX size={12} />
              </span>
            )}
            <IconChevronDown size={14} className="opacity-50" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-[var(--border-tertiary)] px-3 py-2">
          <IconSearch size={14} className="flex-shrink-0 opacity-40" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent type-body outline-none placeholder:text-[var(--text-tertiary)]"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="opacity-40 hover:opacity-80">
              <IconX size={12} />
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[260px] overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 type-body" style={{ color: 'var(--text-tertiary)' }}>
              <IconLoader2 size={13} className="animate-spin" /> Loading members...
            </div>
          ) : error ? (
            <div className="px-3 py-3 type-body" style={{ color: 'var(--text-tertiary)' }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 type-body" style={{ color: 'var(--text-tertiary)' }}>
              {query ? 'No members match your search.' : 'No members found.'}
            </div>
          ) : (
            filtered.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => select(user)}
                className="flex w-full flex-col items-start px-3 py-[7px] text-left hover:bg-[var(--bg-secondary)] transition-colors duration-[100ms]"
                style={{ backgroundColor: value?.id === user.id ? 'var(--bg-secondary)' : undefined }}
              >
                <span className="type-body-strong truncate w-full" style={{ color: 'var(--text-primary)' }}>
                  {user.name}
                </span>
                {user.email && (
                  <span className="type-caption truncate w-full" style={{ color: 'var(--text-tertiary)' }}>
                    {user.email}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
