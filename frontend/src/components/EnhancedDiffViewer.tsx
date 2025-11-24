'use client';

import { useMemo } from 'react';
import { computeTextDiff, DiffSegment } from '@/lib/utils/textDiff';

interface EnhancedDiffViewerProps {
    originalText: string;
    newText: string;
    showLineNumbers?: boolean;
}

export function EnhancedDiffViewer({
    originalText,
    newText,
    showLineNumbers = true
}: EnhancedDiffViewerProps) {
    const segments = useMemo(() => {
        return computeTextDiff(originalText || '', newText || '');
    }, [originalText, newText]);

    const stats = useMemo(() => {
        return {
            added: segments.filter(s => s.type === 'added').length,
            removed: segments.filter(s => s.type === 'deleted').length,
            unchanged: segments.filter(s => s.type === 'unchanged').length
        };
    }, [segments]);

    let lineNumber = 1;

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
                <span className="text-green-400">+{stats.added} additions</span>
                <span className="text-red-400">-{stats.removed} deletions</span>
                <span className="text-white/60">{stats.unchanged} unchanged</span>
            </div>

            {/* Diff Content */}
            <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <tbody>
                            {segments.map((segment, idx) => {
                                const isRemoved = segment.type === 'deleted';
                                const isAdded = segment.type === 'added';
                                const isUnchanged = segment.type === 'unchanged';

                                const currentLineNumber = isRemoved ? null : lineNumber++;
                                if (isRemoved) lineNumber = lineNumber; // Don't increment for removed lines

                                return (
                                    <tr
                                        key={idx}
                                        className={`
                      ${isAdded ? 'bg-green-500/10 border-l-2 border-l-green-500' : ''}
                      ${isRemoved ? 'bg-red-500/10 border-l-2 border-l-red-500' : ''}
                      ${isUnchanged ? 'bg-transparent' : ''}
                    `}
                                    >
                                        {showLineNumbers && (
                                            <>
                                                <td className="px-3 py-1 text-xs text-white/40 font-mono border-r border-white/10 text-right select-none">
                                                    {isRemoved ? '-' : currentLineNumber}
                                                </td>
                                                <td className="px-3 py-1 text-xs text-white/40 font-mono border-r border-white/10 text-right select-none">
                                                    {isAdded ? currentLineNumber : '-'}
                                                </td>
                                            </>
                                        )}
                                        <td className="px-4 py-1 font-mono text-sm">
                                            <span
                                                className={`
                          ${isAdded ? 'text-green-300' : ''}
                          ${isRemoved ? 'text-red-300 line-through' : ''}
                          ${isUnchanged ? 'text-white/90' : ''}
                        `}
                                            >
                                                {segment.text}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <style jsx>{`
        tr:hover {
          background-color: rgba(255, 255, 255, 0.05) !important;
        }
      `}</style>
        </div>
    );
}

