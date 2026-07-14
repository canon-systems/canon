'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown as IconChevronDown, Plus as IconPlus, Search as IconSearch } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/components/ui/utils';
import { ToolLogo } from '@/components/ToolLogo';

const KNOWN_TOOL_NAMES = ['Salesforce', 'GitHub', 'Gong', 'Outreach', 'Zoom'];

interface ToolNameComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  unavailableToolNames?: string[];
}

function normalizeToolName(toolName: string) {
  return toolName.trim().toLowerCase();
}

export function ToolNameCombobox({
  value,
  onChange,
  placeholder = 'Select a tool...',
  unavailableToolNames = [],
}: ToolNameComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedSearch = search.trim().toLowerCase();
  const selected = value.trim();
  const unavailableToolSet = useMemo(
    () => new Set(unavailableToolNames.map(normalizeToolName).filter(Boolean)),
    [unavailableToolNames]
  );

  const filteredTools = useMemo(() => {
    if (!normalizedSearch) return KNOWN_TOOL_NAMES;
    return KNOWN_TOOL_NAMES.filter((toolName) => toolName.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch]);

  const exactKnownTool = KNOWN_TOOL_NAMES.some((toolName) => toolName.toLowerCase() === normalizedSearch);
  const exactUnavailableTool = normalizedSearch.length > 0 && unavailableToolSet.has(normalizedSearch);
  const canAddCustomTool = search.trim().length > 0 && !exactKnownTool && !exactUnavailableTool;

  function selectTool(toolName: string) {
    if (unavailableToolSet.has(normalizeToolName(toolName))) return;
    onChange(toolName);
    setSearch('');
    setOpen(false);
  }

  function confirmSearchEntry() {
    const trimmedSearch = search.trim();
    if (!trimmedSearch) return;

    const exactMatch = KNOWN_TOOL_NAMES.find((toolName) => toolName.toLowerCase() === normalizedSearch);
    selectTool(exactMatch ?? filteredTools[0] ?? trimmedSearch);
  }

  function handleCustomToolAction() {
    const customToolName = search.trim();
    if (canAddCustomTool) {
      selectTool(customToolName);
      return;
    }

    searchInputRef.current?.focus();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-[7px] border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-[10px] py-[6px] type-field text-[var(--text-primary)] transition-colors duration-[120ms] hover:border-[var(--border-secondary)] focus:outline-none focus:border-[var(--canon-purple)] focus:ring-2 focus:ring-[var(--canon-purple)]/25',
            !selected && 'text-[var(--text-tertiary)]'
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? <ToolLogo toolName={selected} size={14} containerSize={22} borderRadius={5} /> : null}
            <span className="truncate">{selected || placeholder}</span>
          </span>
          <IconChevronDown size={14} className="flex-shrink-0 text-[var(--text-secondary)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-hidden p-2"
      >
        <div className="relative mb-2">
          <IconSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              confirmSearchEntry();
            }}
            placeholder="Search or type tool name..."
            className="pl-8"
            autoFocus
          />
        </div>
        <div
          className="max-h-56 overflow-y-auto overscroll-contain pr-1"
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          {filteredTools.map((toolName) => (
            <button
              key={toolName}
              type="button"
              disabled={unavailableToolSet.has(normalizeToolName(toolName))}
              onClick={() => selectTool(toolName)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-[7px] text-left type-field text-[var(--text-secondary)] transition-colors duration-[120ms] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]"
            >
              <ToolLogo toolName={toolName} size={14} containerSize={22} borderRadius={5} />
              <span className="min-w-0 flex-1 truncate">{toolName}</span>
              {unavailableToolSet.has(normalizeToolName(toolName)) && (
                <span className="type-caption text-[var(--text-tertiary)]">Configured</span>
              )}
            </button>
          ))}
          {filteredTools.length === 0 && !canAddCustomTool && (
            <div className="px-3 py-6 text-center type-body text-[var(--text-tertiary)]">No tools found</div>
          )}
        </div>
        <div className="mt-2 border-t border-[var(--border-tertiary)] pt-2">
          <button
            type="button"
            onClick={handleCustomToolAction}
            disabled={exactUnavailableTool}
            className="flex w-full items-center gap-2 rounded-md px-3 py-[7px] text-left type-field text-[var(--text-secondary)] transition-colors duration-[120ms] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]"
          >
            <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[5px] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
              <IconPlus size={13} />
            </span>
            <span className="min-w-0 truncate">
              {exactUnavailableTool ? 'Already configured' : canAddCustomTool ? `Add "${search.trim()}"` : 'Add custom integration'}
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
