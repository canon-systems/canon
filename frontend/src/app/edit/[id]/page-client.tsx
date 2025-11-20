'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, CheckCircle2, RefreshCw, Clock, FileText, GitCompare, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PromptCustomizer } from '@/components/PromptCustomizer';
import { RichTextEditor } from '@/components/RichTextEditor';
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
    const parsed = marked.parse(initialSubmission.markdown);
    return typeof parsed === 'string' ? parsed : '<p></p>';
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  // Outdated files check state
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [outdatedFiles, setOutdatedFiles] = useState<Array<{ file_path: string; old_hash: string; new_hash: string }>>([]);
  const [isOutdated, setIsOutdated] = useState(initialSubmission.is_outdated || false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [showChangedFiles, setShowChangedFiles] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  // Prompt customization state
  const [promptConfig, setPromptConfig] = useState(
    initialSubmission.source_meta?.llm_prompt_config || {
      personality: 'default',
      style: 'default',
      audience: 'technical',
      customInstructions: '',
      temperature: 0.3
    }
  );
  const [savingPromptConfig, setSavingPromptConfig] = useState(false);
  const [promptConfigMsg, setPromptConfigMsg] = useState('');
  const [promptConfigErr, setPromptConfigErr] = useState('');

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
        .from('submissions')
        .update({
          title: title || 'Untitled',
          markdown, // Store markdown as before
          summary: (markdown || '').replace(/\s+/g, ' ').slice(0, 200)
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

  async function savePromptConfig() {
    setPromptConfigErr('');
    setPromptConfigMsg('');
    setSavingPromptConfig(true);
    try {
      const currentSourceMeta = initialSubmission.source_meta || {};
      const updatedSourceMeta = {
        ...currentSourceMeta,
        llm_prompt_config: promptConfig
      };

      const { error } = await supabase
        .from('submissions')
        .update({
          source_meta: updatedSourceMeta
        })
        .eq('id', initialSubmission.id);

      if (error) throw new Error(error.message);
      setPromptConfigMsg('Prompt settings saved. These will be used for future regenerations.');
      setTimeout(() => setPromptConfigMsg(''), 3000);
    } catch (e) {
      setPromptConfigErr(String(e));
      setTimeout(() => setPromptConfigErr(''), 5000);
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
          <h1 className="text-3xl font-bold text-white">Edit Documentation</h1>
          <p className="text-white/60">
            Submission ID: <span className="font-mono">{initialSubmission.id}</span>
          </p>
          <p className="text-white/60">
            Created: {new Date(initialSubmission.created_date).toLocaleString()}
          </p>
          {statusNotice && (
            <div className="mt-2 rounded-xl border border-yellow-300/30 bg-yellow-500/10 px-3 py-2 text-yellow-200">
              {statusNotice}
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
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
          />
        </label>

        {/* Content editor with RichTextEditor */}
        <div className="space-y-2">
          <div className="mb-1 text-sm text-white/70">Content</div>
          <div className="flex justify-center overflow-x-hidden">
            <div className="w-full max-w-[2000px]">
              <div className="h-[75vh] min-w-0">
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

        {/* LLM Prompt Customization */}
        <div className="mb-4">
          <PromptCustomizer promptConfig={promptConfig} onChange={setPromptConfig} />
          <div className="mt-2 flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-200 hover:bg-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={savePromptConfig}
              disabled={savingPromptConfig}
            >
              {savingPromptConfig ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Prompt Settings</span>
              )}
            </button>
            {promptConfigMsg && <span className="text-xs text-green-300">{promptConfigMsg}</span>}
            {promptConfigErr && <span className="text-xs text-red-300">{promptConfigErr}</span>}
          </div>
        </div>

        {/* Save controls */}
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
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
            href="/edit"
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
    </div>
  );
}

