'use client';

import { useState } from 'react';
import { Send, FileText, Code, Edit, Loader2, GitCompare } from 'lucide-react';
import { TemplateSelector } from '@/components/TemplateSelector';

export type ViewMode = 'rendered' | 'raw' | 'editor' | 'diff' | 'diagram-diff';

interface ReviewPanelProps {
  docId: string;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onPublish: (provider: string, workspaceInfo?: any) => Promise<void>;
  isProcessing?: boolean;
  availableProviders?: Array<{ provider: string; name: string }>;
  onApplyTemplate?: (templateId: string) => Promise<void>;
  onViewDiff?: () => void;
  onViewDiagramDiff?: () => void;
}

export function ReviewPanel({
  currentView,
  onViewChange,
  onPublish,
  isProcessing = false,
  availableProviders = [],
  onApplyTemplate,
  onViewDiff,
  onViewDiagramDiff
}: ReviewPanelProps) {
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');

  const handlePublish = async () => {
    if (!selectedProvider && availableProviders.length > 0) {
      setSelectedProvider(availableProviders[0].provider);
    }
    await onPublish(selectedProvider || 'notion');
    setShowPublishDialog(false);
  };

  return (
    <div className="space-y-4">
      {/* Template and Diff Actions */}
      {(onApplyTemplate || onViewDiff || onViewDiagramDiff) && (
        <div className="space-y-2 pb-4 border-b border-white/10">
          {onApplyTemplate && (
            <div className="w-full">
              <TemplateSelector
                onApply={onApplyTemplate}
                disabled={isProcessing}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            {onViewDiff && (
              <button
                onClick={() => {
                  onViewChange('diff');
                  onViewDiff?.();
                }}
                disabled={isProcessing}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none ${
                  currentView === 'diff'
                    ? 'border-blue-500/70 bg-blue-500/30 text-blue-200 shadow-lg shadow-blue-500/20'
                    : 'border-blue-500/50 bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 hover:border-blue-500/70 hover:shadow-blue-500/20'
                }`}
              >
                <GitCompare className="h-4 w-4" />
                View Diff
              </button>
            )}
            {onViewDiagramDiff && (
              <button
                onClick={() => {
                  onViewChange('diagram-diff');
                  onViewDiagramDiff?.();
                }}
                disabled={isProcessing}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none ${
                  currentView === 'diagram-diff'
                    ? 'border-purple-500/70 bg-purple-500/30 text-purple-200 shadow-lg shadow-purple-500/20'
                    : 'border-purple-500/50 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 hover:border-purple-500/70 hover:shadow-purple-500/20'
                }`}
              >
                <GitCompare className="h-4 w-4" />
                View Diagram Diff
              </button>
            )}
          </div>
        </div>
      )}

      {/* View Switcher */}
      <div className="flex items-center gap-1 border-b border-white/10 bg-white/5 rounded-t-lg p-1">
        <button
          onClick={() => onViewChange('rendered')}
          disabled={isProcessing}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-md ${
            currentView === 'rendered'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10'
              : 'border border-transparent text-white/60 hover:text-white/90 hover:bg-white/10 hover:border-white/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <FileText className="h-4 w-4" />
          Rendered
        </button>
        <button
          onClick={() => onViewChange('raw')}
          disabled={isProcessing}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-md ${
            currentView === 'raw'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10'
              : 'border border-transparent text-white/60 hover:text-white/90 hover:bg-white/10 hover:border-white/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Code className="h-4 w-4" />
          Raw
        </button>
        <button
          onClick={() => onViewChange('editor')}
          disabled={isProcessing}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-md ${
            currentView === 'editor'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10'
              : 'border border-transparent text-white/60 hover:text-white/90 hover:bg-white/10 hover:border-white/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Edit className="h-4 w-4" />
          Editor
        </button>
      </div>

      {/* Publish Button */}
      <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
        <button
          onClick={() => setShowPublishDialog(true)}
          disabled={isProcessing}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-purple-600 hover:to-pink-600 hover:shadow-lg hover:shadow-purple-500/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none shadow-lg shadow-purple-500/20"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Publishing...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Publish
            </>
          )}
        </button>
      </div>

      {/* Publish Dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Publish to Knowledge Base</h3>
            <p className="text-sm text-white/70">Select a knowledge base provider to publish to:</p>
            {availableProviders.length > 0 ? (
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none focus:border-white/40"
              >
                {availableProviders.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-yellow-300">No knowledge base connections available. Please connect one first.</p>
            )}
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowPublishDialog(false)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:shadow-md"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={isProcessing || availableProviders.length === 0}
                className="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-purple-600 hover:to-pink-600 hover:shadow-lg hover:shadow-purple-500/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Publishing...
                  </>
                ) : (
                  'Publish'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

