'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Github, FolderOpen, Upload, Code, Loader2, AlertTriangle, Info, ChevronDown, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PromptCustomizer } from '@/components/PromptCustomizer';
import { SearchableSelect } from '@/components/SearchableSelect';

type InputType = 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code';
type Status = 'completed' | 'failed' | 'processing';

interface Model {
  value: string;
  label: string;
  provider: string;
  cost: string;
  context: string;
  description: string;
}

const availableModels: Model[] = [
  // OpenAI Models
  {
    value: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    cost: '$$$$',
    context: '128K tokens',
    description: 'Our most advanced, multimodal flagship model that\'s faster and 50% cheaper than GPT-4 Turbo. GPT-4o ("o" for "omni") is trained across text, vision, and audio.'
  },
  {
    value: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    cost: '$',
    context: '128K tokens',
    description: 'A smaller, more affordable variant of GPT-4o. Fast, intelligent, and cost-effective for most tasks.'
  },
  {
    value: 'gpt-4-turbo',
    label: 'GPT-4 Turbo',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '128K tokens',
    description: 'A large multimodal model (accepting text or image inputs and outputting text) that can solve complex tasks with greater accuracy than any of our previous models.'
  },
  {
    value: 'gpt-4',
    label: 'GPT-4',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '8K tokens',
    description: 'A large multimodal model (accepting text or image inputs and outputting text) that can solve difficult problems with greater accuracy than any of our previous models.'
  },
  {
    value: 'gpt-3.5-turbo',
    label: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    cost: '$',
    context: '16K tokens',
    description: 'A high-performance, cost-effective model optimized for chat and text completion tasks. Fast and efficient for most use cases.'
  },
  {
    value: 'o1-preview',
    label: 'O1 Preview',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '128K tokens',
    description: 'Advanced reasoning model optimized for complex problem-solving and deep analysis. Uses a different architecture focused on reasoning capabilities.'
  },
  {
    value: 'o1-mini',
    label: 'O1 Mini',
    provider: 'OpenAI',
    cost: '$$$',
    context: '128K tokens',
    description: 'A smaller, more affordable version of O1. Optimized for reasoning tasks with improved cost efficiency.'
  },
  // Anthropic Models
  {
    value: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    cost: '$$$$',
    context: '200K tokens',
    description: 'Our most intelligent model, with improved performance on coding tasks, math, and following complex, multi-step instructions. Excels at nuanced content creation and sophisticated Q&A.'
  },
  {
    value: 'claude-3-opus-20240229',
    label: 'Claude 3 Opus',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Our most powerful model for highly complex tasks. Best for tasks that require deep analysis, complex content creation, code generation, and research.'
  },
  {
    value: 'claude-3-sonnet-20240229',
    label: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    cost: '$$$',
    context: '200K tokens',
    description: 'A balanced model for enterprise workloads. Ideal for tasks requiring rapid responses, like knowledge retrieval or sales automation.'
  },
  {
    value: 'claude-3-haiku-20240307',
    label: 'Claude 3 Haiku',
    provider: 'Anthropic',
    cost: '$',
    context: '200K tokens',
    description: 'Our fastest and most compact model for near-instant responsiveness. Perfect for simple queries, lightweight tasks, and high-volume use cases.'
  },
  {
    value: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    cost: '$$',
    context: '200K tokens',
    description: 'An improved version of Haiku with better performance while maintaining speed and cost efficiency. Great for general-purpose tasks.'
  },
  // Google Models
  {
    value: 'gemini-2.0-flash-exp',
    label: 'Gemini 2.0 Flash (Experimental)',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Experimental model with massive 1M token context window. Supports text, vision, audio, and function calling. Optimized for speed and efficiency.'
  },
  {
    value: 'gemini-1.5-pro',
    label: 'Gemini 1.5 Pro',
    provider: 'Google',
    cost: '$$$$',
    context: '2M tokens',
    description: 'Google\'s most capable model with an enormous 2M token context window. Excellent for complex reasoning, code generation, and multimodal tasks.'
  },
  {
    value: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Fast and efficient model with 1M token context window. Great balance of speed, cost, and capability for most use cases.'
  },
  {
    value: 'gemini-1.5-flash-8b',
    label: 'Gemini 1.5 Flash 8B',
    provider: 'Google',
    cost: '$',
    context: '1M tokens',
    description: 'Lightweight 8B parameter model with 1M token context. Ultra-fast and cost-effective for simple tasks.'
  }
];

function getMethodIcon(m: InputType) {
  switch (m) {
    case 'github_repo':
      return Github;
    case 'github_repo_directory':
      return FolderOpen;
    case 'zipped_folder':
      return Upload;
    case 'pasted_code':
      return Code;
  }
}

export function DocumentationPageClient() {
  const router = useRouter();
  const supabase = createClient();
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const [method, setMethod] = useState<InputType>('github_repo_directory');
  const [docTitle, setDocTitle] = useState('Documentation Draft');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Git inputs
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [subdir, setSubdir] = useState('');
  const [ownerInput, setOwnerInput] = useState('');
  const [baseOwner, setBaseOwner] = useState('');
  const [showRepoSelector, setShowRepoSelector] = useState(false);

  // Dropdown options
  const [branches, setBranches] = useState<string[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [repos, setRepos] = useState<Array<{ name: string; full_name: string; url: string; private: boolean }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Zip & Paste inputs
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [pasteFilename, setPasteFilename] = useState('snippet.txt');
  const [pasteCode, setPasteCode] = useState('');

  // LLM Prompt customization
  const [promptConfig, setPromptConfig] = useState({
    personality: 'default',
    style: 'default',
    audience: 'technical',
    customInstructions: '',
    temperature: 0.3
  });

  // Progress + errors
  const [listing, setListing] = useState(false);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // GitHub connection status
  const [hasGitHubConnection, setHasGitHubConnection] = useState(false);
  const [checkingGitHub, setCheckingGitHub] = useState(true);

  // Git file picker data
  const [pickerFiles, setPickerFiles] = useState<Array<{ path: string; size: number }>>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const selectedModelObj = availableModels.find(m => m.value === selectedModel) || availableModels[0];
  const isGit = method === 'github_repo' || method === 'github_repo_directory';

  // Check GitHub connection status
  useEffect(() => {
    async function checkGitHubConnection() {
      setCheckingGitHub(true);
      try {
        const response = await fetch('/api/integrations/list');
        if (response.ok) {
          const data = await response.json();
          setHasGitHubConnection((data.connections || []).some(
            (c: { provider: string; status: string }) =>
              c.provider === 'github' && c.status === 'active'
          ));
        }
      } catch (err) {
        console.error('Failed to check GitHub connection:', err);
      } finally {
        setCheckingGitHub(false);
      }
    }
    checkGitHubConnection();
  }, []);

  // Click outside handler for model dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showModelDropdown &&
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(event.target as Node)
      ) {
        setShowModelDropdown(false);
      }
    }
    if (showModelDropdown) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showModelDropdown]);

  // Reset file lists when Git inputs change
  useEffect(() => {
    if (!isGit) {
      setPickerFiles([]);
      setSelectedPaths(new Set());
    }
  }, [isGit]);

  useEffect(() => {
    if (isGit) {
      setPickerFiles([]);
      setSelectedPaths(new Set());
    }
  }, [method, repoUrl, branch, subdir, isGit]);

  // Function to search for repos (matches SvelteKit behavior)
  function searchRepos() {
    if (ownerInput.trim()) {
      setShowRepoSelector(true);
      const trimmed = ownerInput.trim();
      // Remove github.com/ prefix if present
      const cleanOwner = trimmed
        .replace(/^https?:\/\/github\.com\//, '')
        .replace(/\/$/, '')
        .split('/')[0];
      if (cleanOwner && cleanOwner !== baseOwner) {
        setBaseOwner(cleanOwner);
        fetchRepos(cleanOwner);
      }
    } else {
      setShowRepoSelector(false);
      setBaseOwner('');
      setRepos([]);
    }
  }

  // React to repo URL changes
  useEffect(() => {
    if (repoUrl && repoUrl.includes('github.com')) {
      const noProto = repoUrl.replace(/^https?:\/\//, '');
      const parts = noProto.split('/').filter(Boolean);
      if (parts.length >= 3) {
        fetchBranches();
      }
    } else {
      setBranches([]);
      setDirectories([]);
      setBranch('main');
      setSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl]);

  // React to branch changes
  useEffect(() => {
    if (branch && repoUrl && repoUrl.includes('github.com') && method === 'github_repo_directory') {
      fetchDirectories();
    } else {
      setDirectories([]);
      setSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, repoUrl, method]);

  // Fetch functions
  async function fetchRepos(owner: string) {
    if (!owner || loadingRepos) return;

    setLoadingRepos(true);
    try {
      const response = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner })
      });

      if (response.ok) {
        const data = await response.json();
        setRepos((data.repos || [])
          .filter((r: any) => r && r.name && r.full_name && r.url)
          .map((r: { name: string; full_name: string; url: string; private: boolean }) => ({
            name: r.name,
            full_name: r.full_name,
            url: r.url,
            private: r.private || false
          })));
      } else {
        setRepos([]);
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err);
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  }

  async function fetchBranches() {
    if (!repoUrl.trim() || !repoUrl.includes('github.com')) {
      setBranches([]);
      return;
    }

    setLoadingBranches(true);
    setErrorMsg('');
    try {
      const response = await fetch('/api/github/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl })
      });

      if (response.ok) {
        const data = await response.json();
        const branchList = data.branches || [];
        setBranches(branchList);
        if (branchList.length > 0 && !branchList.includes(branch)) {
          setBranch(branchList[0]);
        }
      } else {
        setBranches([]);
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404 && !hasGitHubConnection) {
          setErrorMsg('Repository not found or is private. Connect your GitHub account in Settings to access private repositories.');
        } else if (response.status === 403 && !hasGitHubConnection) {
          setErrorMsg('Rate limit exceeded. Connect your GitHub account in Settings for higher rate limits (5,000/hr vs 60/hr).');
        } else if (response.status !== 404) {
          setErrorMsg(errorData?.error || errorData?.detail || `Failed to load branches (${response.status})`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }

  async function fetchDirectories() {
    if (!repoUrl.trim() || !repoUrl.includes('github.com') || !branch) {
      setDirectories([]);
      return;
    }

    setLoadingDirectories(true);
    try {
      const response = await fetch('/api/github/directories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl, branch })
      });

      if (response.ok) {
        const data = await response.json();
        setDirectories(data.directories || []);
      } else {
        setDirectories([]);
      }
    } catch (err) {
      console.error('Failed to fetch directories:', err);
      setDirectories([]);
    } finally {
      setLoadingDirectories(false);
    }
  }

  async function listGitFiles() {
    if (!isGit) return;

    setErrorMsg('');
    setListing(true);
    setPickerFiles([]);
    setSelectedPaths(new Set());

    try {
      const r = await fetch('/api/github/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          branch,
          subdir: method === 'github_repo_directory' ? subdir : ''
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 404) {
          if (!hasGitHubConnection) {
            throw new Error('Repository not found or is private. Connect your GitHub account in Settings to access private repositories.');
          } else {
            throw new Error("Repository not found or you don't have access to it.");
          }
        } else if (r.status === 403) {
          if (!hasGitHubConnection) {
            throw new Error('Rate limit exceeded or access denied. Connect your GitHub account in Settings for higher rate limits (5,000/hr vs 60/hr).');
          } else {
            throw new Error('Access denied. Please check your GitHub connection in Settings.');
          }
        }
        throw new Error(data?.error || data?.detail || `Git list failed (${r.status})`);
      }

      setPickerFiles(Array.isArray(data.files) ? data.files : []);
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setListing(false);
    }
  }

  // File selection helpers
  function selectAll() {
    setSelectedPaths(new Set(pickerFiles.map(f => f.path)));
  }

  function clearAll() {
    setSelectedPaths(new Set());
  }

  function togglePick(path: string) {
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  }

  function selectedArray(): string[] {
    return Array.from(selectedPaths);
  }

  function detectRepoProvider(repoUrl: string): string | null {
    if (!repoUrl) return null;
    try {
      const url = new URL(repoUrl);
      if (url.hostname === 'github.com' || url.hostname.includes('github.com')) {
        return 'github';
      }
    } catch {
      return null;
    }
    return null;
  }

  function buildInputContent(): string {
    if (method === 'pasted_code') return `${pasteFilename} (pasted)`;
    if (method === 'zipped_folder') return zipFile ? zipFile.name : '(no zip selected)';

    const files = selectedArray();
    return [
      repoUrl || '',
      branch ? `@${branch}` : '',
      method === 'github_repo_directory' && subdir ? `/${subdir}` : '',
      files.length ? ` • files: ${files.slice(0, 6).join(', ')}${files.length > 6 ? '…' : ''}` : ''
    ].join('');
  }

  async function analyzeAndSave() {
    setErrorMsg('');
    setStatusMsg('');
    setRunning(true);

    if (isGit) {
      if (!ownerInput.trim()) {
        setErrorMsg('Please enter a GitHub owner/organization.');
        setRunning(false);
        return;
      }
      if (!repoUrl || !repoUrl.includes('github.com')) {
        setErrorMsg('Please select a repository from the dropdown.');
        setRunning(false);
        return;
      }
    }

    let submissionId: string | null = null;

    try {
      setStatusMsg('Queuing…');
      const filesForLog =
        method === 'pasted_code'
          ? [pasteFilename]
          : method === 'zipped_folder'
            ? []
            : selectedArray();

      const source_meta =
        method === 'pasted_code'
          ? { filename: pasteFilename, model: selectedModel, llm_prompt_config: promptConfig }
          : method === 'zipped_folder'
            ? {
              zip_name: zipFile?.name ?? null,
              model: selectedModel,
              llm_prompt_config: promptConfig
            }
            : {
              repoUrl,
              branch,
              model: selectedModel,
              llm_prompt_config: promptConfig,
              ...(method === 'github_repo_directory' ? { subdir } : {})
            };

      const repoProvider = isGit && repoUrl ? detectRepoProvider(repoUrl) : null;

      const insertData: any = {
        input_type: method,
        input_content: buildInputContent(),
        status: 'processing' as Status,
        selected_files: filesForLog,
        source_meta
      };

      if (repoProvider) {
        insertData.repo_provider = repoProvider;
      }

      const { data, error } = await supabase
        .from('submissions')
        .insert(insertData)
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      submissionId = (data as { id: string }).id ?? null;

      if (!submissionId) throw new Error('Insert did not return a submission id.');

      // Gather files/content for LLM
      setStatusMsg('Collecting source files…');
      let filesForDoc: Array<{ path: string; content: string }> = [];

      if (isGit) {
        const chosen = selectedArray();
        if (!chosen.length) throw new Error('Pick at least one file.');
        const r = await fetch('/api/github/batchRaw', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            repoUrl,
            branch,
            subdir: method === 'github_repo_directory' ? subdir : '',
            selectedFiles: chosen,
            includeContent: true,
            previewChars: 0,
            maxBytes: 200_000
          })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (r.status === 404) {
            if (!hasGitHubConnection) {
              throw new Error('Repository not found or is private. Connect your GitHub account in Settings to access private repositories.');
            } else {
              throw new Error("Repository not found or you don't have access to it.");
            }
          } else if (r.status === 403) {
            if (!hasGitHubConnection) {
              throw new Error('Rate limit exceeded or access denied. Connect your GitHub account in Settings for higher rate limits (5,000/hr vs 60/hr).');
            } else {
              throw new Error('Access denied. Please check your GitHub connection in Settings.');
            }
          }
          throw new Error(data?.error || data?.detail || `Git fetch failed (${r.status})`);
        }
        const got = Array.isArray(data.files) ? data.files : [];
        filesForDoc = got.map((f: any) => ({ path: f.path, content: String(f.content || '') }));
      } else if (method === 'zipped_folder') {
        if (!zipFile) throw new Error('Please choose a .zip file first.');
        const fd = new FormData();
        fd.append('zip', zipFile);
        fd.append('includeContent', 'true');
        fd.append('previewChars', '0');
        fd.append('maxBytes', '200000');
        const r = await fetch('/api/files/zip', { method: 'POST', body: fd });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `Zip read failed (${r.status})`);
        const got = Array.isArray(data.files) ? data.files : [];
        filesForDoc = got.map((f: any) => ({ path: f.path, content: String(f.content || '') }));
      } else {
        filesForDoc = [{ path: pasteFilename || 'snippet.txt', content: pasteCode || '' }];
      }

      if (!filesForDoc.length) throw new Error('No content gathered for summarization.');

      // Generate documentation
      setStatusMsg('Summarizing with AI…');
      const rGen = await fetch('/api/docs/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectName: docTitle || 'Documentation Draft',
          files: filesForDoc,
          model: selectedModel,
          promptConfig: promptConfig
        })
      });
      const text = await rGen.text();
      let gen: any;
      try {
        gen = JSON.parse(text);
      } catch {
        throw new Error(`Expected JSON from generator but got non-JSON (status ${rGen.status}). First bytes: ${text.slice(0, 200)}`);
      }
      if (!rGen.ok) throw new Error(gen?.error || `Generate failed (${rGen.status})`);
      const markdown = String(gen.markdown || '');

      // Save final result with code snapshot
      setStatusMsg('Saving…');
      let codeSnapshot: any = null;
      if (isGit && repoUrl && branch) {
        try {
          const selectedFiles = selectedArray();
          if (selectedFiles.length > 0) {
            try {
              const snapshotRes = await fetch('/api/github/snapshot', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  repoUrl,
                  branch,
                  selectedFiles
                })
              });

              if (snapshotRes.ok) {
                const snapshotData = await snapshotRes.json().catch(() => null);
                if (snapshotData?.commitSha && snapshotData?.fileShas) {
                  codeSnapshot = {
                    commitSha: snapshotData.commitSha,
                    fileShas: snapshotData.fileShas,
                    createdAt: new Date().toISOString()
                  };
                }
              }
            } catch (fetchError) {
              console.error('[code_snapshot] Fetch error:', fetchError);
            }
          }
        } catch (e) {
          console.error('[code_snapshot] Exception:', e);
        }
      }

      const { error: uerr } = await supabase
        .from('submissions')
        .update({
          title: docTitle || 'Untitled',
          markdown,
          status: 'completed' as Status,
          summary: markdown.replace(/\s+/g, ' ').slice(0, 200),
          ...(codeSnapshot ? { code_snapshot: codeSnapshot } : {})
        })
        .eq('id', submissionId);

      if (uerr) throw new Error(uerr.message);

      // Post-process for Git submissions
      if (submissionId && isGit) {
        try {
          await fetch('/api/docs/post-process', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ submissionId })
          });
        } catch (e) {
          console.error('[post-process] Exception:', e);
        }
      }

      setStatusMsg('Done. Redirecting…');
      router.push(`/edit/${submissionId}`);
    } catch (e) {
      setErrorMsg(String(e));
      setStatusMsg('');
      if (submissionId) {
        await supabase
          .from('submissions')
          .update({ status: 'failed' as Status, error_message: String(e).slice(0, 500) })
          .eq('id', submissionId);
      }
    } finally {
      setRunning(false);
    }
  }

  const showLoadButton = isGit && !pickerFiles.length;

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-10">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-white">Generate Documentation</h1>
          <p className="text-white/70">
            Pick a method, provide inputs, select files (for Git), then Analyze & Save.
          </p>
        </div>

        <section className="form-panel space-y-6">
          <div>
            <p className="section-label">Input Method</p>
            <p className="section-helper">Select how you want to provide your source material.</p>
          </div>

          <div className="method-grid">
            {[
              { id: 'github_repo', label: 'Git Repo' },
              { id: 'github_repo_directory', label: 'Git Directory' },
              { id: 'zipped_folder', label: 'ZIP Upload' },
              { id: 'pasted_code', label: 'Paste Code' }
            ].map((opt) => {
              const Icon = getMethodIcon(opt.id as InputType);
              return (
                <button
                  key={opt.id}
                  className="method-pill"
                  data-active={method === opt.id}
                  onClick={() => setMethod(opt.id as InputType)}
                  aria-pressed={method === opt.id}
                >
                  <Icon className="h-4 w-4" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div className="form-divider" />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field-group">
              <span className="field-label">Document title</span>
              <input
                className="field-input"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g., API Overview"
              />
            </label>

            <label className="field-group">
              <span className="field-label">AI model</span>
              <div className="relative" ref={modelDropdownRef}>
                <button
                  type="button"
                  className={`field-input flex items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-50 ${running ? 'opacity-70' : ''
                    }`}
                  onClick={() => !running && setShowModelDropdown(!showModelDropdown)}
                  disabled={running}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {selectedModelObj ? (
                      <>
                        <span className="font-medium">{selectedModelObj.label}</span>
                        <span className="text-xs text-white/60">({selectedModelObj.provider})</span>
                        <span className="text-xs text-white/70">{selectedModelObj.cost}</span>
                        <span className="text-xs text-white/50">{selectedModelObj.context}</span>
                      </>
                    ) : (
                      <span className="font-medium text-white/60">Select model...</span>
                    )}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-white/60 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showModelDropdown && (
                  <div className="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-white/15 bg-[#0f0f12] shadow-xl">
                    {availableModels
                      .filter((m) => m && m.value && m.label)
                      .map((model) => (
                        <button
                          key={model.value}
                          type="button"
                          className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/5 focus:bg-white/5 focus:outline-none ${selectedModel === model.value ? 'bg-white/10' : ''
                            }`}
                          onClick={() => {
                            setSelectedModel(model.value);
                            setShowModelDropdown(false);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 text-sm">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-white">{model.label}</span>
                                {model.provider && <span className="text-xs text-white/60">({model.provider})</span>}
                                {model.cost && <span className="text-xs font-medium text-white/70">{model.cost}</span>}
                                {model.context && (
                                  <span className="text-xs font-medium text-white/50">{model.context}</span>
                                )}
                              </div>
                              {model.description && (
                                <p className="text-xs leading-relaxed text-white/60">{model.description}</p>
                              )}
                            </div>
                            {selectedModel === model.value && <Check className="h-5 w-5 shrink-0 text-green-400" />}
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </label>
          </div>
        </section>

        {/* Method-specific inputs */}
        {isGit && (
          <section className="form-panel space-y-6 mt-10">
            {!checkingGitHub && !hasGitHubConnection && (
              <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/15 p-4 text-sm text-yellow-100">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">GitHub connection recommended</p>
                    <p className="mt-1 text-xs text-yellow-100/80">
                      Public repositories work without a connection, but you'll have lower rate limits (60 requests/hour).
                      Private repositories require a GitHub connection.
                    </p>
                    <a
                      href="/settings?tab=integrations"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline"
                    >
                      Connect GitHub for higher rate limits →
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="field-group">
              <span className="field-label">
                GitHub owner/organization <span className="text-red-400">*</span>
              </span>
              <div className="flex gap-2">
                <input
                  className="field-input"
                  value={ownerInput}
                  onChange={(e) => setOwnerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchRepos();
                    }
                  }}
                  placeholder="Enter owner/org (e.g., 'facebook' or 'github.com/facebook')"
                  required
                />
                <button
                  type="button"
                  className="secondary-action"
                  onClick={searchRepos}
                  disabled={!ownerInput.trim() || loadingRepos}
                >
                  Search
                </button>
              </div>
              <p className="field-note">Enter a GitHub username or organization to search for repositories.</p>
            </div>

            {showRepoSelector && baseOwner && (
              <div className="field-group">
                <span className="field-label">
                  Repository <span className="text-red-400">*</span>
                </span>
                <SearchableSelect
                  options={repos
                    .filter((r) => r && r.url && r.full_name)
                    .map((r) => ({
                      value: r.url || '',
                      label: `${r.full_name || ''}${r.private ? ' (private)' : ''}`,
                    }))}
                  value={repoUrl}
                  placeholder={loadingRepos ? 'Loading repositories...' : 'Search repositories...'}
                  searchPlaceholder="Search repositories..."
                  disabled={loadingRepos}
                  onChange={(value) => setRepoUrl(value)}
                  triggerClassName="field-select"
                />
                {loadingRepos ? (
                  <p className="field-note">Loading repositories…</p>
                ) : (
                  repos.length === 0 &&
                  baseOwner && <p className="field-note">No repositories found for {baseOwner}</p>
                )}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="field-group">
                <span className="field-label">Branch</span>
                <SearchableSelect
                  options={branches.map((b) => ({ value: b, label: b }))}
                  value={branch}
                  placeholder={loadingBranches ? 'Loading...' : branches.length === 0 ? 'Enter repo URL first' : 'Select branch...'}
                  searchPlaceholder="Search branches..."
                  disabled={loadingBranches || branches.length === 0}
                  onChange={(value) => setBranch(value)}
                  triggerClassName="field-select"
                />
              </div>

              {method === 'github_repo_directory' && (
                <div className="field-group">
                  <span className="field-label">Subdirectory (optional)</span>
                  <SearchableSelect
                    options={[
                      { value: '', label: 'Root (all files)' },
                      ...directories.map((d) => ({ value: d, label: d })),
                    ]}
                    value={subdir}
                    placeholder={
                      loadingDirectories
                        ? 'Loading...'
                        : directories.length === 0 && branch
                          ? 'No subdirectories found'
                          : 'Select subfolder...'
                    }
                    searchPlaceholder="Search directories..."
                    disabled={loadingDirectories || !branch}
                    onChange={(value) => setSubdir(value)}
                    triggerClassName="field-select"
                  />
                </div>
              )}
            </div>

            <div className="form-divider" />

            <div>
              <div className="mb-3 flex items-center justify-between text-sm text-white/80">
                <span>Files in repository{method === 'github_repo_directory' && subdir ? `/${subdir}` : ''}</span>
                <div className="flex items-center gap-2">
                  {showLoadButton && (
                    <button className="secondary-action px-3 py-1 text-xs" onClick={listGitFiles} disabled={listing}>
                      {listing ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </span>
                      ) : (
                        'Load files'
                      )}
                    </button>
                  )}
                  {pickerFiles.length > 0 && (
                    <>
                      <button className="secondary-action px-3 py-1 text-xs" onClick={selectAll}>
                        Select all
                      </button>
                      <button className="secondary-action px-3 py-1 text-xs" onClick={clearAll}>
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              {pickerFiles.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
                  <ul className="divide-y divide-white/10">
                    {pickerFiles.map((f) => (
                      <li key={f.path} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <input type="checkbox" checked={selectedPaths.has(f.path)} onChange={() => togglePick(f.path)} />
                        <span className="font-mono text-white/90">{f.path}</span>
                        <span className="ml-auto text-xs text-white/50">{f.size} bytes</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-white/60">No files loaded yet.</p>
              )}
            </div>
          </section>
        )}

        {method === 'zipped_folder' && (
          <section className="form-panel space-y-4 mt-6">
            <label className="field-group">
              <span className="field-label">Upload a .zip file</span>
              <input
                type="file"
                accept=".zip"
                className="field-input file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-white"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
              />
              {zipFile && <span className="field-note">Selected: {zipFile.name}</span>}
            </label>
          </section>
        )}

        {method === 'pasted_code' && (
          <section className="form-panel space-y-4 mt-6">
            <label className="field-group">
              <span className="field-label">Filename</span>
              <input
                className="field-input"
                value={pasteFilename}
                onChange={(e) => setPasteFilename(e.target.value)}
                placeholder="snippet.txt"
              />
            </label>
            <div className="form-divider" />
            <label className="field-group">
              <span className="field-label">Paste your code</span>
              <textarea
                className="field-input"
                style={{ minHeight: 180 }}
                value={pasteCode}
                onChange={(e) => setPasteCode(e.target.value)}
                placeholder="// paste here…"
              />
            </label>
          </section>
        )}

        {/* LLM Prompt Customization */}
        <section className="form-panel space-y-4 mt-6">
          <PromptCustomizer 
            promptConfig={promptConfig} 
            onChange={(config) => {
              setPromptConfig({
                personality: config.personality ?? 'default',
                style: config.style ?? 'default',
                audience: config.audience ?? 'technical',
                customInstructions: config.customInstructions ?? '',
                temperature: config.temperature ?? 0.3
              });
            }} 
          />
        </section>

        {/* Error / Status */}
        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
            {errorMsg}
          </div>
        )}
        {statusMsg && (
          <div className="mb-4 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/80">
            {statusMsg}
          </div>
        )}

        {/* Primary CTA */}
        <div className="flex flex-wrap gap-3 mt-6">
          <button className="primary-action flex-1 min-w-[200px]" onClick={analyzeAndSave} disabled={running}>
            {running ? (
              <span className="inline-flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing…
              </span>
            ) : (
              'Analyze & Save'
            )}
          </button>
          <a href="/edit" className="secondary-action min-w-[160px] text-center">
            View History
          </a>
        </div>
      </div>
    </div>
  );
}
