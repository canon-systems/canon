'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

export interface FaqItem {
  question: string;
  answer: string;
}

interface FaqAccordionProps {
  items: readonly FaqItem[];
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div
      className="divide-y rounded-[10px] border"
      style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-primary)', '--tw-divide-opacity': '1' } as React.CSSProperties}
    >
      {items.map((item, idx) => {
        const isOpen = openFaqIndex === idx;
        const panelId = `${baseId}-panel-${idx}`;
        const buttonId = `${baseId}-button-${idx}`;

        return (
          <div key={item.question} style={{ borderColor: 'var(--border-tertiary)' }}>
            <button
              id={buttonId}
              type="button"
              className="flex w-full items-center justify-between gap-5 px-5 py-4 text-left"
              onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span className="pr-4 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {item.question}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                style={{ color: 'var(--text-tertiary)' }}
                aria-hidden
              />
            </button>
            {isOpen && (
              <div id={panelId} role="region" aria-labelledby={buttonId} className="px-5 pb-5">
                <p className="max-w-3xl text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                  {item.answer}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
