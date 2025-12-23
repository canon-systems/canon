'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, CheckCircle2, RefreshCw, Clock, FileText, GitCompare, X, Send, ExternalLink, ChevronDown, Github, GitBranch, Search, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DocumentConfiguration } from '@/components/DocumentConfiguration';
import type { DocumentStructureConfig } from '@/components/DocumentStructure';
import { RichTextEditor } from '@/components/RichTextEditor';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { ReviewPanel, ViewMode } from '@/components/ReviewPanel';
import { EnhancedDiffViewer } from '@/components/EnhancedDiffViewer';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { buildFileChangeUrl } from '@/lib/utils/repoUrls';

interface Submission {
  id: string;
  created_date: string;
  title: string;
  markdown: string;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  input_type: 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code';
  input_content: string;
  summary: string | null;
  source_meta?: any;
  code_snapshot?: any;
  is_outdated: boolean;
  selected_files?: string[] | null;
}

interface EditDetailPageClientProps {
  submission: Submission;
}

const turndown = new TurndownService();

export function EditDetailPageClient({ submission: initialSubmission }: EditDetailPageClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState(initialSubmission.title);
  const [markdown, setMarkdown] = useState(initialSubmission.markdown);
  // Convert markdown to HTML for RichTextEditor
  const [html, setHtml] = useState<string>(() => {
    if (!initialSubmission.markdown) return '<p></p>';
    // Clean up markdown - remove any wrapping code blocks that might have been added
    let cleanMarkdown = initialSubmission.markdown.trim();
    // If the entire content is wrapped in a code block, unwrap it
    if (cleanMarkdown.startsWith('```') && cleanMarkdown.endsWith('```')) {
      const lines = cleanMarkdown.split('\n');
      if (lines.length > 2 && lines[0].startsWith('```')) {
        // Remove first and last lines (code block markers)
        cleanMarkdown = lines.slice(1, -1).join('\n');
      }
    }
    const parsed = marked.parse(cleanMarkdown);
    return typeof parsed === 'string' ? parsed : '<p></p>';
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  // Outdated files check state
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [outdatedFiles, setOutdatedFiles] = useState<Array<{ file_path: string; old_hash: string; new_hash: string }>>([]);
  const [renamedFiles, setRenamedFiles] = useState<Array<{ old_path: string; new_path: string }>>([]);
  const [isOutdated, setIsOutdated] = useState(initialSubmission.is_outdated || false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [showChangedFiles, setShowChangedFiles] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [dismissedRenameBanner, setDismissedRenameBanner] = useState(false);

  // Tracked files management state
  const [trackedFiles, setTrackedFiles] = useState<string[]>(
    initialSubmission.selected_files ||
    initialSubmission.source_meta?.selected_files ||
    []
  );
  const [updatingFiles, setUpdatingFiles] = useState(false);
  const [fileUpdateMsg, setFileUpdateMsg] = useState('');
  const [fileUpdateErr, setFileUpdateErr] = useState('');
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [availableRepoFiles, setAvailableRepoFiles] = useState<string[]>([]); // Array of file paths (strings)
  const [loadingRepoFiles, setLoadingRepoFiles] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [selectedFilesToAdd, setSelectedFilesToAdd] = useState<Set<string>>(new Set());

  // Filter files based on search query
  const filteredFiles = availableRepoFiles.filter(filePath =>
    filePath.toLowerCase().includes(fileSearchQuery.toLowerCase())
  );

  // Multi-select helpers
  function toggleFileSelection(filePath: string) {
    const next = new Set(selectedFilesToAdd);
    if (next.has(filePath)) {
      next.delete(filePath);
    } else {
      next.add(filePath);
    }
    setSelectedFilesToAdd(next);
  }

  function selectAllFiltered() {
    const next = new Set(selectedFilesToAdd);
    filteredFiles.forEach(filePath => next.add(filePath));
    setSelectedFilesToAdd(next);
  }

  function clearAllFiltered() {
    const next = new Set(selectedFilesToAdd);
    filteredFiles.forEach(filePath => next.delete(filePath));
    setSelectedFilesToAdd(next);
  }

  function addSelectedFiles() {
    const newFiles = [...trackedFiles, ...Array.from(selectedFilesToAdd)];
    handleUpdateTrackedFiles(newFiles);
    setSelectedFilesToAdd(new Set());
    setShowFileBrowser(false);
  }

  // Prompt customization state
  const [promptConfig, setPromptConfig] = useState(
    initialSubmission.source_meta?.llm_prompt_config || {
      personality: 'default',
      style: 'default',
      perspective: 'default',
      audience: 'technical',
      customInstructions: '',
      temperature: 0.3
    }
  );
  const [savingPromptConfig, setSavingPromptConfig] = useState(false);
  const [promptConfigMsg, setPromptConfigMsg] = useState('');
  const [promptConfigErr, setPromptConfigErr] = useState('');

  // Document structure configuration state
  const [structureConfig, setStructureConfig] = useState<DocumentStructureConfig>(
    initialSubmission.source_meta?.document_structure || {
      sections: [],
      includeTableOfContents: false,
    }
  );

  // Configuration save confirmation dialog
  const [showConfigConfirm, setShowConfigConfirm] = useState(false);

  // Push to knowledge base state
  const [showPushModal, setShowPushModal] = useState(false);
  const [connections, setConnections] = useState<Array<{ provider: string; connection_id: string; metadata?: any }>>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState('');
  const [pushSuccess, setPushSuccess] = useState<{ provider: string; url?: string } | null>(null);

  // Regenerate modal state
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [filesChanged, setFilesChanged] = useState<{ added: string[]; removed: string[] } | null>(null);

  // Push configuration state
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [pushTitle, setPushTitle] = useState(title || 'Untitled');
  const [selectedParent, setSelectedParent] = useState<{ id: string; type: string; title: string } | null>(null);
  const [availableResources, setAvailableResources] = useState<Array<{ id: string; type: string; title: string; url?: string }>>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  // Review panel state
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [diffData, setDiffData] = useState<any>(null);
  const [originalMarkdown, setOriginalMarkdown] = useState(initialSubmission.markdown);

  const isGitRepo = initialSubmission.input_type === 'github_repo' || initialSubmission.input_type === 'github_repo_directory';

  const statusNotice =
    initialSubmission.status === 'processing'
      ? 'Note: This submission is still processing.'
      : initialSubmission.error_message
        ? `Last run failed: ${initialSubmission.error_message}`
        : '';

  // Handle editor content changes
  function handleEditorChange(data: { html: string; json: any; text: string }) {
    setHtml(data.html);
    // Convert HTML back to markdown for saving
    setMarkdown(turndown.turndown(data.html));
  }

  // Cursor change handler (no longer needed for preview sync, but keeping for potential future use)
  function handleCursorChange(ratio: number) {
    // Preview pane removed - RichTextEditor already shows formatted content
  }

  async function saveChanges() {
    setSaveErr('');
    setSaveMsg('');
    setSaving(true);
    try {
      const { error } = await supabase
        .from('documents')
        .update({
          title: title || 'Untitled',
          content: markdown, // Store markdown as content
          updated_at: new Date().toISOString()
        })
        .eq('id', initialSubmission.id);

      if (error) throw new Error(error.message);
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function showConfigSaveConfirm() {
    setShowConfigConfirm(true);
  }

  async function saveConfiguration() {
    setPromptConfigErr('');
    setPromptConfigMsg('');
    setSavingPromptConfig(true);
    setShowConfigConfirm(false);

    try {
      // Save configuration to the document
      const configuration = {
        personality: promptConfig.personality,
        style: promptConfig.style,
        perspective: promptConfig.perspective,
        audience: promptConfig.audience,
        customInstructions: promptConfig.customInstructions,
        temperature: promptConfig.temperature,
        documentStructure: structureConfig,
        model: initialSubmission.source_meta?.model || 'gpt-4o'
      };

      const { error } = await supabase
        .from('documents')
        .update({
          configuration: configuration,
          updated_at: new Date().toISOString()
        })
        .eq('id', initialSubmission.id);

      if (error) throw new Error(error.message);
      setPromptConfigMsg('Configuration settings saved. These will be used for future regenerations.');
      setTimeout(() => setPromptConfigMsg(''), 3000);
      return; // Return success
    } catch (e) {
      const errorMsg = String(e);
      setPromptConfigErr(errorMsg);
      setTimeout(() => setPromptConfigErr(''), 5000);
      throw e; // Re-throw so PromptCustomizer can handle it
    } finally {
      setSavingPromptConfig(false);
    }
  }


  async function checkForUpdates() {
    if (!isGitRepo) return;

    setCheckingUpdates(true);
    setOutdatedFiles([]);
    setIsOutdated(false);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.warn('No authenticated user available for update check');
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        console.warn('No session token available for update check');
        return;
      }

      const res = await fetch('/api/docs/check-updates', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          submissionId: initialSubmission.id
        })
      });

      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        setLastCheckedAt(new Date());
        if (result.outdated) {
          setIsOutdated(true);
          setOutdatedFiles(result.changedFiles || []);
          setDismissedBanner(false); // Reset dismissal when new outdated files are detected
        } else {
          setIsOutdated(false);
          setOutdatedFiles([]);
        }

        // Handle renamed files
        if (result.renamedFiles && result.renamedFiles.length > 0) {
          setRenamedFiles(result.renamedFiles);
          setDismissedRenameBanner(false); // Reset dismissal when new renames detected

          // Refresh tracked files list to show updated paths
          const { data: updatedDocumentFiles } = await supabase
            .from('document_files')
            .select('file_path')
            .eq('document_id', initialSubmission.id);

          if (updatedDocumentFiles && updatedDocumentFiles.length > 0) {
            const updatedFiles = updatedDocumentFiles.map(df => df.file_path);
            setTrackedFiles(updatedFiles);
          }
        } else {
          setRenamedFiles([]);
        }

        router.refresh();
      } else {
        console.error('Check updates failed:', result);
      }
    } catch (e) {
      console.error('Failed to check for updates:', e);
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function loadAvailableRepoFiles() {
    if (!isGitRepo) return;

    const repoUrl = initialSubmission.source_meta?.repoUrl;
    const branch = initialSubmission.source_meta?.branch || 'main';

    if (!repoUrl) {
      setFileUpdateErr('Repository URL not found. Please ensure this document is associated with a connected repository.');
      return;
    }

    setLoadingRepoFiles(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`/api/github/list?repoUrl=${encodeURIComponent(repoUrl)}&branch=${encodeURIComponent(branch)}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load repository files');
      }

      const data = await response.json();
      const allFiles = data.files || [];
      // Filter out already tracked files (files are objects with path property)
      const untrackedFiles = allFiles
        .filter((f: { path: string; size: number }) => !trackedFiles.includes(f.path))
        .map((f: { path: string; size: number }) => f.path);
      setAvailableRepoFiles(untrackedFiles);
    } catch (err: any) {
      console.error('Failed to load repo files:', err);
      setFileUpdateErr(err.message || 'Failed to load repository files');
    } finally {
      setLoadingRepoFiles(false);
    }
  }

  async function handleUpdateTrackedFiles(newFiles: string[]) {
    setUpdatingFiles(true);
    setFileUpdateMsg('');
    setFileUpdateErr('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/docs/update-tracked-files', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          submissionId: initialSubmission.id,
          selected_files: newFiles,
          regenerate: false
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update tracked files');
      }

      setTrackedFiles(newFiles);
      setFileUpdateMsg('Tracked files updated. Documentation will need to be regenerated to reflect changes.');

      // Show modal to regenerate if files changed
      if (result.files_changed) {
        // Calculate added and removed files
        const oldFilesSet = new Set(trackedFiles);
        const newFilesSet = new Set(newFiles);
        const added = newFiles.filter(f => !oldFilesSet.has(f));
        const removed = trackedFiles.filter(f => !newFilesSet.has(f));

        setFilesChanged({ added, removed });
        setShowRegenerateModal(true);
      }
    } catch (err: any) {
      setFileUpdateErr(err.message || 'Failed to update tracked files');
    } finally {
      setUpdatingFiles(false);
    }
  }

  // Load connections when push modal opens
  async function loadConnections() {
    setLoadingConnections(true);
    try {
      const response = await fetch('/api/integrations/list');
      if (!response.ok) throw new Error('Failed to load connections');
      const data = await response.json();
      // Filter for knowledge base providers (notion, confluence, coda)
      const kbConnections = (data.connections || []).filter(
        (c: any) => ['notion', 'confluence', 'coda'].includes(c.provider) && c.status === 'active'
      );
      setConnections(kbConnections);
    } catch (err: any) {
      setPushError(err.message || 'Failed to load connections');
    } finally {
      setLoadingConnections(false);
    }
  }

  function openPushModal() {
    setShowPushModal(true);
    setPushError('');
    setPushSuccess(null);
    setSelectedProvider(null);
    setPushTitle(title || 'Untitled');
    setSelectedParent(null);
    setAvailableResources([]);
    loadConnections();
  }

  function closePushModal() {
    setShowPushModal(false);
    setPushError('');
    setPushSuccess(null);
    setSelectedProvider(null);
    setPushTitle(title || 'Untitled');
    setSelectedParent(null);
    setAvailableResources([]);
  }

  function closeRegenerateModal() {
    setShowRegenerateModal(false);
    setFilesChanged(null);
  }

  function handleRegenerate() {
    closeRegenerateModal();
    router.push(`/edit/${initialSubmission.id}/regenerate`);
  }

  async function loadResourcesForProvider(provider: string) {
    setLoadingResources(true);
    setAvailableResources([]);
    setSelectedParent(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/push/resources?provider=${provider}`, {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.detail || 'Failed to load resources');
      }

      setAvailableResources(result.resources || []);
    } catch (err: any) {
      console.error('Failed to load resources:', err);
      setPushError(`Failed to load ${getProviderDisplayName(provider)} resources: ${err.message}`);
    } finally {
      setLoadingResources(false);
    }
  }

  function handleProviderSelect(provider: string) {
    setSelectedProvider(provider);
    setSelectedParent(null);
    loadResourcesForProvider(provider);
  }

  async function pushToKnowledgeBase() {
    if (!selectedProvider) {
      setPushError('Please select a knowledge base provider');
      return;
    }

    if (!pushTitle.trim()) {
      setPushError('Please enter a title for the document');
      return;
    }

    setPushing(true);
    setPushError('');
    setPushSuccess(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Build workspace info from selected parent
      let workspaceInfo = null;
      if (selectedParent) {
        if (selectedProvider === 'notion') {
          workspaceInfo = {
            provider: selectedProvider,
            resourceId: selectedParent.id,
            metadata: {
              type: selectedParent.type,
              ...(selectedParent.type === 'database' ? { database_id: selectedParent.id } : {})
            }
          };
        } else if (selectedProvider === 'confluence') {
          workspaceInfo = {
            provider: selectedProvider,
            resourceId: selectedParent.id, // space key
            metadata: { spaceKey: selectedParent.id }
          };
        } else if (selectedProvider === 'coda') {
          workspaceInfo = {
            provider: selectedProvider,
            resourceId: selectedParent.id, // doc id
            metadata: {}
          };
        }
      }

      const response = await fetch(`/api/push/${selectedProvider}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          docId: initialSubmission.id,
          title: pushTitle,
          markdown: markdown,
          workspaceInfo: workspaceInfo,
          createNew: true
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // Provide more helpful error messages
        const errorMsg = result.detail || result.error || 'Failed to push';
        if (errorMsg.includes('parent page') || errorMsg.includes('database')) {
          throw new Error(
            `${errorMsg}. Please select a parent page or database.`
          );
        }
        throw new Error(errorMsg);
      }

      // Update document timestamp
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          updated_at: new Date().toISOString()
        })
        .eq('id', initialSubmission.id);

      if (updateError) throw updateError;

      // Extract URL from response - API should now always provide it
      const resourceUrl = result.url || result.workspace_info?.metadata?.url;

      setPushSuccess({
        provider: selectedProvider,
        url: resourceUrl || undefined
      });

      // If we have a URL, keep the modal open longer so user can click the link
      // Otherwise close after 2 seconds
      setTimeout(() => {
        if (!resourceUrl) {
          closePushModal();
        }
        router.refresh();
      }, resourceUrl ? 5000 : 2000);
    } catch (err: any) {
      setPushError(err.message || 'Failed to push to knowledge base');
    } finally {
      setPushing(false);
    }
  }

  function getProviderDisplayName(provider: string) {
    const names: Record<string, string> = {
      notion: 'Notion',
      confluence: 'Confluence',
      coda: 'Coda'
    };
    return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  }















  async function handleApplyTemplate(templateId: string) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Call Next.js API route (not backend directly)
      const response = await fetch('/api/templates/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          docId: initialSubmission.id,
          markdownContent: markdown,
          templateId: templateId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.detail || `Request failed with status ${response.status}`);
      }

      const result = await response.json();

      // Update markdown with templated content
      setMarkdown(result.markdown);
      const parsed = marked.parse(result.markdown);
      setHtml(typeof parsed === 'string' ? parsed : '<p></p>');
    } catch (error: any) {
      console.error('Failed to apply template:', error);
      alert(`Failed to apply template: ${error.message}`);
    }
  }

  async function loadDiff() {
    try {
      const response = await fetch(`/api/docs/diff?docId=${initialSubmission.id}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.detail || 'Failed to load diff');
      }

      const result = await response.json();
      setDiffData(result);
      setShowDiff(true);
      // View mode will be set by the ReviewPanel button click
    } catch (error: any) {
      console.error('Failed to load diff:', error);
      alert(`Failed to load diff: ${error.message}`);
    }
  }



  // Load connections on mount
  useEffect(() => {
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-check on page load if not recently checked
  useEffect(() => {
    if (isGitRepo && initialSubmission.status === 'completed') {
      const shouldAutoCheck = !lastCheckedAt ||
        (Date.now() - lastCheckedAt.getTime()) > 5 * 60 * 1000;

      if (shouldAutoCheck) {
        checkForUpdates();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-none space-y-6">
        <header>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">Edit Documentation</h1>
              <p className="text-white/60 mt-1">
                Submission ID: <span className="font-mono">{initialSubmission.id}</span>
              </p>
              {isGitRepo && initialSubmission.source_meta?.repoUrl && (
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-white/40" />
                    <span className="text-white/60">Repository:</span>
                    <a
                      href={initialSubmission.source_meta.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-300 hover:text-blue-200 hover:underline"
                    >
                      {initialSubmission.source_meta.repoUrl.replace('https://github.com/', '')}
                    </a>
                  </div>
                  {initialSubmission.source_meta.branch && (
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-white/40" />
                      <span className="text-white/60">Branch:</span>
                      <span className="font-mono text-white/80">{initialSubmission.source_meta.branch}</span>
                    </div>
                  )}
                  {initialSubmission.code_snapshot?.commitSha && (
                    <div className="flex items-center gap-2">
                      <span className="text-white/60">Commit:</span>
                      <a
                        href={`${initialSubmission.source_meta.repoUrl}/commit/${initialSubmission.code_snapshot.commitSha}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-blue-300 hover:text-blue-200 hover:underline"
                        title={initialSubmission.code_snapshot.commitSha}
                      >
                        {initialSubmission.code_snapshot.commitSha.substring(0, 7)}
                      </a>
                    </div>
                  )}
                </div>
              )}
              <p className="text-white/60 mt-2">
                Created: {new Date(initialSubmission.created_date).toLocaleString()}
              </p>
            </div>
            {initialSubmission.status === 'completed' && (
              <Link
                href={`/edit/${initialSubmission.id}/regenerate`}
                className="inline-flex items-center gap-2 rounded-lg border border-purple-500/50 bg-gradient-to-r from-purple-500/20 to-pink-500/20 px-5 py-2.5 text-sm font-semibold text-purple-200 hover:from-purple-500/30 hover:to-pink-500/30 hover:border-purple-500/70 transition-all shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </Link>
            )}
          </div>
          {statusNotice && (
            <div className="mt-2 rounded-xl border border-yellow-300/30 bg-yellow-500/10 px-3 py-2 text-yellow-200">
              {statusNotice}
            </div>
          )}

          {/* Rename notification banner - at top of page */}
          {renamedFiles.length > 0 && !dismissedRenameBanner && (
            <div className="glass-panel mt-4 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6 relative overflow-hidden">
              {/* Decorative background pattern */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500 rounded-full blur-2xl"></div>
              </div>

              <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="rounded-xl bg-blue-500/20 p-3 border border-blue-500/30 flex-shrink-0">
                      <GitCompare className="h-6 w-6 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-blue-100 mb-1">
                        Files automatically updated
                      </h3>
                      <p className="text-sm text-blue-200/90 mb-3">
                        {renamedFiles.length} file{renamedFiles.length === 1 ? ' was' : 's were'} renamed in the repository. The tracked file paths have been automatically updated.
                      </p>
                      <div className="mb-3 space-y-2">
                        {renamedFiles.slice(0, 3).map((rename, idx) => (
                          <div key={idx} className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                            <div className="flex items-center gap-2 text-xs font-mono">
                              <span className="text-blue-300/70 line-through">{rename.old_path}</span>
                              <span className="text-blue-200">→</span>
                              <span className="text-blue-200">{rename.new_path}</span>
                            </div>
                          </div>
                        ))}
                        {renamedFiles.length > 3 && (
                          <p className="text-xs text-blue-200/70">
                            + {renamedFiles.length - 3} more file{renamedFiles.length - 3 === 1 ? '' : 's'} renamed
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-blue-200/70 mb-4">
                        The tracked files list has been updated automatically. No action needed.
                      </p>
                    </div>
                  </div>
                  <button
                    className="rounded-lg p-1.5 text-blue-200/60 hover:bg-blue-500/20 hover:text-blue-100 transition-colors flex-shrink-0"
                    onClick={() => setDismissedRenameBanner(true)}
                    aria-label="Dismiss"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Outdated files banner */}
          {checkingUpdates && (
            <div className="glass-panel mt-4 flex items-center gap-3 border-blue-500/30 bg-blue-500/10 p-4">
              <div className="rounded-lg bg-blue-500/20 p-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-blue-200">Checking for updates...</p>
                <p className="text-sm text-blue-200/70">Comparing your source files with the latest changes</p>
              </div>
            </div>
          )}

          {(isOutdated || initialSubmission.is_outdated) && outdatedFiles.length > 0 && !dismissedBanner && (
            <div className="glass-panel mt-4 border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-6 relative overflow-hidden">
              {/* Decorative background pattern */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-400 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-500 rounded-full blur-2xl"></div>
              </div>

              <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="rounded-xl bg-orange-500/20 p-3 border border-orange-500/30">
                      <AlertCircle className="h-6 w-6 text-orange-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-orange-100 mb-1">
                        Source files have changed
                      </h3>
                      <p className="text-sm text-orange-200/90 mb-3">
                        {outdatedFiles.length} file{outdatedFiles.length === 1 ? '' : 's'} {outdatedFiles.length === 1 ? 'has' : 'have'} been modified since this documentation was created.
                      </p>

                      {initialSubmission.source_meta?.workspace && (
                        <div className="mb-3 rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-2">
                          <p className="text-xs text-orange-200/90">
                            <span className="font-medium">📝 {initialSubmission.source_meta.workspace.provider || 'workspace'} linked:</span> Existing documentation will be pulled from {initialSubmission.source_meta.workspace.provider || 'workspace'} and used as context for regeneration. The {initialSubmission.source_meta.workspace.provider || 'workspace'} page will be updated after regeneration.
                          </p>
                        </div>
                      )}

                      {lastCheckedAt && (
                        <p className="text-xs text-orange-200/60 mb-4">
                          Last checked: {lastCheckedAt.toLocaleTimeString()}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          className="inline-flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/20 px-4 py-2 text-sm font-medium text-orange-100 transition-all hover:bg-orange-500/30 hover:border-orange-500/60 hover:shadow-lg hover:shadow-orange-500/20"
                          onClick={() => setShowChangedFiles(true)}
                        >
                          <FileText className="h-4 w-4" />
                          <span>View changed files ({outdatedFiles.length})</span>
                        </button>
                        <Link
                          href={`/edit/${initialSubmission.id}/regenerate`}
                          className="inline-flex items-center gap-2 rounded-lg border border-orange-500/50 bg-orange-500/30 px-5 py-2 text-sm font-semibold text-orange-50 transition-all hover:bg-orange-500/40 hover:border-orange-500/70 hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5"
                        >
                          <RefreshCw className="h-4 w-4" />
                          <span>Update Documentation</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                  <button
                    className="rounded-lg p-1.5 text-orange-200/60 hover:bg-orange-500/20 hover:text-orange-100 transition-colors flex-shrink-0"
                    onClick={() => setDismissedBanner(true)}
                    aria-label="Dismiss"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {isGitRepo && initialSubmission.status === 'completed' && !isOutdated && !initialSubmission.is_outdated && (
            <div className="glass-panel mt-4 flex items-center gap-4 border-green-500/30 bg-green-500/10 p-4">
              <div className="rounded-lg bg-green-500/20 p-2 border border-green-500/30">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-green-200">Documentation is up to date</p>
                {lastCheckedAt && (
                  <p className="text-xs text-green-200/70 mt-0.5">
                    Checked {Math.round((Date.now() - lastCheckedAt.getTime()) / 1000 / 60)} min ago
                  </p>
                )}
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-200 transition-all hover:bg-green-500/30 hover:border-green-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={checkForUpdates}
                disabled={checkingUpdates}
                title="Check for updates"
              >
                {checkingUpdates ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    Check Now
                  </>
                )}
              </button>
            </div>
          )}
        </header>


        {/* Title input */}
        <label className="block">
          <div className="mb-1 text-sm text-white/70">Title</div>
          <input
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40 transition-all hover:border-white/30"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
          />
        </label>

        {/* Main Content Area - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Editor Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Content based on view mode */}
            {viewMode === 'rendered' && (
              <div className="space-y-2">
                <div className="mb-1 text-sm text-white/70">Content (Rendered)</div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-6">
                  <div
                    className="prose prose-invert max-w-none text-white"
                    dangerouslySetInnerHTML={{
                      __html: markdown ? marked.parse(markdown, { async: false }) : '<p class="text-white/50">No content</p>'
                    }}
                  />
                </div>
              </div>
            )}

            {viewMode === 'raw' && (
              <div className="space-y-2">
                <div className="mb-1 text-sm text-white/70">Content (Raw Markdown)</div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <pre className="whitespace-pre-wrap text-sm text-white/90 font-mono overflow-x-auto">
                    {markdown || 'No content'}
                  </pre>
                </div>
              </div>
            )}

            {viewMode === 'editor' && (
              <div className="space-y-2">
                <div className="mb-1 text-sm text-white/70">Content (Editor)</div>
                <div className="flex justify-center overflow-x-hidden">
                  <div className="w-full max-w-[2000px]">
                    <div className="h-[75vh] min-w-0 relative">
                      <RichTextEditor
                        initialHTML={html}
                        editable={true}
                        onChange={handleEditorChange}
                        onCursorChange={handleCursorChange}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'diff' && (
              <div className="space-y-2">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm text-white/70">Document Diff</div>
                  <button
                    onClick={() => {
                      setViewMode('editor');
                      setShowDiff(false);
                    }}
                    className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-6">
                  {showDiff && diffData ? (
                    <EnhancedDiffViewer
                      originalText={originalMarkdown}
                      newText={markdown}
                      showLineNumbers={true}
                    />
                  ) : (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-white/50" />
                      <span className="ml-3 text-white/60">Loading diff...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Right Column - Review Panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              <div className="glass-panel p-6">
                <ReviewPanel
                  docId={initialSubmission.id}
                  currentView={viewMode}
                  onViewChange={setViewMode}
                  onOpenPublishModal={openPushModal}
                  isProcessing={isProcessing}
                  onApplyTemplate={handleApplyTemplate}
                  onViewDiff={loadDiff}
                />
              </div>

              {/* Tracked Files Management */}
              {isGitRepo && (
                <div className="glass-panel p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">Tracked Files</h3>
                      <p className="text-xs text-white/60">
                        Files used to generate this documentation
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* File List */}
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {trackedFiles.length === 0 ? (
                        <p className="text-sm text-white/50 italic">No files tracked</p>
                      ) : (
                        trackedFiles.map((filePath, idx) => {
                          const isOutdatedFile = outdatedFiles.some(f => f.file_path === filePath);
                          const renamedFileInfo = renamedFiles.find(f => f.new_path === filePath);
                          const isRenamedFile = !!renamedFileInfo;
                          return (
                            <div
                              key={idx}
                              className={`flex items-center gap-2 rounded-lg border p-2 ${isRenamedFile
                                ? 'border-blue-500/30 bg-blue-500/10'
                                : isOutdatedFile
                                  ? 'border-orange-500/30 bg-orange-500/10'
                                  : 'border-white/10 bg-white/5'
                                }`}
                            >
                              <FileText className={`h-4 w-4 flex-shrink-0 ${isRenamedFile ? 'text-blue-400' :
                                isOutdatedFile ? 'text-orange-400' :
                                  'text-white/60'
                                }`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs font-mono truncate ${isRenamedFile ? 'text-blue-200' :
                                      isOutdatedFile ? 'text-orange-200' :
                                        'text-white/80'
                                      }`}
                                    title={filePath}
                                  >
                                    {filePath}
                                  </span>
                                  {isRenamedFile && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 flex-shrink-0">
                                      <GitCompare className="h-3 w-3" />
                                      Renamed
                                    </span>
                                  )}
                                </div>
                                {isRenamedFile && renamedFileInfo.old_path !== renamedFileInfo.new_path && (
                                  <div className="mt-1 flex items-center gap-2 text-xs">
                                    <span className="text-white/50">Previously:</span>
                                    <span className="text-blue-300/70 font-mono line-through truncate" title={renamedFileInfo.old_path}>
                                      {renamedFileInfo.old_path}
                                    </span>
                                    <span className="text-blue-200">→</span>
                                    <span className="text-blue-200 font-mono truncate" title={renamedFileInfo.new_path}>
                                      {renamedFileInfo.new_path}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {isOutdatedFile && !isRenamedFile && (
                                <span className="text-xs text-orange-400" title="File has been modified">
                                  ⚠
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  const newFiles = trackedFiles.filter((_, i) => i !== idx);
                                  handleUpdateTrackedFiles(newFiles);
                                }}
                                className="rounded p-1 text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Remove file"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Add File Button */}
                    <button
                      onClick={async () => {
                        setFileSearchQuery('');
                        setSelectedFilesToAdd(new Set());
                        setShowFileBrowser(true);
                        await loadAvailableRepoFiles();
                      }}
                      className="w-full rounded-lg border border-blue-500/40 bg-blue-500/20 px-3 py-2 text-sm font-medium text-blue-200 transition-all hover:bg-blue-500/30 hover:border-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={updatingFiles || loadingRepoFiles}
                    >
                      {loadingRepoFiles ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 inline mr-2 animate-spin" />
                          Loading files...
                        </>
                      ) : (
                        <>+ Add File</>
                      )}
                    </button>

                    {fileUpdateMsg && (
                      <p className="text-xs text-green-300">{fileUpdateMsg}</p>
                    )}
                    {fileUpdateErr && (
                      <p className="text-xs text-red-300">{fileUpdateErr}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Configuration Settings */}
        <div className="mb-6">
          <DocumentConfiguration
            promptConfig={promptConfig}
            onPromptConfigChange={setPromptConfig}
            structureConfig={structureConfig}
            onStructureConfigChange={setStructureConfig}
            onSave={showConfigSaveConfirm}
            saving={savingPromptConfig}
            saveMessage={promptConfigMsg}
            saveError={promptConfigErr}
          />
        </div>

        {/* Save controls */}
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white shadow-lg shadow-purple-500/20 transition-all hover:from-purple-600 hover:to-pink-600 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
            onClick={saveChanges}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>

          <Link
            href="/documentation?tab=edit"
            className="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
          >
            Back to Edit
          </Link>
        </div>

        {/* Save messages */}
        {saveErr && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
            {saveErr}
          </div>
        )}
        {saveMsg && (
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/80">
            {saveMsg}
          </div>
        )}
      </div>

      {/* File Browser Modal */}
      {showFileBrowser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowFileBrowser(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowFileBrowser(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="glass-panel w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <div>
                <h2 className="text-xl font-semibold text-white">Add Files to Track</h2>
                <p className="text-sm text-white/60 mt-0.5">
                  Select files from the repository to include in documentation generation
                </p>
              </div>
              <button
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setShowFileBrowser(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingRepoFiles ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-white/50" />
                  <span className="ml-3 text-white/60">Loading files...</span>
                </div>
              ) : availableRepoFiles.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">No additional files available</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Search and Multi-select Controls */}
                  <div className="space-y-3">
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                      <input
                        type="text"
                        value={fileSearchQuery}
                        onChange={(e) => setFileSearchQuery(e.target.value)}
                        placeholder="Search files..."
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-10 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/20 focus:bg-white/10"
                      />
                      {fileSearchQuery && (
                        <button
                          onClick={() => setFileSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Multi-select Controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={selectAllFiltered}
                          className="text-xs text-white/60 hover:text-white underline"
                          disabled={filteredFiles.length === 0}
                        >
                          Select all{fileSearchQuery ? ` (${filteredFiles.length})` : ''}
                        </button>
                        {selectedFilesToAdd.size > 0 && (
                          <>
                            <span className="text-white/40">|</span>
                            <button
                              onClick={clearAllFiltered}
                              className="text-xs text-white/60 hover:text-white underline"
                            >
                              Clear{fileSearchQuery ? ` (${filteredFiles.length})` : ''}
                            </button>
                          </>
                        )}
                      </div>
                      {selectedFilesToAdd.size > 0 && (
                        <span className="text-xs text-white/60">
                          {selectedFilesToAdd.size} selected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* File List */}
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredFiles.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-white/60">
                          {fileSearchQuery ? `No files match "${fileSearchQuery}"` : 'No files available'}
                        </p>
                      </div>
                    ) : (
                      filteredFiles.map((filePath) => {
                        const isSelected = selectedFilesToAdd.has(filePath);
                        return (
                          <button
                            key={filePath}
                            onClick={() => toggleFileSelection(filePath)}
                            className={`w-full text-left flex items-center gap-3 rounded-lg border p-3 transition-all ${isSelected
                              ? 'border-white/30 bg-white/10'
                              : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                              }`}
                          >
                            <div className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${isSelected
                              ? 'border-white bg-white'
                              : 'border-white/40'
                              }`}>
                              {isSelected && <Check className="w-3 h-3 text-black" />}
                            </div>
                            <FileText className="h-4 w-4 text-white/60 flex-shrink-0" />
                            <span className="flex-1 text-sm font-mono text-white/80 truncate" title={filePath}>
                              {filePath}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Add Selected Files Button */}
                  {selectedFilesToAdd.size > 0 && (
                    <div className="pt-4 border-t border-white/10">
                      <button
                        onClick={addSelectedFiles}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-white/90 transition-colors"
                      >
                        <Check className="h-4 w-4" />
                        Add {selectedFilesToAdd.size} file{selectedFilesToAdd.size !== 1 ? 's' : ''}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Changed Files Modal */}
      {showChangedFiles && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          style={{
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setShowChangedFiles(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowChangedFiles(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="changed-files-title"
        >
          <div
            className="glass-panel w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl"
            style={{
              animation: 'slideUp 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-500/20 p-2">
                  <AlertCircle className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <h2 id="changed-files-title" className="text-xl font-semibold text-white">
                    Changed Files
                  </h2>
                  <p className="text-sm text-white/60 mt-0.5">
                    {outdatedFiles.length} file{outdatedFiles.length === 1 ? '' : 's'} modified since documentation was created
                  </p>
                </div>
              </div>
              <button
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setShowChangedFiles(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {outdatedFiles.map((file, idx) => {
                  const repoUrl = initialSubmission.source_meta?.repoUrl || '';
                  const branch = initialSubmission.source_meta?.branch || 'main';
                  const oldCommitSha = initialSubmission.code_snapshot?.commitSha;
                  const urls = buildFileChangeUrl(file.file_path, repoUrl, branch, oldCommitSha);

                  return (
                    <div
                      key={idx}
                      className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-white/20 hover:bg-white/10"
                    >
                      <div className="rounded-md bg-blue-500/20 p-1.5">
                        <FileText className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm text-white truncate" title={file.file_path}>
                          {file.file_path}
                        </p>
                        <p className="text-xs text-white/50 mt-0.5">
                          {repoUrl ? `${repoUrl.split('/').pop()} • ${branch}` : 'Repository'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={urls.view}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition-all hover:border-blue-500/50 hover:bg-blue-500/20 hover:text-blue-200"
                          title="View current version"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View
                        </a>
                        {urls.compare && (
                          <a
                            href={urls.compare}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 transition-all hover:border-purple-500/50 hover:bg-purple-500/20 hover:text-purple-200"
                            title="Compare changes"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GitCompare className="h-3.5 w-3.5" />
                            Compare
                          </a>
                        )}
                        {urls.history && (
                          <a
                            href={urls.history}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-300 transition-all hover:border-green-500/50 hover:bg-green-500/20 hover:text-green-200"
                            title="View commit history"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            History
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 p-4 flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
                onClick={() => setShowChangedFiles(false)}
              >
                Close
              </button>
              <Link
                href={`/edit/${initialSubmission.id}/regenerate`}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500/20 px-4 py-2 text-sm font-medium text-orange-200 hover:bg-orange-500/30 transition-colors"
                onClick={() => setShowChangedFiles(false)}
              >
                <RefreshCw className="h-4 w-4" />
                Update Documentation
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Push to Knowledge Base Modal */}
      {showPushModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={closePushModal}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closePushModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="push-modal-title"
        >
          <div
            className="glass-panel w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/20 p-2">
                  <Send className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h2 id="push-modal-title" className="text-xl font-semibold text-white">
                    Push to Knowledge Base
                  </h2>
                  <p className="text-sm text-white/60 mt-0.5">
                    Select a connected knowledge base to publish your documentation
                  </p>
                </div>
              </div>
              <button
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                onClick={closePushModal}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {pushSuccess && (
                <div className="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-200">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="font-medium">
                      Successfully pushed to {getProviderDisplayName(pushSuccess.provider)}!
                    </p>
                  </div>
                  {pushSuccess.url ? (
                    <div className="space-y-2">
                      <p className="text-sm text-green-300/80">
                        Your documentation is ready. Click the link below to view it:
                      </p>
                      <a
                        href={pushSuccess.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-green-500/20 border border-green-500/50 px-4 py-2.5 text-sm font-medium text-green-100 hover:bg-green-500/30 hover:border-green-500/70 transition-all"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open in {getProviderDisplayName(pushSuccess.provider)}
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-green-300/80">
                      Resource created successfully. The link will be available shortly.
                    </p>
                  )}
                </div>
              )}

              {pushError && (
                <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{pushError}</p>
                </div>
              )}

              {loadingConnections ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                  <p className="ml-3 text-white/60">Loading connections...</p>
                </div>
              ) : connections.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 mx-auto mb-4">
                    <Send className="h-8 w-8 text-white/30" />
                  </div>
                  <p className="text-white/60 mb-2">No knowledge base connections found</p>
                  <p className="text-sm text-white/40 mb-4">
                    Connect a knowledge base in Settings to push your documentation
                  </p>
                  <Link
                    href="/settings?tab=integrations"
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                    onClick={closePushModal}
                  >
                    Go to Settings
                  </Link>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Provider Selection */}
                  {!selectedProvider ? (
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-3">
                        Select Knowledge Base
                      </label>
                      <div className="grid gap-4 md:grid-cols-2">
                        {connections.map((connection) => {
                          const provider = connection.provider as 'notion' | 'confluence' | 'coda';
                          return (
                            <button
                              key={connection.connection_id}
                              onClick={() => handleProviderSelect(provider)}
                              className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm text-left hover:border-white/20 hover:bg-white/10 transition-all"
                            >
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                                    <IntegrationLogos provider={provider} size={28} />
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-semibold text-white">
                                      {getProviderDisplayName(provider)}
                                    </h3>
                                    <p className="text-sm text-white/60">
                                      Push documentation to {getProviderDisplayName(provider)}
                                    </p>
                                  </div>
                                </div>
                                <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Connected
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Back button */}
                      <button
                        onClick={() => {
                          setSelectedProvider(null);
                          setSelectedParent(null);
                          setAvailableResources([]);
                        }}
                        className="text-sm text-white/60 hover:text-white/80 flex items-center gap-2"
                      >
                        ← Back to provider selection
                      </button>

                      {/* File Name Input */}
                      <div>
                        <label className="block text-sm font-medium text-white/80 mb-2">
                          Document Title
                        </label>
                        <input
                          type="text"
                          value={pushTitle}
                          onChange={(e) => setPushTitle(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/40 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          placeholder="Enter document title"
                        />
                      </div>

                      {/* Parent Selection */}
                      <div>
                        <label className="block text-sm font-medium text-white/80 mb-2">
                          {selectedProvider === 'notion' && 'Parent Page or Database'}
                          {selectedProvider === 'confluence' && 'Space'}
                          {selectedProvider === 'coda' && 'Document'}
                        </label>
                        {loadingResources ? (
                          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                            <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                            <span className="text-white/60">Loading resources...</span>
                          </div>
                        ) : availableResources.length === 0 ? (
                          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-yellow-200 text-sm">
                            No resources found. Please ensure your {getProviderDisplayName(selectedProvider)} workspace has pages or databases.
                          </div>
                        ) : (
                          <div className="relative">
                            <select
                              value={selectedParent?.id || ''}
                              onChange={(e) => {
                                const resource = availableResources.find(r => r.id === e.target.value);
                                if (resource) {
                                  setSelectedParent(resource);
                                }
                              }}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none pr-10"
                            >
                              <option value="">Select a {selectedProvider === 'notion' ? 'page or database' : selectedProvider === 'confluence' ? 'space' : 'document'}</option>
                              {availableResources.map((resource) => (
                                <option key={resource.id} value={resource.id} className="bg-gray-800">
                                  {resource.title} ({resource.type})
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 pointer-events-none" />
                          </div>
                        )}
                        {selectedProvider === 'notion' && (
                          <p className="mt-1 text-xs text-white/50">
                            Select a page or database where the new documentation will be created
                          </p>
                        )}
                      </div>

                      {/* Push Button */}
                      <button
                        onClick={pushToKnowledgeBase}
                        disabled={pushing || !selectedParent || !pushTitle.trim()}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pushing ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Pushing...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Send className="h-4 w-4" />
                            Push to {getProviderDisplayName(selectedProvider)}
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 p-4 flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
                onClick={closePushModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate Documentation Modal */}
      {showRegenerateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={closeRegenerateModal}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeRegenerateModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="regenerate-modal-title"
        >
          <div
            className="glass-panel w-full max-w-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/20 p-2">
                  <RefreshCw className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h2 id="regenerate-modal-title" className="text-xl font-semibold text-white">
                    Regenerate Documentation?
                  </h2>
                  <p className="text-sm text-white/60 mt-0.5">
                    Tracked files have been updated
                  </p>
                </div>
              </div>
              <button
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                onClick={closeRegenerateModal}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-white/80">
                You've updated the tracked files for this documentation. To reflect these changes,
                the documentation needs to be regenerated.
              </p>

              {filesChanged && (
                <div className="space-y-3">
                  {filesChanged.added.length > 0 && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                        <span className="text-sm font-medium text-green-300">
                          Added {filesChanged.added.length} file{filesChanged.added.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <ul className="text-xs text-green-200/80 space-y-1 ml-6 max-h-32 overflow-y-auto">
                        {filesChanged.added.slice(0, 10).map((file, idx) => (
                          <li key={idx} className="font-mono truncate">{file}</li>
                        ))}
                        {filesChanged.added.length > 10 && (
                          <li className="text-green-300/60">... and {filesChanged.added.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {filesChanged.removed.length > 0 && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-red-400" />
                        <span className="text-sm font-medium text-red-300">
                          Removed {filesChanged.removed.length} file{filesChanged.removed.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <ul className="text-xs text-red-200/80 space-y-1 ml-6 max-h-32 overflow-y-auto">
                        {filesChanged.removed.slice(0, 10).map((file, idx) => (
                          <li key={idx} className="font-mono truncate">{file}</li>
                        ))}
                        {filesChanged.removed.length > 10 && (
                          <li className="text-red-300/60">... and {filesChanged.removed.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-200">
                    <p className="font-medium mb-1">What happens when you regenerate?</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-200/80">
                      <li>The documentation will be updated to include the new files</li>
                      <li>Content from removed files will be excluded</li>
                      <li>You can review changes before saving</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 p-4 flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
                onClick={closeRegenerateModal}
              >
                Later
              </button>
              <button
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 flex items-center gap-2"
                onClick={handleRegenerate}
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Save Confirmation Dialog */}
      <Dialog open={showConfigConfirm} onOpenChange={setShowConfigConfirm}>
        <DialogContent className="bg-gray-900 border border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Save Configuration Changes</DialogTitle>
            <DialogDescription className="text-white/70">
              Are you sure you want to save these configuration changes? This will update the document's configuration settings and affect future regenerations.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfigConfirm(false)}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={saveConfiguration}
              disabled={savingPromptConfig}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {savingPromptConfig ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

