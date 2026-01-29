'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Users, ChevronsUpDown, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type KnowledgeItem = {
  id: string;
  source_ids: string[];
  type: 'code_summary' | 'issue';
  title: string;
  body: string;
  updated_at: string | null;
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
  const [audiences, setAudiences] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Record<string, string>>({});


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

        if (!cancelled && preferred && preferred.length) {
          setAudiences(preferred);
        }
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
    if (selectedSourceIds.length === 0) return;
    setLoading(true);
    try {
      // Build (ingest -> AKU) then fetch the latest list
      await fetch('/api/knowledge/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceIds: selectedSourceIds,
          audiences,
        }),
      });

      const listRes = await fetch(
        `/api/knowledge?sourceIds=${encodeURIComponent(selectedSourceIds.join(','))}`
      );
      const data = await listRes.json();
      setItems(Array.isArray(data) ? data : []);
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

  const projectedItems = useMemo(() => {
    return items.map((item) => {
      // fallback: generate projection client-side if not present
      const projections =
        item.projections && item.projections.length > 0
          ? item.projections
          : audiences.map((aud) => ({
            audience: aud,
            projection: projectForAudience(item, aud),
            status: 'draft',
          }));
      return { ...item, projections };
    });
  }, [items, audiences]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-white">Knowledge Base</CardTitle>
            <CardDescription className="mt-1">
              Generate and manage knowledge from your connected sources
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="source-select" className="text-white">Select sources</Label>
              <Button variant="ghost" size="sm" onClick={toggleAllSources}>
                {selectedSourceIds.length === allSourceIds.length ? 'Deselect all' : 'Select all'}
              </Button>
            </div>
            <Popover open={sourceMenuOpen} onOpenChange={setSourceMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="source-select"
                  variant="outline"
                  role="combobox"
                  aria-expanded={sourceMenuOpen}
                  className="w-full justify-between border-white bg-neutral-800 hover:bg-neutral-700 hover:border-white"
                  style={{ backgroundColor: '#262626', borderColor: '#ffffff' }}
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
          </div>

          <div className="space-y-3">
            <Label className="text-white">Audiences</Label>
            {audiences.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {audiences.map((aud) => (
                  <Badge
                    key={aud}
                    variant="default"
                    className="cursor-default"
                  >
                    {aud}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                No audiences selected. Set them in Settings → Preferences.
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              variant="default"
              onClick={loadItems}
              disabled={loading || selectedSourceIds.length === 0 || audiences.length === 0}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Generate units
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>Loading knowledge units...</AlertDescription>
        </Alert>
      )}

      {!loading && projectedItems.length === 0 && selectedSourceIds.length > 0 && (
        <Alert variant="default">
          <Info className="h-4 w-4" />
          <AlertDescription>
            No knowledge units found. Try adjusting your filters or selecting different sources.
          </AlertDescription>
        </Alert>
      )}

      {!loading && selectedSourceIds.length === 0 && (
        <Alert variant="default">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Select one or more sources above and click &quot;Generate units&quot; to load knowledge.
          </AlertDescription>
        </Alert>
      )}

      {projectedItems.length > 0 && (
        <div className="space-y-4">
          {projectedItems.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-white text-lg mb-1">{item.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {item.type === 'code_summary' ? 'Code Summary' : 'Issue'}
                      </Badge>
                      {item.updated_at && (
                        <>
                          <span className="text-white/40">·</span>
                          <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                        </>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-white/80 line-clamp-3 leading-relaxed">
                  {item.body}
                </div>
                {audiences.length > 0 && (
                  <div className="space-y-3">
                    <Separator />
                    <Tabs
                      value={selectedTabs[item.id] || audiences[0]}
                      onValueChange={(value) => setSelectedTabs(prev => ({ ...prev, [item.id]: value }))}
                    >
                      <TabsList className="w-full">
                        {audiences.map((aud) => (
                          <TabsTrigger key={aud} value={aud} className="flex-1">
                            {aud}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {item.projections?.map((proj) => (
                        <TabsContent key={proj.audience} value={proj.audience} className="mt-3">
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
                        </TabsContent>
                      ))}
                    </Tabs>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
