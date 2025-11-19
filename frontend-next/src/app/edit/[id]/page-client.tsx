'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, CheckCircle2, RefreshCw, Clock, FileText, GitCompare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PromptCustomizer } from '@/components/PromptCustomizer';
import { RichTextEditor } from '@/components/RichTextEditor';
import { marked } from 'marked';
import TurndownService from 'turndown';

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
  const [html, setHtml] = useState(
    (initialSubmission.markdown && marked.parse(initialSubmission.markdown)) || '<p></p>'
  );
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  // Outdated files check state
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [outdatedFiles, setOutdatedFiles] = useState<Array<{ file_path: string; old_hash: string; new_hash: string }>>([]);
  const [isOutdated, setIsOutdated] = useState(initialSubmission.is_outdated || false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [showChangedFiles, setShowChangedFiles] = useState(false);

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
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-blue-300/30 bg-blue-500/10 px-3 py-2 text-blue-200">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking for updates...</span>
            </div>
          )}

          {(isOutdated || initialSubmission.is_outdated) && outdatedFiles.length > 0 && (
            <div className="mt-2 rounded-xl border border-orange-300/30 bg-orange-500/10 px-4 py-3 text-orange-200">
              <div className="mb-2 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Source files have changed</span>
              </div>
              <p className="mb-3 text-sm text-orange-200/80">
                {outdatedFiles.length} file{outdatedFiles.length === 1 ? '' : 's'} have been modified since
                this documentation was created.
              </p>
              {lastCheckedAt && (
                <p className="mb-3 text-xs text-orange-200/60">
                  Last checked: {lastCheckedAt.toLocaleTimeString()}
                </p>
              )}
              <button
                className="mb-3 inline-flex items-center gap-2 rounded-lg bg-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-200 hover:bg-orange-500/30"
                onClick={() => setShowChangedFiles(!showChangedFiles)}
              >
                <FileText className="h-3 w-3" />
                <span>{showChangedFiles ? 'Hide' : 'Show'} changed files</span>
              </button>
              {showChangedFiles && (
                <div className="mb-3 ml-4 max-h-48 space-y-2 overflow-y-auto">
                  {outdatedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                      <span className="font-mono text-xs text-orange-200/90 flex-1 truncate" title={file.file_path}>
                        {file.file_path}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link
                href={`/edit/${initialSubmission.id}/regenerate`}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500/20 px-4 py-2 text-sm font-medium text-orange-200 hover:bg-orange-500/30"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Update Documentation</span>
              </Link>
            </div>
          )}

          {isGitRepo && initialSubmission.status === 'completed' && !isOutdated && !initialSubmission.is_outdated && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-green-300/30 bg-green-500/10 px-3 py-2 text-green-200">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Documentation is up to date</span>
              {lastCheckedAt && (
                <span className="ml-2 text-xs text-green-200/60">
                  (Checked {Math.round((Date.now() - lastCheckedAt.getTime()) / 1000 / 60)} min ago)
                </span>
              )}
              <button
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-green-500/20 px-3 py-1 text-xs font-medium text-green-200 hover:bg-green-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
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
    </div>
  );
}

