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
    <div className="divide-y divide-white/8 rounded-[2rem] border border-white/10 bg-[#101113]">
      {items.map((item, idx) => {
        const isOpen = openFaqIndex === idx;
        const panelId = `${baseId}-panel-${idx}`;
        const buttonId = `${baseId}-button-${idx}`;

        return (
          <div key={item.question}>
            <button
              id={buttonId}
              type="button"
              className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left sm:px-7"
              onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span className="pr-4 text-base font-medium text-white">{item.question}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-white/52 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {isOpen && (
              <div id={panelId} role="region" aria-labelledby={buttonId} className="px-6 pb-6 sm:px-7">
                <p className="max-w-3xl text-sm leading-7 text-white/66">{item.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
