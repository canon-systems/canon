'use client';

import { useRef } from 'react';
import { marked } from 'marked';

interface DiffViewerProps {
  originalText: string;
  newText: string;
  showMarkdown?: boolean;
}

export function DiffViewer({ originalText, newText, showMarkdown = true }: DiffViewerProps) {
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const newScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Scroll-sync: when one pane scrolls, calculate ratio and sync the other
  function handleOriginalScroll() {
    if (isScrollingRef.current || !originalScrollRef.current || !newScrollRef.current) return;
    isScrollingRef.current = true;

    const max = Math.max(1, originalScrollRef.current.scrollHeight - originalScrollRef.current.clientHeight);
    const ratio = max > 0 ? originalScrollRef.current.scrollTop / max : 0;

    const newMax = Math.max(1, newScrollRef.current.scrollHeight - newScrollRef.current.clientHeight);
    newScrollRef.current.scrollTo({ top: ratio * newMax, behavior: 'auto' });

    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  }

  function handleNewScroll() {
    if (isScrollingRef.current || !originalScrollRef.current || !newScrollRef.current) return;
    isScrollingRef.current = true;

    const max = Math.max(1, newScrollRef.current.scrollHeight - newScrollRef.current.clientHeight);
    const ratio = max > 0 ? newScrollRef.current.scrollTop / max : 0;

    const originalMax = Math.max(1, originalScrollRef.current.scrollHeight - originalScrollRef.current.clientHeight);
    originalScrollRef.current.scrollTo({ top: ratio * originalMax, behavior: 'auto' });

    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Original */}
      <div>
        <div className="mb-2 text-sm font-medium text-white/70">Original Documentation</div>
        <div
          ref={originalScrollRef}
          className="h-[60vh] overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-4"
          onScroll={handleOriginalScroll}
        >
          {showMarkdown ? (
            <div
              className="prose prose-invert max-w-none text-white text-sm leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: (originalText && marked.parse(originalText)) || '<p class="text-white/50">No content</p>'
              }}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-xs text-white/90 font-mono leading-relaxed">
              {originalText || 'No content'}
            </pre>
          )}
        </div>
      </div>

      {/* New with highlights */}
      <div>
        <div className="mb-2 text-sm font-medium text-white/70">Updated Documentation</div>
        <div
          ref={newScrollRef}
          className="h-[60vh] overflow-y-auto rounded-lg border border-green-500/30 bg-green-500/5 p-4"
          onScroll={handleNewScroll}
        >
          {showMarkdown ? (
            <div
              className="prose prose-invert max-w-none text-white text-sm leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: (newText && marked.parse(newText)) || '<p class="text-white/50">No content</p>'
              }}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-xs text-white/90 font-mono leading-relaxed">
              {newText || 'No content'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

