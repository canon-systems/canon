'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Github, FolderOpen, Loader2, AlertTriangle, Info, ChevronDown, Check, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PromptCustomizer } from '@/components/PromptCustomizer';
import { DocumentStructure, type DocumentStructureConfig } from '@/components/DocumentStructure';
import { SearchableSelect } from '@/components/SearchableSelect';
import { RepositoryConnectionWizard } from '@/components/RepositoryConnectionWizard';

type InputType = 'github_repo' | 'github_repo_directory';
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
    value: 'gpt-4o-2024-11-20',
    label: 'GPT-4o (Nov 2024)',
    provider: 'OpenAI',
    cost: '$$$$',
    context: '128K tokens',
    description: 'GPT-4o with November 2024 improvements. Enhanced performance and reliability.'
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
    value: 'gpt-4o-mini-2024-07-18',
    label: 'GPT-4o Mini (Jul 2024)',
    provider: 'OpenAI',
    cost: '$',
    context: '128K tokens',
    description: 'GPT-4o Mini with July 2024 improvements. Optimized for speed and efficiency.'
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
    value: 'o1-2024-08-06',
    label: 'O1 (Aug 2024)',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '128K tokens',
    description: 'O1 model with August 2024 improvements. Enhanced reasoning capabilities for complex tasks.'
  },
  {
    value: 'o1-mini',
    label: 'O1 Mini',
    provider: 'OpenAI',
    cost: '$$$',
    context: '128K tokens',
    description: 'A smaller, more affordable version of O1. Optimized for reasoning tasks with improved cost efficiency.'
  },
  {
    value: 'o1-mini-2024-09-12',
    label: 'O1 Mini (Sep 2024)',
    provider: 'OpenAI',
    cost: '$$$',
    context: '128K tokens',
    description: 'O1 Mini with September 2024 improvements. Better reasoning at a lower cost.'
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
    value: 'gpt-3.5-turbo',
    label: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    cost: '$',
    context: '16K tokens',
    description: 'A high-performance, cost-effective model optimized for chat and text completion tasks. Fast and efficient for most use cases.'
  },
  // Anthropic Models
  {
    value: 'claude-3-7-sonnet-20250219',
    label: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s most advanced model with superior performance on complex reasoning, coding, and analysis tasks. Released February 2025.'
  },
  {
    value: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    cost: '$$$$',
    context: '200K tokens',
    description: 'Our most intelligent model, with improved performance on coding tasks, math, and following complex, multi-step instructions. Excels at nuanced content creation and sophisticated Q&A.'
  },
  {
    value: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    cost: '$$',
    context: '200K tokens',
    description: 'An improved version of Haiku with better performance while maintaining speed and cost efficiency. Great for general-purpose tasks.'
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
  // Google Models
  {
    value: 'google/gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Google\'s latest 2.0 Flash model with massive 1M token context window. Supports text, vision, audio, and function calling. Optimized for speed and efficiency.'
  },
  {
    value: 'google/gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    provider: 'Google',
    cost: '$',
    context: '1M tokens',
    description: 'A lighter, more cost-effective version of Gemini 2.0 Flash. Fast and efficient for most use cases with reduced cost.'
  }
];

function getMethodIcon(m: InputType) {
  switch (m) {
    case 'github_repo':
      return Github;
    case 'github_repo_directory':
      return FolderOpen;
  }
}

interface RepoWithSetup {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  setup_branch: string;
  setup_status: string;
}

interface DocumentationPageClientProps {
  repoId?: string;
  repos?: RepoWithSetup[];
}

export function DocumentationPageClient({ repoId, repos: initialRepos = [] }: DocumentationPageClientProps = {}) {
  const router = useRouter();
  const supabase = createClient();
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const [method, setMethod] = useState<InputType>('github_repo');
  const [docTitle, setDocTitle] = useState('Documentation Draft');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Git inputs
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [subdir, setSubdir] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);

  // Enhanced repository selection
  const [selectedRepoUrl, setSelectedRepoUrl] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Dropdown options
  const [directories, setDirectories] = useState<string[]>([]);
  const [availableRepos, setAvailableRepos] = useState<RepoWithSetup[]>(initialRepos);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Create unique repository options (deduplicated by repo_url)
  const uniqueRepos = availableRepos.reduce((acc, repo) => {
    const existing = acc.find(r => r.repo_url === repo.repo_url);
    if (!existing) {
      acc.push({
        repo_url: repo.repo_url,
        name: repo.name,
        // Store all branches for this repo
        branches: availableRepos
          .filter(r => r.repo_url === repo.repo_url)
          .map(r => ({ id: r.id, branch: r.default_branch, setup_branch: r.setup_branch }))
      });
    }
    return acc;
  }, [] as Array<{
    repo_url: string;
    name: string;
    branches: Array<{ id: string; branch: string; setup_branch: string }>;
  }>);

  // Get available branches for selected repo
  const availableBranches = uniqueRepos.find(r => r.repo_url === selectedRepoUrl)?.branches || [];

  // Find the selected repo record based on repo URL and branch
  const selectedRepoRecord = availableBranches.find(b => b.branch === selectedBranch);


  // LLM Prompt customization
  const [promptConfig, setPromptConfig] = useState({
    personality: 'default',
    style: 'default',
    perspective: 'default',
    audience: 'technical',
    customInstructions: '',
    temperature: 0.3
  });

  // Document structure configuration
  const [structureConfig, setStructureConfig] = useState<DocumentStructureConfig>({
    sections: [],
    includeTableOfContents: false,
  });

  // Progress + errors
  const [listing, setListing] = useState(false);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // GitHub connection status
  const [hasGitHubConnection, setHasGitHubConnection] = useState(false);
  const [checkingGitHub, setCheckingGitHub] = useState(true);

  // Repository connection modal
  const [showConnectionWizard, setShowConnectionWizard] = useState(false);

  // Git file picker data
  const [pickerFiles, setPickerFiles] = useState<Array<{ path: string; size: number }>>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [fileSearchQuery, setFileSearchQuery] = useState('');

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

  const handleRepositoryConnected = async (repoId: string) => {
    setShowConnectionWizard(false);
    // Refresh the page to load the new repository
    window.location.reload();
  };

  // Reset file lists when Git inputs change
  useEffect(() => {
    if (!isGit) {
      setPickerFiles([]);
      setSelectedPaths(new Set());
      setFileSearchQuery('');
    }
  }, [isGit]);

  useEffect(() => {
    if (isGit) {
      setPickerFiles([]);
      setSelectedPaths(new Set());
      setFileSearchQuery('');
    }
  }, [method, repoUrl, branch, subdir, isGit]);

  // React to branch changes (both old and new flow)
  useEffect(() => {
    // Handle new enhanced selection flow - load directories whenever branch is selected
    if (selectedBranch && selectedRepoUrl) {
      fetchDirectoriesForSelection(selectedRepoUrl, selectedBranch);
      return;
    }

    // Handle old flow (backward compatibility)
    if (branch && repoUrl && repoUrl.includes('github.com') && !selectedRepoUrl) {
      fetchDirectories();
      return;
    }

    // Clear directories if no valid selection
    setDirectories([]);
    setSubdir('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, repoUrl, method, selectedBranch, selectedRepoUrl]);

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

  async function fetchDirectoriesForSelection(repoUrl: string, branchName: string) {
    if (!repoUrl.trim() || !repoUrl.includes('github.com') || !branchName) {
      setDirectories([]);
      return;
    }

    setLoadingDirectories(true);
    try {
      const response = await fetch('/api/github/directories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl, branch: branchName })
      });

      if (response.ok) {
        const data = await response.json();
        setDirectories(data.directories || []);
      } else {
        setDirectories([]);
      }
    } catch (err) {
      console.error('Failed to fetch directories for selection:', err);
      setDirectories([]);
    } finally {
      setLoadingDirectories(false);
    }
  }

  // Initialize repos from props and handle repoId selection
  useEffect(() => {
    setAvailableRepos(initialRepos);

    // If repoId is provided, select that repo
    if (repoId && initialRepos.length > 0) {
      const repo = initialRepos.find((r) => r.id === repoId);
      if (repo) {
        setSelectedRepoId(repo.id);
        setRepoUrl(repo.repo_url);
        setBranch(repo.setup_branch || 'main');
      }
    }
  }, [repoId, initialRepos]);

  // Update branch when repo is selected
  useEffect(() => {
    if (selectedRepoId) {
      const repo = availableRepos.find(r => r.id === selectedRepoId);
      if (repo) {
        setRepoUrl(repo.repo_url);
        setBranch(repo.setup_branch || 'main');
      }
    }
  }, [selectedRepoId, availableRepos]);

  async function listGitFiles() {
    if (!isGit) return;

    setErrorMsg('');
    setListing(true);
    setPickerFiles([]);
    setSelectedPaths(new Set());
    setFileSearchQuery('');

    try {
      const r = await fetch('/api/github/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          branch,
          subdir: subdir || ''
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

  // Filter files based on search query
  const filteredFiles = pickerFiles.filter(f =>
    f.path.toLowerCase().includes(fileSearchQuery.toLowerCase())
  );

  // File selection helpers
  function selectAll() {
    const filesToSelect = filteredFiles.map(f => f.path);
    const next = new Set(selectedPaths);
    filesToSelect.forEach(path => next.add(path));
    setSelectedPaths(next);
  }

  function clearAll() {
    const filesToClear = filteredFiles.map(f => f.path);
    const next = new Set(selectedPaths);
    filesToClear.forEach(path => next.delete(path));
    setSelectedPaths(next);
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
    const files = selectedArray();
    return [
      repoUrl || '',
      branch ? `@${branch}` : '',
      subdir ? `/${subdir}` : '',
      files.length ? ` • files: ${files.slice(0, 6).join(', ')}${files.length > 6 ? '…' : ''}` : ''
    ].join('');
  }

  async function analyzeAndSave() {
    setErrorMsg('');
    setStatusMsg('');
    setRunning(true);

    if (!selectedRepoId || !repoUrl || !repoUrl.includes('github.com')) {
      setErrorMsg('Please select a repository from the dropdown.');
      setRunning(false);
      return;
    }

    let documentId: string | null = null;

    try {
      setStatusMsg('Queuing…');
      const filesForLog = selectedArray();

      // Get or create workspace_repos entry
      let repoId: string;
      const { data: existingRepo } = await supabase
        .from('workspace_repos')
        .select('id')
        .eq('repo_url', repoUrl)
        .single();

      if (existingRepo) {
        repoId = existingRepo.id;
      } else {
        // Create new repo entry
        const { data: newRepo, error: repoError } = await supabase
          .from('workspace_repos')
          .insert({
            workspace_id: (await supabase.auth.getUser()).data.user?.id || '',
            name: repoUrl.split('/').pop()?.replace('.git', '') || 'Repository',
            repo_url: repoUrl,
            default_branch: branch || 'main',
            provider: 'github',
            auth_type: 'github_pat',
            settings: {
              model: selectedModel,
              llm_prompt_config: promptConfig,
              document_structure: structureConfig,
              ...(subdir ? { subdir } : {})
            }
          })
          .select('id')
          .single();

        if (repoError || !newRepo) {
          throw new Error(`Failed to create repository entry: ${repoError?.message || 'Unknown error'}`);
        }
        repoId = newRepo.id;
      }

      // Create document
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          repo_id: repoId,
          title: docTitle || 'Untitled',
          content: '' // Will be updated after generation
        })
        .select('id')
        .single();

      if (docError) throw new Error(docError.message);
      documentId = docData?.id ?? null;

      if (!documentId) throw new Error('Insert did not return a document id.');

      // Save file mappings
      const fileMappings = filesForLog.map(filePath => ({
        document_id: documentId,
        file_path: filePath
      }));

      await supabase
        .from('document_files')
        .insert(fileMappings);

      // Gather files/content for LLM
      setStatusMsg('Collecting source files…');
      let filesForDoc: Array<{ path: string; content: string }> = [];

      const chosen = selectedArray();
      if (!chosen.length) throw new Error('Pick at least one file.');
      const r = await fetch('/api/github/batchRaw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          branch,
          subdir: subdir || '',
          selectedFiles: chosen,
          includeContent: true,
          previewChars: 0,
          maxBytes: 200_000
        })
      });
      const githubData = await r.json().catch(() => ({}));
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
        throw new Error(githubData?.error || githubData?.detail || `Git fetch failed (${r.status})`);
      }
      const got = Array.isArray(githubData.files) ? githubData.files : [];
      filesForDoc = got.map((f: any) => ({ path: f.path, content: String(f.content || '') }));

      if (!filesForDoc.length) throw new Error('No content gathered for summarization.');

      // Prepare summaries first for Git documents
      if (documentId) {
        setStatusMsg('Preparing file summaries…');
        try {
          const prepareRes = await fetch('/api/docs/prepare', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              documentId, // Use documentId instead of submissionId
              regenerateAll: false
            })
          });

          if (prepareRes.ok) {
            const prepareData = await prepareRes.json().catch(() => ({}));
            const filesUpdated = prepareData.filesUpdated || 0;
            const filesSkipped = prepareData.filesSkipped || 0;
            setStatusMsg(`Prepared summaries (${filesUpdated} updated, ${filesSkipped} skipped)…`);
          } else {
            console.warn('Failed to prepare summaries, continuing with full content');
          }
        } catch (prepareError) {
          console.error('Error preparing summaries:', prepareError);
          // Continue anyway - will fallback to full content
        }
      }

      // Generate documentation
      setStatusMsg('Generating documentation…');
      const rGen = await fetch('/api/docs/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectName: docTitle || 'Documentation Draft',
          files: filesForDoc,
          model: selectedModel,
          promptConfig: {
            ...promptConfig,
            document_structure: structureConfig
          },
          repoUrl,
          branch,
          subdir: subdir || undefined,
          prepareFirst: documentId ? true : false,
          documentId: documentId ? documentId : undefined,
          useSummaries: documentId ? true : false
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
      if (repoUrl && branch) {
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

      // Update document with generated content
      const { error: uerr } = await supabase
        .from('documents')
        .update({
          title: docTitle || 'Untitled',
          content: markdown,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      if (uerr) throw new Error(uerr.message);

      // Create initial version
      const { data: versionData } = await supabase.rpc('get_next_document_version', {
        doc_id: documentId
      });
      const versionNumber = versionData || 1;

      await supabase.from('document_versions').insert({
        document_id: documentId,
        version_number: versionNumber,
        content: markdown,
        change_summary: 'Initial version'
      });

      // Note: Files are already tracked in document_files when document was created
      // No need for separate post-process step

      setStatusMsg('Done. Redirecting…');
      router.push(`/edit/${documentId}`);
    } catch (e) {
      setErrorMsg(String(e));
      setStatusMsg('');
      // Note: Documents don't have status field, so we can't mark as failed
      // Error is already shown to user via setErrorMsg
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
            Connect to a GitHub repository and generate comprehensive documentation automatically.
          </p>
        </div>

        <section className="form-panel space-y-6 relative z-10">
          <div>
            <p className="section-label">Repository Scope</p>
            <p className="section-helper">Choose whether to analyze the entire repository or focus on a specific directory.</p>
          </div>

          <div className="method-grid">
            {[
              { id: 'github_repo', label: 'Full Repository', description: 'Document entire repository or focus on specific folder' },
              { id: 'github_repo_directory', label: 'Directory Mode', description: 'Start with a specific directory selection' },
            ].map((opt) => {
              const Icon = getMethodIcon(opt.id as InputType);
              return (
                <button
                  key={opt.id}
                  className="method-pill"
                  data-active={method === opt.id}
                  onClick={() => setMethod(opt.id as InputType)}
                  aria-pressed={method === opt.id}
                  title={opt.description}
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
              <div className="relative z-[100]" ref={modelDropdownRef}>
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
                  <div className="absolute z-[100] mt-1 max-h-96 w-full overflow-auto rounded-lg border border-white/15 bg-[#0f0f12] shadow-xl">
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
                Repository <span className="text-red-400">*</span>
              </span>
              <SearchableSelect
                options={uniqueRepos.map((repo) => ({
                  value: repo.repo_url,
                  label: `${repo.name} (${repo.repo_url.replace('https://github.com/', '')})`,
                }))}
                value={selectedRepoUrl || ''}
                placeholder={loadingRepos ? 'Loading repositories...' : uniqueRepos.length === 0 ? 'No repositories available' : 'Select a repository...'}
                searchPlaceholder="Search repositories..."
                disabled={loadingRepos || uniqueRepos.length === 0}
                onChange={(repoUrl) => {
                  setSelectedRepoUrl(repoUrl);
                  setSelectedBranch(''); // Reset branch selection
                  setSelectedRepoId(null); // Reset repo record ID
                  setDirectories([]); // Clear directories when repo changes
                }}
                triggerClassName="field-select"
              />
              {loadingRepos ? (
                <p className="field-note">Loading repositories…</p>
              ) : uniqueRepos.length === 0 ? (
                <div className="field-note flex items-center justify-between">
                  <span>No repositories with file summaries found. Complete repository setup first.</span>
                  <Link
                    href="/repos"
                    className="text-sm text-blue-400 hover:text-blue-300 underline"
                  >
                    Go to Repositories →
                  </Link>
                </div>
              ) : (
                <p className="field-note">Select a repository that has been set up with file summaries.</p>
              )}
            </div>

            {/* Branch Selection */}
            {selectedRepoUrl && (
              <div className="field-group">
                <span className="field-label">
                  Branch <span className="text-red-400">*</span>
                </span>
                <SearchableSelect
                  options={availableBranches.map((branch) => ({
                    value: branch.branch,
                    label: branch.branch,
                  }))}
                  value={selectedBranch}
                  placeholder="Select a branch..."
                  searchPlaceholder="Search branches..."
                  disabled={availableBranches.length === 0}
                  onChange={(branch) => {
                    setSelectedBranch(branch);
                    // Find the repo record for this branch
                    const repoRecord = availableBranches.find(b => b.branch === branch);
                    setSelectedRepoId(repoRecord?.id || null);
                    // Update the branch state for API calls
                    setBranch(branch);
                    setDirectories([]); // Clear directories when branch changes
                  }}
                  triggerClassName="field-select"
                />
                {availableBranches.length === 0 && (
                  <p className="field-note text-yellow-400">No branches available for this repository.</p>
                )}
                {availableBranches.length > 0 && (
                  <p className="field-note">Select the branch you want to generate documentation for.</p>
                )}
              </div>
            )}

            {/* Folder Selection for new flow - available whenever branch is selected */}
            {selectedBranch && (
              <div className="field-group">
                <span className="field-label">
                  Focus Folder <span className="text-xs text-white/50">(optional)</span>
                </span>
                <SearchableSelect
                  options={[
                    { value: '', label: '📁 Root directory (all files)' },
                    ...directories.map((d) => ({ value: d, label: `📂 ${d}` })),
                  ]}
                  value={subdir}
                  placeholder={
                    loadingDirectories
                      ? 'Loading folders...'
                      : directories.length === 0
                        ? 'No folders found'
                        : 'Choose folder to focus on...'
                  }
                  searchPlaceholder="Search folders..."
                  disabled={loadingDirectories}
                  onChange={setSubdir}
                  triggerClassName="field-select"
                />
                <p className="field-note">
                  {subdir
                    ? `Documentation will focus on the "${subdir}" folder and its contents.`
                    : 'Leave empty to include all files in the repository, or select a specific folder to focus the documentation.'
                  }
                </p>
              </div>
            )}

            {/* Show old branch input only when no repository is selected (backward compatibility) */}
            {!selectedRepoUrl && (
              <div className="field-group">
                <span className="field-label">Branch</span>
                <input
                  className="field-input"
                  value={branch}
                  readOnly
                  disabled
                  placeholder="Branch from repository setup"
                />
                <p className="field-note">Branch is set from the initial repository setup and cannot be changed.</p>
              </div>
            )}

            <div className="form-divider" />

            <div>
              <div className="mb-3 flex items-center justify-between text-sm text-white/80">
                <span>Files in repository{subdir ? `/${subdir}` : ''}</span>
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
                        Select all{fileSearchQuery ? ` (${filteredFiles.length})` : ''}
                      </button>
                      <button className="secondary-action px-3 py-1 text-xs" onClick={clearAll}>
                        Clear{fileSearchQuery ? ` (${filteredFiles.length})` : ''}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {pickerFiles.length > 0 && (
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      className="field-input pl-9 pr-9"
                      placeholder="Search files..."
                      value={fileSearchQuery}
                      onChange={(e) => setFileSearchQuery(e.target.value)}
                    />
                    {fileSearchQuery && (
                      <button
                        onClick={() => setFileSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {fileSearchQuery && (
                    <p className="mt-1 text-xs text-white/50">
                      Showing {filteredFiles.length} of {pickerFiles.length} files
                    </p>
                  )}
                </div>
              )}

              {pickerFiles.length > 0 ? (
                filteredFiles.length > 0 ? (
                  <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
                    <ul className="divide-y divide-white/10">
                      {filteredFiles.map((f) => (
                        <li key={f.path} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <input type="checkbox" checked={selectedPaths.has(f.path)} onChange={() => togglePick(f.path)} />
                          <span className="font-mono text-white/90">{f.path}</span>
                          <span className="ml-auto text-xs text-white/50">{f.size ? `${f.size} bytes` : '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 p-4 text-center text-sm text-white/60">
                    No files match "{fileSearchQuery}"
                  </div>
                )
              ) : (
                <p className="text-sm text-white/60">No files loaded yet.</p>
              )}
            </div>
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
                perspective: config.perspective ?? 'default',
                audience: config.audience ?? 'technical',
                customInstructions: config.customInstructions ?? '',
                temperature: config.temperature ?? 0.3
              });
            }}
          />
        </section>

        {/* Document Structure */}
        <section className="form-panel space-y-4 mt-6">
          <DocumentStructure
            config={structureConfig}
            onChange={setStructureConfig}
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

      {/* Repository Connection Modal */}
      {showConnectionWizard && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="relative">
              <button
                onClick={() => setShowConnectionWizard(false)}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <RepositoryConnectionWizard
                onComplete={handleRepositoryConnected}
                onCancel={() => setShowConnectionWizard(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
