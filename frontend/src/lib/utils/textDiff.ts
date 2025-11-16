/**
 * Simple text diff utility for highlighting changes
 * Compares two text strings and returns HTML with highlights
 */

export interface DiffSegment {
    type: 'added' | 'deleted' | 'unchanged';
    text: string;
}

/**
 * Simple line-based diff algorithm
 * Compares two texts line by line and marks additions/deletions
 */
export function computeTextDiff(oldText: string, newText: string): DiffSegment[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    
    const segments: DiffSegment[] = [];
    let oldIndex = 0;
    let newIndex = 0;
    
    // Simple longest common subsequence approach
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
        if (oldIndex >= oldLines.length) {
            // Only new lines remain
            segments.push({ type: 'added', text: newLines[newIndex] });
            newIndex++;
        } else if (newIndex >= newLines.length) {
            // Only old lines remain
            segments.push({ type: 'deleted', text: oldLines[oldIndex] });
            oldIndex++;
        } else if (oldLines[oldIndex] === newLines[newIndex]) {
            // Lines match
            segments.push({ type: 'unchanged', text: oldLines[oldIndex] });
            oldIndex++;
            newIndex++;
        } else {
            // Lines differ - check if new line appears later in old
            const nextMatchInOld = oldLines.slice(oldIndex + 1).indexOf(newLines[newIndex]);
            const nextMatchInNew = newLines.slice(newIndex + 1).indexOf(oldLines[oldIndex]);
            
            if (nextMatchInOld >= 0 && (nextMatchInNew < 0 || nextMatchInOld < nextMatchInNew)) {
                // Old line was deleted
                segments.push({ type: 'deleted', text: oldLines[oldIndex] });
                oldIndex++;
            } else if (nextMatchInNew >= 0) {
                // New line was added
                segments.push({ type: 'added', text: newLines[newIndex] });
                newIndex++;
            } else {
                // Both lines changed
                segments.push({ type: 'deleted', text: oldLines[oldIndex] });
                segments.push({ type: 'added', text: newLines[newIndex] });
                oldIndex++;
                newIndex++;
            }
        }
    }
    
    return segments;
}

/**
 * Convert diff segments to HTML with styling
 */
export function diffToHtml(segments: DiffSegment[]): string {
    return segments
        .map((segment) => {
            if (segment.type === 'added') {
                return `<span class="diff-added bg-green-500/20 text-green-300 px-1 rounded">${escapeHtml(segment.text)}</span>`;
            } else if (segment.type === 'deleted') {
                return `<span class="diff-deleted bg-red-500/20 text-red-300 line-through px-1 rounded">${escapeHtml(segment.text)}</span>`;
            } else {
                return escapeHtml(segment.text);
            }
        })
        .join('\n');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

