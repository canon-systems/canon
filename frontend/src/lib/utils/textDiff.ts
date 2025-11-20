/**
 * Simple text diff utility for highlighting changes
 * Compares two text strings and returns HTML with highlights
 */

export interface DiffSegment {
    type: 'added' | 'deleted' | 'unchanged';
    text: string;
}

/**
 * Improved line-based diff algorithm using a better matching strategy
 * Compares two texts line by line and marks additions/deletions
 */
export function computeTextDiff(oldText: string, newText: string): DiffSegment[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    
    // Use a more sophisticated diff algorithm
    const segments: DiffSegment[] = [];
    
    // Build a map of line positions for faster lookup
    const oldLineMap = new Map<string, number[]>();
    oldLines.forEach((line, idx) => {
        if (!oldLineMap.has(line)) {
            oldLineMap.set(line, []);
        }
        oldLineMap.get(line)!.push(idx);
    });
    
    let oldIndex = 0;
    let newIndex = 0;
    
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
            // Lines match exactly
            segments.push({ type: 'unchanged', text: oldLines[oldIndex] });
            oldIndex++;
            newIndex++;
        } else {
            // Lines differ - look ahead to find the best match
            const oldLine = oldLines[oldIndex];
            const newLine = newLines[newIndex];
            
            // Check if new line exists in remaining old lines
            const newLinePositions = oldLineMap.get(newLine) || [];
            const nextOldMatch = newLinePositions.find(pos => pos > oldIndex);
            
            // Check if old line exists in remaining new lines
            const nextNewMatch = newLines.slice(newIndex + 1).indexOf(oldLine);
            
            if (nextOldMatch !== undefined && (nextNewMatch < 0 || (nextOldMatch - oldIndex) <= (nextNewMatch + 1))) {
                // Old line was deleted (new line appears later in old)
                segments.push({ type: 'deleted', text: oldLines[oldIndex] });
                oldIndex++;
            } else if (nextNewMatch >= 0) {
                // New line was added (old line appears later in new)
                segments.push({ type: 'added', text: newLines[newIndex] });
                newIndex++;
            } else {
                // Both lines changed - show both
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
 * Convert diff segments to HTML with improved styling
 */
export function diffToHtml(segments: DiffSegment[]): string {
    return segments
        .map((segment) => {
            const escaped = escapeHtml(segment.text);
            if (segment.type === 'added') {
                // Use a cleaner highlight style for additions
                return `<span class="diff-added">${escaped}</span>`;
            } else if (segment.type === 'deleted') {
                // Use a cleaner highlight style for deletions
                return `<span class="diff-deleted">${escaped}</span>`;
            } else {
                return escaped;
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

