'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, ChevronsUpDown, Info, Check } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { createClient } from '@/lib/supabase/client';

type KnowledgeItem = {
  id: string;
  source_ids: string[];
  type: 'code_summary' | 'issue';
  title: string;
  body: string;
  updated_at: string | null;
  scope_refs?: string[];
  projections?: Array<{ audience: string; projection: string; status: string }>;
};

type Source = { id: string; name: string; provider: string };

function projectForAudience(item: KnowledgeItem, audience: string): string {
  const base = item.body || '';
  switch (audience.toLowerCase()) {
    case 'executive':
      return `What it is: ${item.title}\nWhy it matters: ${base.slice(0, 240)}\nTop risk: TBD`;
    case 'sales':
      return `Problem solved: ${base.slice(0, 200)}\nDifferentiators: TBD\nDisqualifiers: TBD`;
    case 'marketing':
      return `Positioning: ${base.slice(0, 200)}\nClaims allowed: TBD\nDo not claim: TBD`;
    case 'engineering':
      return base;
    case 'support':
      return `What breaks: TBD\nSignals: TBD\nEscalation: TBD\nNotes: ${base.slice(0, 200)}`;
    case 'customer':
      return `Benefit: ${base.slice(0, 200)}\nHow to use: TBD\nLimits: TBD`;
    default:
      return base;
  }
}

interface KnowledgeClientProps {
  sources: Source[];
}

export default function KnowledgeClient({ sources }: KnowledgeClientProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [audienceOptions, setAudienceOptions] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);


  // Initialize audiences directly from Supabase preference (persisted in auth metadata)
  useEffect(() => {
    let cancelled = false;

    async function loadPreferredAudiences() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const preferred =
          (Array.isArray(data.user?.user_metadata?.preferred_audiences) && data.user?.user_metadata?.preferred_audiences) ||
          (data.user?.user_metadata?.preferred_audience ? [data.user.user_metadata.preferred_audience] : []);

        if (cancelled) return;

        const cleanedPreferred = Array.from(
          new Set((preferred || []).filter((aud) => typeof aud === 'string' && aud.trim().length > 0))
        );

        setAudienceOptions(cleanedPreferred);
      } catch (err) {
        console.error('Unable to load preferred audiences', err);
      }
    }

    loadPreferredAudiences();
    const handleFocus = () => loadPreferredAudiences();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, []);

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const loadItems = async () => {
    if (selectedSourceIds.length === 0 || selectedAudiences.length === 0) return;
    setLoading(true);
    try {
      // Build (ingest -> AKU) then fetch the latest list
      await fetch('/api/knowledge/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceIds: selectedSourceIds,
          audiences: selectedAudiences,
        }),
      });

      const listRes = await fetch(
        `/api/knowledge?sourceIds=${encodeURIComponent(selectedSourceIds.join(','))}`
      );
      const data = await listRes.json();
      const normalized = (Array.isArray(data) ? data : []).map((item, idx) => {
        const title = typeof item?.title === 'string' && item.title.trim().length > 0
          ? item.title.trim()
          : (Array.isArray(item?.scope_refs) && item.scope_refs[0]) || `AKU ${idx + 1}`;
        return { ...item, title };
      });
      setItems(normalized);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const allSourceIds = useMemo(() => sources.map((s) => s.id), [sources]);

  const toggleAllSources = () => {
    setSelectedSourceIds((prev) =>
      prev.length === allSourceIds.length ? [] : allSourceIds
    );
  };

  const toggleAudience = (audience: string) => {
    setSelectedAudiences((prev) =>
      prev.includes(audience) ? prev.filter((a) => a !== audience) : [...prev, audience]
    );
  };

  const clearAudiences = () => setSelectedAudiences([]);
  const selectAllAudiences = () => setSelectedAudiences(audienceOptions);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const resetFilters = () => {
    setSelectedSourceIds([]);
    setSelectedAudiences([]);
    setSelectedCategories([]);
    setItems([]);
  };

  const projectedItems = useMemo(() => {
    return items.map((item) => {
      // fallback: generate projection client-side if not present
      const projections =
        item.projections && item.projections.length > 0
          ? item.projections
          : selectedAudiences.map((aud) => ({
            audience: aud,
            projection: projectForAudience(item, aud),
            status: 'draft',
          }));

      // Ensure a stable first projection for rendering when tabs are hidden
      const orderedProjections = selectedAudiences.length
        ? projections.sort((a, b) => {
          const ai = selectedAudiences.indexOf(a.audience);
          const bi = selectedAudiences.indexOf(b.audience);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        })
        : projections;

      return { ...item, projections: orderedProjections };
    });
  }, [items, selectedAudiences]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (title) set.add(title);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visibleItems = useMemo(() => {
    return projectedItems.filter((item) => {
      if (selectedCategories.length === 0) return true;
      return selectedCategories.includes(item.title);
    });
  }, [projectedItems, selectedCategories]);

  // Auto-sync when sources or audience preferences change
  useEffect(() => {
    if (selectedSourceIds.length === 0 || selectedAudiences.length === 0) return;
    const id = setTimeout(() => {
      loadItems();
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceIds, selectedAudiences]);

  useEffect(() => {
    // Drop categories that no longer exist after refresh
    setSelectedCategories((prev) => prev.filter((c) => categories.includes(c)));
  }, [categories]);

  const filtersReady = selectedSourceIds.length > 0 && selectedAudiences.length > 0;

  return (
    <SidebarProvider defaultOpen className="w-full">
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Sidebar className="lg:self-start">
          <SidebarHeader>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">Filters</p>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Sources</SidebarGroupLabel>
              <SidebarGroupContent>
                <Popover open={sourceMenuOpen} onOpenChange={setSourceMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="source-select"
                      variant="outline"
                      role="combobox"
                      aria-expanded={sourceMenuOpen}
                      className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30"
                      onClick={() => setSourceMenuOpen(!sourceMenuOpen)}
                    >
                      <span className="truncate">
                        {selectedSourceIds.length > 0
                          ? `${selectedSourceIds.length} source${selectedSourceIds.length === 1 ? '' : 's'} selected`
                          : 'Choose sources'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search sources..." />
                      <CommandList>
                        <CommandEmpty>No sources found.</CommandEmpty>
                        <CommandGroup>
                          {sources.map((s) => {
                            const checked = selectedSourceIds.includes(s.id);
                            const handleToggle = () => toggleSource(s.id);
                            return (
                              <CommandItem
                                key={s.id}
                                value={`${s.name} ${s.provider}`}
                                onSelect={() => {
                                  handleToggle();
                                }}
                                className="cursor-pointer"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => {
                                    handleToggle();
                                  }}
                                  className="mr-2"
                                />
                                <span className="flex-1 truncate">
                                  <span className="text-white/60">[{s.provider}]</span> {s.name}
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                    <Separator />
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-white/60">
                        {selectedSourceIds.length} of {allSourceIds.length} selected
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSourceIds([])}
                        >
                          Clear
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            toggleAllSources();
                            setSourceMenuOpen(false);
                          }}
                        >
                          {selectedSourceIds.length === allSourceIds.length ? 'Deselect all' : 'Select all'}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>{selectedSourceIds.length} chosen</span>
                  <Button variant="ghost" size="sm" onClick={toggleAllSources}>
                    {selectedSourceIds.length === allSourceIds.length ? 'Clear all' : 'Select all'}
                  </Button>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Audiences</SidebarGroupLabel>
              <SidebarGroupContent>
                {audienceOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {audienceOptions.map((aud) => {
                      const active = selectedAudiences.includes(aud);
                      return (
                        <Button
                          key={aud}
                          variant={active ? 'secondary' : 'ghost'}
                          size="sm"
                          className={cn(
                            'border',
                            active
                              ? 'border-white/70 bg-white text-black shadow-[0_18px_50px_rgba(0,0,0,0.5)] ring-2 ring-white ring-offset-1 ring-offset-black'
                              : 'border-white/15 text-white/80 hover:border-white/25 hover:text-white'
                          )}
                          onClick={() => toggleAudience(aud)}
                        >
                          {active && <Check className="mr-1.5 h-4 w-4" />}
                          {aud}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                    No audiences configured. Set them in Settings → Preferences.
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span>
                    Selected: {selectedAudiences.length > 0 ? selectedAudiences.join(', ') : 'None'}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={clearAudiences}>
                      Clear
                    </Button>
                    <Button variant="ghost" size="sm" onClick={selectAllAudiences}>
                      All
                    </Button>
                  </div>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Units</SidebarGroupLabel>
              <SidebarGroupContent>
                {categories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const active = selectedCategories.includes(cat);
                      return (
                        <Button
                          key={cat}
                          variant={active ? 'secondary' : 'ghost'}
                          size="sm"
                          className={cn(
                            'border',
                            active
                              ? 'border-white/70 bg-white text-black shadow-[0_18px_50px_rgba(0,0,0,0.5)] ring-2 ring-white ring-offset-1 ring-offset-black'
                              : 'border-white/15 text-white/80 hover:border-white/25 hover:text-white'
                          )}
                          onClick={() => toggleCategory(cat)}
                        >
                          {active && <Check className="mr-1.5 h-4 w-4" />}
                          {cat}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                    Categories will appear once knowledge is generated for selected sources.
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span>
                    Selected: {selectedCategories.length > 0 ? selectedCategories.join(', ') : 'None'}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCategories([])}>
                      Clear
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCategories(categories)}>
                      All
                    </Button>
                  </div>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={loadItems}
                disabled={loading || !filtersReady}
                className="border-white/20 bg-white/10 text-white hover:bg-white/15"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Syncing...
                  </span>
                ) : (
                  'Refresh knowledge'
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-white/70 hover:text-white"
              >
                Reset
              </Button>
            </div>
            <p className="mt-2 text-xs text-white/60">Auto-syncs whenever filters change.</p>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-white">Knowledge Base</h1>
              <p className="text-white/70">Generate and manage knowledge from your connected sources.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedSourceIds.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedSourceIds.length} source{selectedSourceIds.length === 1 ? '' : 's'}
                  </Badge>
                )}
                {selectedAudiences.length > 0 && (
                  <Badge variant="outline" className="border-white/20 text-xs text-white/80">
                    {selectedAudiences.join(' · ')}
                  </Badge>
                )}
                {selectedCategories.length > 0 && (
                  <Badge variant="outline" className="border-white/20 text-xs text-white/80">
                    {selectedCategories.join(' · ')}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {loading && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>Loading knowledge units...</AlertDescription>
            </Alert>
          )}

          {!loading && !filtersReady && (
            <Alert variant="default">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Choose at least one source and audience to start syncing knowledge.
              </AlertDescription>
            </Alert>
          )}

          {!loading && filtersReady && visibleItems.length === 0 && (
            <Alert variant="default">
              <Info className="h-4 w-4" />
              <AlertDescription>
                No knowledge units found. Try adjusting your filters or selecting different sources.
              </AlertDescription>
            </Alert>
          )}

          {visibleItems.length > 0 && (
            <div className="space-y-4">
              {visibleItems.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-white text-lg mb-1">{item.title}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          {item.updated_at && (
                            <>
                              <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                            </>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedAudiences.length > 0 && (
                      <div className="space-y-3">
                        {(() => {
                          const activeAudience = selectedAudiences[0];
                          const proj =
                            item.projections?.find((p) => p.audience === activeAudience) ||
                            item.projections?.[0];
                          if (!proj) return null;
                          return (
                            <Card className="bg-white/5 border-white/10">
                              <CardContent className="p-4 space-y-2">
                                <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
                                  {proj.projection}
                                </div>
                                <div className="text-xs text-white/50">
                                  Status: {proj.status || 'draft'}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
