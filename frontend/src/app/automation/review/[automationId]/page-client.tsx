'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Eye,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Check,
  X,
  ExternalLink
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface AutomationResult {
  id: string;
  rule_id: string;
  repo_id: string;
  status: string;
  significance_analysis: {
    filesAnalyzed: number;
    significantChanges: number;
    confidence: 'high' | 'medium' | 'low';
  };
  generated_documents: Array<{
    id: string;
    title: string;
    changes: 'new' | 'updated' | 'unchanged';
  }>;
  generated_diagrams: Array<{
    id: string;
    title: string;
    changes: 'new' | 'updated' | 'unchanged';
  }>;
  actions_taken: string[];
  errors: string[];
  preview_url?: string;
  created_at: string;
}

interface AutomationReviewPageClientProps {
  automationId: string;
}

export default function AutomationReviewPageClient({
  automationId
}: AutomationReviewPageClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [result, setResult] = useState<AutomationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [selectedDiagrams, setSelectedDiagrams] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAutomationResult();
  }, [automationId]);

  const loadAutomationResult = async () => {
    try {
      const response = await fetch(`/api/automation/results/${automationId}`);
      if (!response.ok) {
        throw new Error('Failed to load automation result');
      }
      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!result) return;

    setApproving(true);
    try {
      const approvedItems = {
        documents: Array.from(selectedDocuments),
        diagrams: Array.from(selectedDiagrams),
      };

      const response = await fetch(`/api/automation/results/${automationId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedItems,
          publishTargets: [], // TODO: Add publish targets
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve automation results');
      }

      // Redirect back to automation page
      router.push('/automation');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  };

  const toggleDocument = (docId: string) => {
    const newSelected = new Set(selectedDocuments);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocuments(newSelected);
  };

  const toggleDiagram = (diagramId: string) => {
    const newSelected = new Set(selectedDiagrams);
    if (newSelected.has(diagramId)) {
      newSelected.delete(diagramId);
    } else {
      newSelected.add(diagramId);
    }
    setSelectedDiagrams(newSelected);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto mb-4" />
            <p className="text-white/60">Loading automation results...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-4" />
            <p className="text-red-200">{error || 'Automation result not found'}</p>
            <Link
              href="/automation"
              className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Back to Automation
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/automation"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Automation
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-3 border border-blue-500/30">
              <Eye className="h-6 w-6 text-blue-300" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Review Automation Results</h1>
              <p className="text-white/60 mt-1">
                Review and approve the content generated by your automation rule
              </p>
            </div>
          </div>
        </div>

        {/* Status Overview */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Automation Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-white/60">Files Analyzed:</span>
                  <div className="text-white font-semibold">{result.significance_analysis.filesAnalyzed}</div>
                </div>
                <div>
                  <span className="text-white/60">Significant Changes:</span>
                  <div className="text-white font-semibold">{result.significance_analysis.significantChanges}</div>
                </div>
                <div>
                  <span className="text-white/60">Confidence:</span>
                  <div className={`font-semibold ${
                    result.significance_analysis.confidence === 'high' ? 'text-green-400' :
                    result.significance_analysis.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {result.significance_analysis.confidence.toUpperCase()}
                  </div>
                </div>
                <div>
                  <span className="text-white/60">Completed:</span>
                  <div className="text-white font-semibold">
                    {new Date(result.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-400" />
              <span className="text-blue-400 font-medium">Ready for Review</span>
            </div>
          </div>
        </div>

        {/* Generated Content */}
        <div className="space-y-6">
          {/* Documents */}
          {result.generated_documents.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="p-6 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents ({result.generated_documents.length})
                </h3>
              </div>
              <div className="divide-y divide-white/10">
                {result.generated_documents.map((doc) => (
                  <div key={doc.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedDocuments.has(doc.id)}
                        onChange={() => toggleDocument(doc.id)}
                        className="h-4 w-4 rounded border-white/30 bg-black/60 text-blue-500"
                      />
                      <div>
                        <div className="text-white font-medium">{doc.title}</div>
                        <div className="text-sm text-white/60 capitalize">{doc.changes}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.open(`/edit/${doc.id}`, '_blank')}
                        className="px-3 py-1 text-sm bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagrams */}
          {result.generated_diagrams.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="p-6 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Diagrams ({result.generated_diagrams.length})
                </h3>
              </div>
              <div className="divide-y divide-white/10">
                {result.generated_diagrams.map((diagram) => (
                  <div key={diagram.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedDiagrams.has(diagram.id)}
                        onChange={() => toggleDiagram(diagram.id)}
                        className="h-4 w-4 rounded border-white/30 bg-black/60 text-blue-500"
                      />
                      <div>
                        <div className="text-white font-medium">{diagram.title}</div>
                        <div className="text-sm text-white/60 capitalize">{diagram.changes}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.open(`/architecture/${diagram.id}`, '_blank')}
                        className="px-3 py-1 text-sm bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex justify-between items-center">
          <div className="text-sm text-white/60">
            {selectedDocuments.size + selectedDiagrams.size} items selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/automation')}
              className="px-6 py-2 border border-white/20 text-white/80 rounded-lg hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={approving || (selectedDocuments.size === 0 && selectedDiagrams.size === 0)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {approving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Approve & Publish Selected
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
