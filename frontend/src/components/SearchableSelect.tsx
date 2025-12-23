'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';

interface SearchableSelectProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  onChange: (value: string) => void;
  triggerClassName?: string;
}

export function SearchableSelect({
  options,
  value,
  placeholder = 'Select...',
  disabled = false,
  searchPlaceholder = 'Search...',
  onChange,
  triggerClassName = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.value.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedLabel = value
    ? options.find((opt) => opt.value === value)?.label || value
    : placeholder;

  function selectOption(optionValue: string) {
    onChange(optionValue);
    setSearchQuery('');
    setIsOpen(false);
    // Close all other dropdowns
    window.dispatchEvent(new CustomEvent('closeAllDropdowns'));
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (isOpen && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    function handleCloseAllDropdowns() {
      if (isOpen) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    window.addEventListener('closeAllDropdowns', handleCloseAllDropdowns);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('closeAllDropdowns', handleCloseAllDropdowns);
    };
  }, [isOpen]);

  return (
    <div className={cn('relative', isOpen && 'z-50')} ref={dropdownRef}>
      <Button
        type="button"
        variant="secondary"
        className={cn('w-full justify-between', triggerClassName)}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setSearchQuery('');
            }
          }
        }}
        disabled={disabled}
      >
        <span className={cn(value ? 'text-white' : 'text-white/60')}>{selectedLabel}</span>
        <ChevronDown className={cn('h-4 w-4 text-white/60 transition-transform', isOpen && 'rotate-180')} />
      </Button>

      {isOpen && !disabled && (
        <div
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-black/90 shadow-xl backdrop-blur"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="sticky top-0 border-b border-white/10 bg-black/90 p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-white/60">No matches found</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectOption(option.value);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-white/10 focus:bg-white/10',
                    value === option.value && 'bg-white/10'
                  )}
                >
                  {value === option.value && (
                    <Check className="absolute left-3 h-4 w-4 text-emerald-400" />
                  )}
                  <span className={cn(value === option.value && 'pl-7')}>{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

