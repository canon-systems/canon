'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 as IconLoader2, Search as IconSearch } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type CalendarSourceProvider = {
  provider: 'google_calendar' | 'outlook';
  label: string;
};

type CalendarSourceOption = {
  key: string;
  externalId: string;
  type: 'primary' | 'calendar' | 'group';
  displayName: string;
  isDefault: boolean;
  selected: boolean;
  available: boolean;
};

type CalendarSourcesResponse = {
  sources?: CalendarSourceOption[];
  warnings?: string[];
  syncQueued?: boolean;
  error?: string;
  detail?: string;
};

type CalendarSourceManagerDialogProps = {
  provider: CalendarSourceProvider | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: {
    provider: CalendarSourceProvider;
    selectedCount: number;
    warnings: string[];
    syncQueued: boolean;
  }) => void;
};

export function CalendarSourceManagerDialog({
  provider,
  onOpenChange,
  onSaved,
}: CalendarSourceManagerDialogProps) {
  const [sources, setSources] = useState<CalendarSourceOption[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!provider) return;

    const activeProvider = provider;
    const controller = new AbortController();
    setSources([]);
    setSelectedKeys(new Set());
    setSearch('');
    setError('');
    setWarnings([]);
    setLoading(true);

    async function loadSources() {
      try {
        const response = await fetch(
          `/api/integrations/calendar-sources?provider=${encodeURIComponent(activeProvider.provider)}`,
          { signal: controller.signal }
        );
        const data = (await response.json().catch(() => ({}))) as CalendarSourcesResponse;
        if (!response.ok) throw new Error(data.detail || data.error || 'Unable to load calendars.');

        const nextSources = data.sources ?? [];
        setSources(nextSources);
        setSelectedKeys(new Set(nextSources.filter((source) => source.selected).map((source) => source.key)));
        setWarnings(data.warnings ?? []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load calendars.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSources();
    return () => controller.abort();
  }, [provider]);

  const filteredSources = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return normalizedSearch
      ? sources.filter((source) => source.displayName.toLowerCase().includes(normalizedSearch))
      : sources;
  }, [search, sources]);

  function toggleSource(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveSelection() {
    if (!provider) return;

    const activeProvider = provider;
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/integrations/calendar-sources', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider.provider,
          selectedKeys: Array.from(selectedKeys),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CalendarSourcesResponse;
      if (!response.ok) throw new Error(data.detail || data.error || 'Unable to save calendars.');

      onSaved({
        provider: activeProvider,
        selectedCount: selectedKeys.size,
        warnings: data.warnings ?? [],
        syncQueued: data.syncQueued === true,
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save calendars.');
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open && !saving) onOpenChange(false);
  }

  return (
    <Dialog open={provider !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <DialogHeader>
          <DialogTitle>{provider ? `${provider.label} calendars` : 'Calendars'}</DialogTitle>
          <DialogDescription>
            Choose the calendars Canon should use for meeting briefings.
          </DialogDescription>
        </DialogHeader>

        {warnings.map((warning) => (
          <Alert key={warning} className="type-body">
            {warning}
          </Alert>
        ))}
        {error && (
          <Alert variant="destructive" className="type-body-strong">
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 type-body text-[var(--text-tertiary)]">
            <IconLoader2 size={14} className="animate-spin" /> Loading calendars...
          </div>
        ) : sources.length > 0 ? (
          <div className="space-y-3">
            <div className="relative">
              <label className="sr-only" htmlFor="calendar-source-search">Search calendars</label>
              <IconSearch
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <Input
                id="calendar-source-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search calendars..."
                className="h-9 pl-8"
              />
            </div>

            <div className="max-h-72 overflow-y-auto rounded-[6px] border border-[var(--border-tertiary)]">
              {filteredSources.length > 0 ? filteredSources.map((source) => (
                <label
                  key={source.key}
                  className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-[var(--border-tertiary)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--bg-secondary)]"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[var(--canon-purple)]"
                    checked={selectedKeys.has(source.key)}
                    onChange={() => toggleSource(source.key)}
                    disabled={!source.available && !selectedKeys.has(source.key)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="type-body-strong block truncate text-[var(--text-primary)]">
                      {source.displayName}
                    </span>
                    <span className="type-caption block text-[var(--text-tertiary)]">
                      {!source.available
                        ? 'Currently unavailable'
                        : source.type === 'group'
                          ? 'Microsoft 365 group'
                          : source.isDefault ? 'Default calendar' : 'Calendar'}
                    </span>
                  </span>
                </label>
              )) : (
                <div className="px-3 py-5 text-center type-body text-[var(--text-tertiary)]">
                  No matching calendars.
                </div>
              )}
            </div>
            <p className="type-caption text-[var(--text-tertiary)]">
              {selectedKeys.size} selected
            </p>
          </div>
        ) : !error ? (
          <div className="min-h-32 py-5 text-center type-body text-[var(--text-tertiary)]">
            No calendars are available to this account.
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void saveSelection()} disabled={loading || saving || Boolean(error)}>
            {saving && <IconLoader2 size={14} className="animate-spin" />}
            Save Calendars
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
