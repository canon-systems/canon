'use client';

import { useMemo } from 'react';
import { Plus, Minus } from 'lucide-react';
import { marked } from 'marked';

interface DiagramDiffViewerProps {
  addedNodes: Array<any>;
  removedNodes: Array<any>;
  addedEdges: Array<any>;
  removedEdges: Array<any>;
  currentDiagramMarkdown?: string;
}

export function DiagramDiffViewer({
  addedNodes,
  removedNodes,
  addedEdges,
  removedEdges,
  currentDiagramMarkdown
}: DiagramDiffViewerProps) {
  const hasChanges = useMemo(() => {
    return addedNodes.length > 0 || removedNodes.length > 0 || 
           addedEdges.length > 0 || removedEdges.length > 0;
  }, [addedNodes, removedNodes, addedEdges, removedEdges]);

  if (!hasChanges && !currentDiagramMarkdown) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-8 text-center text-white/60">
        No diagram changes detected
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Changes Summary */}
      {(addedNodes.length > 0 || removedNodes.length > 0 || addedEdges.length > 0 || removedEdges.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {/* Added */}
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="h-4 w-4 text-green-400" />
              <h3 className="font-semibold text-green-300">Added</h3>
            </div>
            
            {addedNodes.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-green-200/70 mb-2">Nodes ({addedNodes.length}):</div>
                <div className="space-y-1">
                  {addedNodes.map((node, idx) => (
                    <div key={idx} className="text-sm text-green-200 bg-green-500/20 rounded px-2 py-1">
                      {node.name || node.icon} {node.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {addedEdges.length > 0 && (
              <div>
                <div className="text-xs text-green-200/70 mb-2">Connections ({addedEdges.length}):</div>
                <div className="space-y-1">
                  {addedEdges.map((edge, idx) => (
                    <div key={idx} className="text-sm text-green-200 bg-green-500/20 rounded px-2 py-1">
                      {edge.from} → {edge.to} {edge.label && `(${edge.label})`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {addedNodes.length === 0 && addedEdges.length === 0 && (
              <div className="text-sm text-green-200/60">No additions</div>
            )}
          </div>

          {/* Removed */}
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Minus className="h-4 w-4 text-red-400" />
              <h3 className="font-semibold text-red-300">Removed</h3>
            </div>
            
            {removedNodes.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-red-200/70 mb-2">Nodes ({removedNodes.length}):</div>
                <div className="space-y-1">
                  {removedNodes.map((node, idx) => (
                    <div key={idx} className="text-sm text-red-200 bg-red-500/20 rounded px-2 py-1 line-through">
                      {node.name || node.icon} {node.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {removedEdges.length > 0 && (
              <div>
                <div className="text-xs text-red-200/70 mb-2">Connections ({removedEdges.length}):</div>
                <div className="space-y-1">
                  {removedEdges.map((edge, idx) => (
                    <div key={idx} className="text-sm text-red-200 bg-red-500/20 rounded px-2 py-1 line-through">
                      {edge.from} → {edge.to} {edge.label && `(${edge.label})`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {removedNodes.length === 0 && removedEdges.length === 0 && (
              <div className="text-sm text-red-200/60">No removals</div>
            )}
          </div>
        </div>
      )}

      {/* Current Diagram */}
      {currentDiagramMarkdown && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <h3 className="font-semibold text-white mb-3">Current Diagram</h3>
          <div
            className="prose prose-invert max-w-none text-white"
            dangerouslySetInnerHTML={{
              __html: marked.parse(currentDiagramMarkdown) || '<p class="text-white/50">No diagram content</p>'
            }}
          />
        </div>
      )}
    </div>
  );
}

