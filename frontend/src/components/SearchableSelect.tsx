'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';

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
    <div className={`relative ${isOpen ? 'z-50' : ''}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setSearchQuery('');
            }
          }
        }}
        disabled={disabled}
        className={`field-select flex w-full items-center justify-between text-left text-white disabled:cursor-not-allowed disabled:opacity-50 ${triggerClassName}`}
      >
        <span className={value ? 'text-white' : 'text-white/60'}>{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 text-white/60" />
      </button>

      {isOpen && !disabled && (
        <div
          className="absolute z-50 mt-1 max-h-64 w-full overflow-hidden rounded-lg border border-white/15 bg-[#0f0f0f] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="sticky top-0 border-b border-white/10 bg-[#0f0f0f] p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded bg-[#1c1c1c] px-8 py-1.5 text-sm text-white placeholder-white/40 outline-none focus:bg-[#252525]"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-auto">
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
                  className={`w-full px-3 py-2 text-left text-sm text-white hover:bg-[#252525] focus:bg-[#252525] focus:outline-none ${
                    value === option.value ? 'bg-[#2f2f2f]' : ''
                  }`}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

