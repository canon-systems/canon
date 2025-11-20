'use client';

import { useState, useMemo } from 'react';
import { marked } from 'marked';
import { FileText, Eye, GitCompare, Columns } from 'lucide-react';

interface RegeneratePreviewProps {
  originalText: string;
  newText: string;
}

type ViewMode = 'diff' | 'side-by-side' | 'original' | 'new';

// Line-by-line diff for better readability
function computeLineDiff(original: string, updated: string): Array<{ 
  original?: string; 
  updated?: string; 
  type: 'unchanged' | 'removed' | 'added' | 'modified' 
}> {
  const originalLines = original.split('\n');
  const updatedLines = updated.split('\n');
  const result: Array<{ original?: string; updated?: string; type: 'unchanged' | 'removed' | 'added' | 'modified' }> = [];
  
  // Create a map of line hashes for faster lookup
  const originalMap = new Map<string, number[]>();
  originalLines.forEach((line, idx) => {
    const hash = line.trim();
    if (!originalMap.has(hash)) {
      originalMap.set(hash, []);
    }
    originalMap.get(hash)!.push(idx);
  });
  
  let origIdx = 0;
  let updIdx = 0;
  
  while (origIdx < originalLines.length || updIdx < updatedLines.length) {
    if (origIdx >= originalLines.length) {
      // Only in updated
      result.push({ updated: updatedLines[updIdx], type: 'added' });
      updIdx++;
    } else if (updIdx >= updatedLines.length) {
      // Only in original
      result.push({ original: originalLines[origIdx], type: 'removed' });
      origIdx++;
    } else if (originalLines[origIdx].trim() === updatedLines[updIdx].trim()) {
      // Match
      result.push({ 
        original: originalLines[origIdx], 
        updated: updatedLines[updIdx], 
        type: 'unchanged' 
      });
      origIdx++;
      updIdx++;
    } else {
      // Check if this line appears later in either document
      const origLine = originalLines[origIdx].trim();
      const updLine = updatedLines[updIdx].trim();
      
      // Look ahead in updated for current original line
      let foundInUpdated = false;
      for (let i = updIdx + 1; i < Math.min(updIdx + 10, updatedLines.length); i++) {
        if (updatedLines[i].trim() === origLine) {
          // Add modified/added lines
          for (let j = updIdx; j < i; j++) {
            result.push({ updated: updatedLines[j], type: 'added' });
          }
          updIdx = i;
          foundInUpdated = true;
          break;
        }
      }
      
      // Look ahead in original for current updated line
      let foundInOriginal = false;
      if (!foundInUpdated) {
        for (let i = origIdx + 1; i < Math.min(origIdx + 10, originalLines.length); i++) {
          if (originalLines[i].trim() === updLine) {
            // Add removed lines
            for (let j = origIdx; j < i; j++) {
              result.push({ original: originalLines[j], type: 'removed' });
            }
            origIdx = i;
            foundInOriginal = true;
            break;
          }
        }
      }
      
      if (!foundInUpdated && !foundInOriginal) {
        // Lines are different, mark as modified
        result.push({ 
          original: originalLines[origIdx], 
          updated: updatedLines[updIdx], 
          type: 'modified' 
        });
        origIdx++;
        updIdx++;
      }
    }
  }
  
  return result;
}

export function RegeneratePreview({ originalText, newText }: RegeneratePreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const originalHtml = useMemo(() => {
    if (!originalText) return '<p class="text-white/50">No content</p>';
    return marked.parse(originalText);
  }, [originalText]);

  const newHtml = useMemo(() => {
    if (!newText) return '<p class="text-white/50">No content</p>';
    return marked.parse(newText);
  }, [newText]);

  const lineDiff = useMemo(() => {
    return computeLineDiff(originalText || '', newText || '');
  }, [originalText, newText]);

  return (
    <div className="space-y-4">
      {/* View Mode Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10">
        <button
          onClick={() => setViewMode('side-by-side')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            viewMode === 'side-by-side'
              ? 'border-purple-500 text-purple-300 bg-purple-500/10'
              : 'border-transparent text-white/60 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <Columns className="h-4 w-4" />
          Side by Side
        </button>
        <button
          onClick={() => setViewMode('diff')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            viewMode === 'diff'
              ? 'border-purple-500 text-purple-300 bg-purple-500/10'
              : 'border-transparent text-white/60 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <GitCompare className="h-4 w-4" />
          Line Diff
        </button>
        <button
          onClick={() => setViewMode('original')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            viewMode === 'original'
              ? 'border-orange-500 text-orange-300 bg-orange-500/10'
              : 'border-transparent text-white/60 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <FileText className="h-4 w-4" />
          Original
        </button>
        <button
          onClick={() => setViewMode('new')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            viewMode === 'new'
              ? 'border-green-500 text-green-300 bg-green-500/10'
              : 'border-transparent text-white/60 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <Eye className="h-4 w-4" />
          Preview
        </button>
      </div>

      {/* Content Area */}
      <div className="rounded-lg border border-white/20 bg-black/40 overflow-hidden">
        {viewMode === 'side-by-side' && (
          <div className="grid grid-cols-2 gap-0 h-[70vh]">
            <div className="overflow-y-auto p-6 bg-black/20 border-r border-white/10">
              <div className="mb-3 text-xs font-semibold text-orange-300 uppercase tracking-wide">Original</div>
              <div
                className="prose prose-invert prose-headings:text-white prose-p:text-white/90 prose-strong:text-white prose-code:text-purple-300 prose-code:bg-purple-500/20 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:text-white/90 prose-a:text-blue-400 prose-a:hover:text-blue-300 prose-ul:text-white/90 prose-ol:text-white/90 prose-li:text-white/90 max-w-none"
                dangerouslySetInnerHTML={{ __html: typeof originalHtml === 'string' ? originalHtml : '<p>Error rendering</p>' }}
              />
            </div>
            <div className="overflow-y-auto p-6 bg-gradient-to-br from-green-500/5 to-purple-500/5 border-l-4 border-green-500/30">
              <div className="mb-3 text-xs font-semibold text-green-300 uppercase tracking-wide">Regenerated</div>
              <div
                className="prose prose-invert prose-headings:text-white prose-p:text-white/90 prose-strong:text-white prose-code:text-purple-300 prose-code:bg-purple-500/20 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:text-white/90 prose-a:text-blue-400 prose-a:hover:text-blue-300 prose-ul:text-white/90 prose-ol:text-white/90 prose-li:text-white/90 max-w-none"
                dangerouslySetInnerHTML={{ __html: typeof newHtml === 'string' ? newHtml : '<p>Error rendering</p>' }}
              />
            </div>
          </div>
        )}

        {viewMode === 'diff' && (
          <div className="h-[70vh] overflow-y-auto">
            <div className="font-mono text-sm">
              {lineDiff.map((line, idx) => {
                if (line.type === 'unchanged') {
                  return (
                    <div key={idx} className="flex border-b border-white/5">
                      <div className="w-12 bg-white/5 text-white/40 text-center py-1 text-xs">{idx + 1}</div>
                      <div className="flex-1 px-4 py-1 text-white/70">{line.original || line.updated}</div>
                    </div>
                  );
                } else if (line.type === 'removed') {
                  return (
                    <div key={idx} className="flex border-b border-white/5 bg-red-500/10">
                      <div className="w-12 bg-red-500/20 text-red-300 text-center py-1 text-xs">-</div>
                      <div className="flex-1 px-4 py-1 text-red-200 line-through">{line.original}</div>
                    </div>
                  );
                } else if (line.type === 'added') {
                  return (
                    <div key={idx} className="flex border-b border-white/5 bg-green-500/10">
                      <div className="w-12 bg-green-500/20 text-green-300 text-center py-1 text-xs">+</div>
                      <div className="flex-1 px-4 py-1 text-green-200 font-medium">{line.updated}</div>
                    </div>
                  );
                } else {
                  return (
                    <div key={idx} className="flex border-b border-white/5">
                      <div className="w-12 bg-yellow-500/20 text-yellow-300 text-center py-1 text-xs">~</div>
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div className="px-4 py-1 text-red-200 line-through bg-red-500/10">{line.original}</div>
                        <div className="px-4 py-1 text-green-200 font-medium bg-green-500/10">{line.updated}</div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        )}

        {viewMode === 'original' && (
          <div className="h-[70vh] overflow-y-auto p-6 bg-black/20">
            <div
              className="prose prose-invert prose-headings:text-white prose-p:text-white/90 prose-strong:text-white prose-code:text-purple-300 prose-code:bg-purple-500/20 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:text-white/90 prose-a:text-blue-400 prose-a:hover:text-blue-300 prose-ul:text-white/90 prose-ol:text-white/90 prose-li:text-white/90 max-w-none"
              dangerouslySetInnerHTML={{ __html: typeof originalHtml === 'string' ? originalHtml : '<p>Error rendering</p>' }}
            />
          </div>
        )}

        {viewMode === 'new' && (
          <div className="h-[70vh] overflow-y-auto p-6 bg-gradient-to-br from-green-500/5 to-purple-500/5 border-l-4 border-green-500/30">
            <div
              className="prose prose-invert prose-headings:text-white prose-p:text-white/90 prose-strong:text-white prose-code:text-purple-300 prose-code:bg-purple-500/20 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:text-white/90 prose-a:text-blue-400 prose-a:hover:text-blue-300 prose-ul:text-white/90 prose-ol:text-white/90 prose-li:text-white/90 max-w-none"
              dangerouslySetInnerHTML={{ __html: typeof newHtml === 'string' ? newHtml : '<p>Error rendering</p>' }}
            />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-6 text-sm text-white/60">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-500/30 border border-red-500/50"></div>
            <span>Removed ({lineDiff.filter(l => l.type === 'removed').length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-500/30 border border-green-500/50"></div>
            <span>Added ({lineDiff.filter(l => l.type === 'added').length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-yellow-500/30 border border-yellow-500/50"></div>
            <span>Modified ({lineDiff.filter(l => l.type === 'modified').length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-white/20 border border-white/30"></div>
            <span>Unchanged ({lineDiff.filter(l => l.type === 'unchanged').length})</span>
          </div>
        </div>
        <div className="text-xs text-white/40">
          Total: {lineDiff.length} lines
        </div>
      </div>
    </div>
  );
}

