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

export function SubmitPageClient() {
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
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">Submit Source</h1>
          <p className="text-white/70">
            Pick a method, provide inputs, select files (for Git), then Analyze & Save.
          </p>
        </div>

        {/* Method selector */}
        <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { id: 'github_repo', label: 'Git Repo' },
            { id: 'github_repo_directory', label: 'Git Directory' },
            { id: 'zipped_folder', label: 'Zip Upload' },
            { id: 'pasted_code', label: 'Paste Code' }
          ].map(opt => {
            const Icon = getMethodIcon(opt.id as InputType);
            return (
              <button
                key={opt.id}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm text-white transition hover:bg-white/10 ${
                  method === opt.id
                    ? 'border-white/35 bg-white/12'
                    : 'border-white/20'
                }`}
                onClick={() => setMethod(opt.id as InputType)}
                aria-pressed={method === opt.id}
              >
                <Icon className="h-4 w-4" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Common: Title and Model */}
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-sm text-white/70">Document title</div>
            <input
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="e.g., API Overview"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm text-white/70">AI Model</div>
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-white outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => !running && setShowModelDropdown(!showModelDropdown)}
                disabled={running}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {selectedModelObj ? (
                    <>
                      <span className="font-medium">{selectedModelObj.label}</span>
                      <span className="text-xs text-white/60">({selectedModelObj.provider})</span>
                      <span className="text-xs text-yellow-400">{selectedModelObj.cost}</span>
                      <span className="text-xs text-blue-400">{selectedModelObj.context}</span>
                    </>
                  ) : (
                    <span className="font-medium">Select model...</span>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 text-white/60 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showModelDropdown && (
                <div className="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-white/20 bg-gray-900 shadow-xl">
                  {availableModels.filter(m => m && m.value && m.label).map(model => (
                    <button
                      key={model.value}
                      type="button"
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/10 focus:bg-white/10 focus:outline-none ${
                        selectedModel === model.value ? 'bg-white/15' : ''
                      }`}
                      onClick={() => {
                        setSelectedModel(model.value);
                        setShowModelDropdown(false);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{model.label}</span>
                            {model.provider && <span className="text-xs text-white/60">({model.provider})</span>}
                            {model.cost && <span className="text-xs font-medium text-yellow-400">{model.cost}</span>}
                            {model.context && <span className="text-xs font-medium text-blue-400">{model.context}</span>}
                          </div>
                          {model.description && (
                            <p className="text-xs leading-relaxed text-white/70">{model.description}</p>
                          )}
                        </div>
                        {selectedModel === model.value && (
                          <Check className="h-5 w-5 shrink-0 text-green-400" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
        </div>

        {/* Method-specific inputs */}
        {isGit && (
          <>
            {!checkingGitHub && !hasGitHubConnection && (
              <div className="mb-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" />
                  <div className="flex-1">
                    <p className="mb-1 text-sm font-medium text-yellow-200">GitHub Connection Recommended</p>
                    <p className="mb-2 text-xs text-yellow-200/80">
                      Public repositories will work without a connection, but you'll have lower rate
                      limits (60 requests/hour). Private repositories require a GitHub connection.
                    </p>
                    <a
                      href="/settings?tab=integrations"
                      className="inline-flex items-center gap-1 text-xs text-yellow-300 underline hover:text-yellow-200"
                    >
                      Connect GitHub for higher rate limits and private repo access
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <div className="mb-1 text-sm text-white/70">
                  GitHub Owner/Organization <span className="text-red-400">*</span>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
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
                    className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={searchRepos}
                    disabled={!ownerInput.trim() || loadingRepos}
                  >
                    Search
                  </button>
                </div>
                <p className="mt-1 text-xs text-white/50">
                  Enter a GitHub username or organization to search for repositories
                </p>
              </label>

              {showRepoSelector && baseOwner && (
                <label className="block md:col-span-2">
                  <div className="mb-1 text-sm text-white/70">
                    Repository <span className="text-red-400">*</span>
                  </div>
                  <SearchableSelect
                    options={repos
                      .filter(r => r && r.url && r.full_name)
                      .map(r => ({
                        value: r.url || '',
                        label: `${r.full_name || ''}${r.private ? ' (private)' : ''}`
                      }))}
                    value={repoUrl}
                    placeholder={loadingRepos ? 'Loading repositories...' : 'Search repositories...'}
                    searchPlaceholder="Search repositories..."
                    disabled={loadingRepos}
                    onChange={(value) => setRepoUrl(value)}
                  />
                  {loadingRepos && <p className="mt-1 text-xs text-white/50">Loading repositories...</p>}
                  {!loadingRepos && repos.length === 0 && baseOwner && (
                    <p className="mt-1 text-xs text-white/50">No repositories found for {baseOwner}</p>
                  )}
                </label>
              )}

              <label className="block">
                <div className="mb-1 text-sm text-white/70">Branch</div>
                <SearchableSelect
                  options={branches.map(b => ({ value: b, label: b }))}
                  value={branch}
                  placeholder={loadingBranches ? 'Loading...' : branches.length === 0 ? 'Enter repo URL first' : 'Select branch...'}
                  searchPlaceholder="Search branches..."
                  disabled={loadingBranches || branches.length === 0}
                  onChange={(value) => setBranch(value)}
                />
                {loadingBranches && <p className="mt-1 text-xs text-white/50">Loading branches...</p>}
              </label>

              {method === 'github_repo_directory' && (
                <label className="block">
                  <div className="mb-1 text-sm text-white/70">Subfolder (optional)</div>
                  <SearchableSelect
                    options={[
                      { value: '', label: 'Root (all files)' },
                      ...directories.map(d => ({ value: d, label: d }))
                    ]}
                    value={subdir}
                    placeholder={loadingDirectories ? 'Loading...' : directories.length === 0 && branch ? 'No subdirectories found' : 'Select subfolder...'}
                    searchPlaceholder="Search directories..."
                    disabled={loadingDirectories || !branch}
                    onChange={(value) => setSubdir(value)}
                  />
                  {loadingDirectories && <p className="mt-1 text-xs text-white/50">Loading directories...</p>}
                </label>
              )}
            </div>

            {/* Git file list */}
            <div className="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-white/70">
                  Files in repository{method === 'github_repo_directory' && subdir ? `/${subdir}` : ''}
                </div>
                <div className="flex items-center gap-2">
                  {showLoadButton && (
                    <button
                      className="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={listGitFiles}
                      disabled={listing}
                    >
                      {listing ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </span>
                      ) : (
                        'Load files'
                      )}
                    </button>
                  )}

                  {pickerFiles.length > 0 && (
                    <>
                      <button
                        className="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10"
                        onClick={selectAll}
                      >
                        Select all
                      </button>
                      <button
                        className="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10"
                        onClick={clearAll}
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              {pickerFiles.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded-lg border border-white/10">
                  <ul className="divide-y divide-white/10">
                    {pickerFiles.map(f => (
                      <li key={f.path} className="flex items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedPaths.has(f.path)}
                          onChange={() => togglePick(f.path)}
                        />
                        <span className="font-mono text-sm text-white/90">{f.path}</span>
                        <span className="ml-auto text-xs text-white/50">{f.size} bytes</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-sm text-white/60">No files loaded yet.</div>
              )}
            </div>
          </>
        )}

        {method === 'zipped_folder' && (
          <div className="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
            <label className="block">
              <div className="mb-1 text-sm text-white/70">Upload a .zip file</div>
              <input
                type="file"
                accept=".zip"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white file:mr-3 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-1 file:text-white hover:bg-white/5"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
              />
              {zipFile && <div className="mt-2 text-sm text-white/70">Selected: {zipFile.name}</div>}
            </label>
          </div>
        )}

        {method === 'pasted_code' && (
          <div className="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-sm text-white/70">Filename</div>
                <input
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
                  value={pasteFilename}
                  onChange={(e) => setPasteFilename(e.target.value)}
                  placeholder="snippet.txt"
                />
              </label>
              <div></div>
              <label className="block md:col-span-2">
                <div className="mb-1 text-sm text-white/70">Paste your code</div>
                <textarea
                  className="h-48 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
                  value={pasteCode}
                  onChange={(e) => setPasteCode(e.target.value)}
                  placeholder="// paste here…"
                />
              </label>
            </div>
          </div>
        )}

        {/* LLM Prompt Customization */}
        <div className="mb-6">
          <PromptCustomizer promptConfig={promptConfig} onChange={setPromptConfig} />
        </div>

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
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
            onClick={analyzeAndSave}
            disabled={running}
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing…</span>
              </>
            ) : (
              <span>Analyze & Save</span>
            )}
          </button>

          <a
            href="/edit"
            className="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
          >
            View History
          </a>
        </div>
      </div>
    </div>
  );
}
