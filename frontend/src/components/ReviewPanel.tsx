'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Send, FileText, Code, Edit, Loader2, GitCompare } from 'lucide-react';
import { TemplateSelector } from '@/components/TemplateSelector';

export type ViewMode = 'rendered' | 'raw' | 'editor' | 'diff' | 'diagram-diff';

interface ReviewPanelProps {
  docId: string;
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onApprove: () => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onApproveAndPublish: (provider: string, workspaceInfo?: any) => Promise<void>;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'published';
  isProcessing?: boolean;
  availableProviders?: Array<{ provider: string; name: string }>;
  onApplyTemplate?: (templateId: string) => Promise<void>;
  onViewDiff?: () => void;
  onViewDiagramDiff?: () => void;
}

export function ReviewPanel({
  currentView,
  onViewChange,
  onApprove,
  onReject,
  onApproveAndPublish,
  approvalStatus = 'pending',
  isProcessing = false,
  availableProviders = [],
  onApplyTemplate,
  onViewDiff,
  onViewDiagramDiff
}: ReviewPanelProps) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');

  const handleReject = async () => {
    await onReject(rejectReason || undefined);
    setShowRejectDialog(false);
    setRejectReason('');
  };

  const handleApproveAndPublish = async () => {
    if (!selectedProvider && availableProviders.length > 0) {
      setSelectedProvider(availableProviders[0].provider);
    }
    await onApproveAndPublish(selectedProvider || 'notion');
    setShowPublishDialog(false);
  };

  const getStatusBadge = () => {
    switch (approvalStatus) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-xs font-medium text-green-300 border border-green-500/30">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300 border border-red-500/30">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        );
      case 'published':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-300 border border-blue-500/30">
            <Send className="h-3 w-3" />
            Published
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-medium text-yellow-300 border border-yellow-500/30">
            Pending Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <div>{getStatusBadge()}</div>
      </div>

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

      {/* Action Buttons */}
      {approvalStatus === 'pending' && (
        <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
          <button
            onClick={onApprove}
            disabled={isProcessing}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-500/20 border border-green-500/40 px-4 py-2.5 text-sm font-medium text-green-200 transition-all hover:bg-green-500/30 hover:border-green-500/60 hover:shadow-lg hover:shadow-green-500/20 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Approving...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </>
            )}
          </button>

          <button
            onClick={() => setShowRejectDialog(true)}
            disabled={isProcessing}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/20 border border-red-500/40 px-4 py-2.5 text-sm font-medium text-red-200 transition-all hover:bg-red-500/30 hover:border-red-500/60 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>

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
                Approve & Publish
              </>
            )}
          </button>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Reject Document</h3>
            <p className="text-sm text-white/70">Optionally provide a reason for rejection:</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40 min-h-[100px]"
            />
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason('');
                }}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:border-white/30 hover:shadow-md"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="rounded-lg bg-red-500/20 border border-red-500/40 px-4 py-2 text-sm font-medium text-red-200 transition-all hover:bg-red-500/30 hover:border-red-500/60 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Rejecting...
                  </>
                ) : (
                  'Reject'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Approve & Publish</h3>
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
                onClick={handleApproveAndPublish}
                disabled={isProcessing || availableProviders.length === 0}
                className="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-purple-600 hover:to-pink-600 hover:shadow-lg hover:shadow-purple-500/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Publishing...
                  </>
                ) : (
                  'Approve & Publish'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

