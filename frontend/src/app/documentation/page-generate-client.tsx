'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Github, FolderOpen, Loader2, AlertTriangle, Info, ChevronDown, Check, Search, X, Grid3x3, List, MoreVertical, Clock, CheckCircle2, AlertCircle, FileText, ExternalLink, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PromptCustomizer } from '@/components/PromptCustomizer';
import { DocumentStructure, type DocumentStructureConfig } from '@/components/DocumentStructure';
import { SearchableSelect } from '@/components/SearchableSelect';
import { RepositoryConnectionWizard } from '@/components/RepositoryConnectionWizard';
import { getIntegrationsCached } from '@/lib/client/integrationsCache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';

type InputType = 'github_repo' | 'github_repo_directory';
type TabId = 'generate' | 'edit';

interface DocItem {
  id: string;
  title: string;
  status: 'published';
  repo: string;
  branch: string;
  path: string;
  commit: string;
  createdAt: string;
  updatedAt: string;
  lastPushedProvider?: string;
  lastPushedAt?: string;
  lastPushedUrl?: string | null;
  processingStatus: 'processing' | 'completed' | 'failed';
  isOutdated: boolean;
}

type ViewMode = 'tile' | 'row';
type StatusFilter = 'all' | 'published';
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
    value: 'openai/gpt-5.2',
    label: 'GPT-5.2',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '400K tokens',
    description: 'OpenAI\'s latest flagship model with enhanced capabilities and improved performance across all tasks.'
  },
  {
    value: 'openai/gpt-5',
    label: 'GPT-5',
    provider: 'OpenAI',
    cost: '$$$$$',
    context: '400K tokens',
    description: 'OpenAI\'s powerful GPT-5 model with advanced reasoning and multimodal capabilities.'
  },
  {
    value: 'openai/gpt-5-nano',
    label: 'GPT-5 Nano',
    provider: 'OpenAI',
    cost: '$$',
    context: '400K tokens',
    description: 'A compact, cost-effective GPT-5 variant optimized for efficiency.'
  },
  {
    value: 'openai/gpt-4o',
    label: 'GPT-4',
    provider: 'OpenAI',
    cost: '$$$$',
    context: '128K tokens',
    description: 'OpenAI\'s advanced multimodal flagship model that\'s faster and 50% cheaper than GPT-4 Turbo. GPT-4o ("o" for "omni") is trained across text, vision, and audio.'
  },
  {
    value: 'openai/gpt-4.1-nano',
    label: 'GPT-4 Nano',
    provider: 'OpenAI',
    cost: '$$',
    context: '128K tokens',
    description: 'A compact, cost-effective GPT-4 variant optimized for efficiency and speed.'
  },
  // Anthropic Models
  {
    value: 'anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s advanced Sonnet 4 model with superior performance on complex reasoning, coding, and analysis tasks.'
  },
  {
    value: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s most advanced Sonnet model with superior performance on complex reasoning, coding, and analysis tasks.'
  },
  {
    value: 'anthropic/claude-opus-4',
    label: 'Claude Opus 4',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s powerful Opus 4 model for highly complex tasks requiring deep analysis, complex content creation, and research.'
  },
  {
    value: 'anthropic/claude-opus-4.5',
    label: 'Claude Opus 4.5',
    provider: 'Anthropic',
    cost: '$$$$$',
    context: '200K tokens',
    description: 'Anthropic\'s most powerful model for highly complex tasks requiring deep analysis, complex content creation, and research.'
  },
  // Google Models
  {
    value: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    cost: '$$$$',
    context: '1M tokens',
    description: 'Google\'s powerful Gemini 2.5 Pro model with massive 1M token context window. Supports text, vision, audio, and function calling.'
  },
  {
    value: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Google\'s Gemini 2.5 Flash model optimized for speed and efficiency with massive 1M token context window.'
  },
  {
    value: 'google/gemini-3-pro-preview',
    label: 'Gemini 3 Pro',
    provider: 'Google',
    cost: '$$$$$',
    context: '1M tokens',
    description: 'Google\'s latest Gemini 3 Pro model. Excels at reasoning, agentic workflows, multi-step function calling, and planning. Shows 17% improvement in correctness over Gemini 2.5 Pro.'
  },
  {
    value: 'google/gemini-3-flash',
    label: 'Gemini 3 Flash',
    provider: 'Google',
    cost: '$$',
    context: '1M tokens',
    description: 'Google\'s latest Gemini 3 Flash model optimized for speed and efficiency with massive 1M token context window.'
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
  const searchParams = useSearchParams();
  const supabase = createClient();
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Tab management
  const [activeTab, setActiveTab] = useState<TabId>('edit');

  // Generate tab state
  const [method, setMethod] = useState<InputType>('github_repo');
  const [docTitle, setDocTitle] = useState('Documentation Draft');
  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Edit tab state
  const [editItems, setEditItems] = useState<DocItem[]>([]);
  const [editLoading, setEditLoading] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('row');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [repos, setRepos] = useState<Array<{ id: string; name: string; repo_url: string }>>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement>>({});

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
  const [loadingRepos] = useState(false);

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

  // Removed unused variable: selectedRepoRecord


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

  // Tab initialization
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const validTabs: TabId[] = ['generate', 'edit'];
    if (tabParam && validTabs.includes(tabParam as TabId)) {
      setActiveTab(tabParam as TabId);
    }
  }, [searchParams]);

  // Load view preference from localStorage for edit tab
  useEffect(() => {
    if (activeTab === 'edit') {
      const saved = localStorage.getItem('edit-view-mode') as ViewMode | null;
      if (saved === 'tile' || saved === 'row') {
        setViewMode(saved);
      }
    }
  }, [activeTab]);

  // Close menu on outside click for edit tab
  useEffect(() => {
    if (activeTab === 'edit') {
      function handleClickOutside(event: MouseEvent) {
        if (!openMenuId) return;
        const target = event.target as HTMLElement;
        const menu = menuRefs.current[openMenuId];
        const button = target.closest('button[title="More options"]');
        if (menu && !menu.contains(target) && !button) {
          setOpenMenuId(null);
        }
      }
      if (openMenuId) {
        document.addEventListener('click', handleClickOutside);
      }
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [openMenuId, activeTab]);

  // Check GitHub connection status
  useEffect(() => {
    async function checkGitHubConnection() {
      setCheckingGitHub(true);
      try {
        const data = await getIntegrationsCached();
        setHasGitHubConnection((data.connections || []).some(
          (c) =>
            c.provider === 'github' && c.status === 'active'
        ));
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRepositoryConnected = async (_repoId: string) => {
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
        const detail = data?.detail || data?.error;
        if (r.status === 404) {
          if (detail) throw new Error(detail);
          if (!hasGitHubConnection) {
            throw new Error('Repository not found or is private. Install the GitHub App in Settings to access repositories.');
          } else {
            throw new Error("Repository not found or you don't have access to it.");
          }
        } else if (r.status === 403) {
          if (detail) throw new Error(detail);
          if (!hasGitHubConnection) {
            throw new Error('Access denied. Install the GitHub App in Settings to access repositories.');
          } else {
            throw new Error('Access denied. Please check the GitHub App installation in Settings.');
          }
        }
        throw new Error(detail || `Git list failed (${r.status})`);
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

  // Removed unused function: detectRepoProvider


  async function analyzeAndSave() {
    setErrorMsg('');
    setStatusMsg('');
    setRunning(true);

    if (!selectedRepoId || !repoUrl || !repoUrl.includes('github.com')) {
      setErrorMsg('Please select a source from the dropdown.');
      setRunning(false);
      return;
    }

    let documentId: string | null = null;

    try {
      setStatusMsg('Queuing…');
      const filesForLog = selectedArray();

      // Validate that source exists and is properly set up
      if (!selectedRepoId) {
        throw new Error('Please select a source from the dropdown. Sources must be set up first before creating documents.');
      }

      const { data: existingRepo } = await supabase
        .from('workspace_sources')
        .select('id')
        .eq('id', selectedRepoId)
        .single();

      if (!existingRepo) {
        throw new Error('Selected source not found. Please go to the Sources page to set up this source first.');
      }

      const sourceId = existingRepo.id;

      // Prepare configuration settings
      const regenerationSettings = {
        personality: promptConfig.personality || 'default',
        style: promptConfig.style || 'default',
        perspective: promptConfig.perspective || 'default',
        audience: promptConfig.audience || 'technical',
        temperature: promptConfig.temperature || 0.3,
        customInstructions: promptConfig.customInstructions || '',
        documentStructure: structureConfig,
        model: selectedModel
      };

      // Create document with configuration
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          source_id: sourceId,
          title: docTitle || 'Untitled',
          content: '', // Will be updated after generation
          configuration: regenerationSettings
        })
        .select('id')
        .single();

      if (docError) throw new Error(docError.message);
      documentId = docData?.id ?? null;

      if (!documentId) throw new Error('Insert did not return a document id.');

      // Save file mappings
      const fileMappings = filesForLog.map(filePath => ({
        document_id: documentId,
        source_id: sourceId,
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
            throw new Error('Repository not found or is private. Install the GitHub App in Settings to access repositories.');
          } else {
            throw new Error("Repository not found or you don't have access to it.");
          }
        } else if (r.status === 403) {
          if (!hasGitHubConnection) {
            throw new Error('Rate limit exceeded or access denied. Install the GitHub App in Settings to access repositories.');
          } else {
            throw new Error('Access denied. Please check the GitHub App installation in Settings.');
          }
        }
        throw new Error(githubData?.error || githubData?.detail || `Git fetch failed (${r.status})`);
      }
      const got = Array.isArray(githubData.files) ? githubData.files : [];
      filesForDoc = got.map((f: { path: string; content?: string }) => ({ path: f.path, content: String(f.content || '') }));

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
      let gen: Record<string, unknown>;
      try {
        gen = JSON.parse(text);
      } catch {
        throw new Error(`Expected JSON from generator but got non-JSON (status ${rGen.status}). First bytes: ${text.slice(0, 200)}`);
      }
      if (!rGen.ok) {
        const errorMessage = (gen?.error && typeof gen.error === 'string') 
          ? gen.error 
          : `Generate failed (${rGen.status})`;
        throw new Error(errorMessage);
      }
      const markdown = String(gen.markdown || '');

      // Save final result
      setStatusMsg('Saving…');
      // Removed unused codeSnapshot variable and related fetch logic

      // Update document with generated content
      const { error: uerr } = await supabase
        .from('documents')
        .update({
          title: docTitle || 'Untitled',
          content: markdown,
          updated_at: new Date().toISOString(),
          configuration: regenerationSettings
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

  // Edit tab functions
  const loadEditItems = useCallback(async () => {
    setEditLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(searchQuery && { search: searchQuery }),
        ...(repoFilter !== 'all' && { source_id: repoFilter }),
      });

      const response = await fetch(`/api/docs/list?${queryParams}`);
      if (!response.ok) throw new Error('Failed to load documents');

      const data = await response.json();
      setEditItems(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setEditLoading(false);
    }
  }, [page, statusFilter, searchQuery, repoFilter, setEditItems, setEditLoading, setEditError, setTotalPages, setTotal]);

  const loadRepos = useCallback(async () => {
    try {
      const response = await fetch('/api/repos');
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos || []);
      }
    } catch (err) {
      console.error('Failed to load repos:', err);
    }
  }, [setRepos]);

  // Load edit data when edit tab is active
  useEffect(() => {
    if (activeTab === 'edit') {
      loadEditItems();
      loadRepos();
    }
  }, [activeTab, loadEditItems, loadRepos]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function deleteItem(id: string, _title: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/docs/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete document');
      }

      await loadEditItems();
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  }


  function setActiveTabAndUpdateUrl(value: string) {
    const tabId = value as TabId;
    setActiveTab(tabId);
    router.push(`/documentation?tab=${tabId}`, { scroll: false });
  }

  const tabs: Array<{ id: TabId; name: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'edit', name: 'Edit', icon: BookOpen },
    { id: 'generate', name: 'Generate', icon: FileText }
  ];

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Documentation</h1>
          </div>
          <p className="text-white/70">
            Generate new documentation or edit existing documents.
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTabAndUpdateUrl} className="mb-8">
          <TabsList className="bg-white/5 border border-white/10 backdrop-blur">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id} 
                  className="flex items-center gap-2 text-white/70 data-[state=active]:bg-white/15 data-[state=active]:text-white data-[state=active]:border data-[state=active]:border-white/20 data-[state=inactive]:hover:text-white data-[state=inactive]:hover:bg-white/5"
                >
                  <Icon className="h-4 w-4" />
                  {tab.name}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="generate" className="mt-6">
            <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg backdrop-blur">
              <CardHeader className="space-y-1 pb-6">
                <CardTitle className="text-2xl font-semibold text-white">Generate Documentation</CardTitle>
                <CardDescription className="text-white/70">
                  Select your repository, configure settings, and generate comprehensive documentation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    analyzeAndSave();
                  }}
                  className="space-y-8"
                >
                  {/* Input Type Selection */}
                  <div className="space-y-3">
                    <div>
                      <Label className="text-base font-medium text-white">Input Type</Label>
                      <p className="text-sm text-white/60">Select how you want to generate documentation.</p>
                    </div>
                    <RadioGroup value={method} onValueChange={(value) => setMethod(value as InputType)}>
                      {[
                        { id: 'github_repo', label: 'Full Repository', description: 'Document the entire repository or a specific folder' },
                        { id: 'github_repo_directory', label: 'Directory Mode', description: 'Start with a specific directory path' },
                      ].map((opt) => {
                        const Icon = getMethodIcon(opt.id as InputType);
                        return (
                          <RadioGroupItem key={opt.id} value={opt.id}>
                            <div className="flex items-start gap-3">
                              <Icon className="mt-0.5 h-5 w-5 text-white/70" />
                              <div>
                                <div className="font-medium text-white">{opt.label}</div>
                                <div className="mt-1 text-sm text-white/60">{opt.description}</div>
                              </div>
                            </div>
                          </RadioGroupItem>
                        );
                      })}
                    </RadioGroup>
                  </div>

                  <Separator />

                  {/* Basic Information */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-medium text-white">Basic Information</Label>
                      <p className="text-sm text-white/60">Provide essential details for your documentation.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="doc-title">Document title</Label>
                        <Input id="doc-title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g., API Overview" />
                      </div>
                      <div className="space-y-2">
                        <Label>LLM Model</Label>
                        <div className="relative z-[100]" ref={modelDropdownRef}>
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full justify-between bg-white/5"
                            onClick={() => !running && setShowModelDropdown(!showModelDropdown)}
                            disabled={running}
                          >
                            <div className="flex flex-col text-left">
                              <span className="font-semibold text-white">{selectedModelObj?.label ?? 'Select model'}</span>
                              <span className="text-xs text-white/60">
                                {selectedModelObj ? `${selectedModelObj.provider} • ${selectedModelObj.cost} • ${selectedModelObj.context}` : 'Pick a model'}
                              </span>
                            </div>
                            <ChevronDown className={`h-4 w-4 text-white/60 transition ${showModelDropdown ? 'rotate-180' : ''}`} />
                          </Button>
                          {showModelDropdown && (
                            <div className="absolute z-[100] mt-2 max-h-96 w-full overflow-auto rounded-xl border border-white/10 bg-black/95 shadow-2xl backdrop-blur-xl">
                              {availableModels.map((model) => (
                                <Button
                                  key={model.value}
                                  type="button"
                                  variant="ghost"
                                  className={`w-full justify-start px-4 py-3 text-left text-white hover:bg-white/10 focus:bg-white/10 ${selectedModel === model.value ? 'bg-white/15' : ''}`}
                                  onClick={() => {
                                    setSelectedModel(model.value);
                                    setShowModelDropdown(false);
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-3 w-full">
                                    <div className="min-w-0 flex-1 text-sm">
                                      <div className="mb-1 flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-white">{model.label}</span>
                                        {model.provider && <span className="text-xs text-white/60">({model.provider})</span>}
                                        {model.cost && <span className="text-xs font-medium text-white/70">{model.cost}</span>}
                                        {model.context && <span className="text-xs font-medium text-white/50">{model.context}</span>}
                                      </div>
                                      {model.description && <p className="text-xs leading-relaxed text-white/60">{model.description}</p>}
                                    </div>
                                    {selectedModel === model.value && <Check className="h-5 w-5 shrink-0 text-emerald-400" />}
                                  </div>
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Repository Selection */}
                  {isGit && (
                    <div className="space-y-6 rounded-lg border border-white/10 bg-white/5 p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-medium text-white">Repository Selection</Label>
                          <p className="text-sm text-white/60">Pick repository, branch, and optional folder.</p>
                        </div>
                        <Button type="button" variant="secondary" onClick={() => setShowConnectionWizard(true)} size="sm">
                          <Github className="h-4 w-4" />
                          Connect repo
                        </Button>
                      </div>

                      {!checkingGitHub && !hasGitHubConnection && (
                        <Alert variant="warning">
                          <AlertTriangle className="h-5 w-5" />
                          <div>
                            <AlertTitle>GitHub App required</AlertTitle>
                            <AlertDescription>
                              Install the GitHub App to access repositories and load files.
                              <a href="/settings?tab=integrations" className="ml-1 font-semibold underline">
                                Install GitHub App →
                              </a>
                            </AlertDescription>
                          </div>
                        </Alert>
                      )}

                      <div className="space-y-2">
                        <Label>
                          Repository <span className="text-red-400">*</span>
                        </Label>
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
                            setSelectedBranch('');
                            setSelectedRepoId(null);
                            setDirectories([]);
                          }}
                          triggerClassName="field-select"
                        />
                        <p className="text-sm text-white/60">
                          {uniqueRepos.length === 0 ? (
                            <span>
                              No ready repositories. <Link href="/repos" className="font-medium underline">Go to Repositories →</Link>
                            </span>
                          ) : (
                            'Select a repository that has been set up with file summaries.'
                          )}
                        </p>
                      </div>

                      {selectedRepoUrl && (
                        <div className="space-y-2">
                          <Label>
                            Branch <span className="text-red-400">*</span>
                          </Label>
                          <SearchableSelect
                            options={availableBranches.map((branch) => ({ value: branch.branch, label: branch.branch }))}
                            value={selectedBranch}
                            placeholder="Select a branch..."
                            searchPlaceholder="Search branches..."
                            disabled={availableBranches.length === 0}
                            onChange={(branch) => {
                              setSelectedBranch(branch);
                              const repoRecord = availableBranches.find((b) => b.branch === branch);
                              setSelectedRepoId(repoRecord?.id || null);
                              setBranch(branch);
                              setDirectories([]);
                            }}
                            triggerClassName="field-select"
                          />
                          <p className="text-sm text-white/60">
                            {availableBranches.length === 0 ? 'No branches available for this repository.' : 'Select the branch you want to document.'}
                          </p>
                        </div>
                      )}

                      {selectedBranch && (
                        <div className="space-y-2">
                          <Label>Focus folder (optional)</Label>
                          <SearchableSelect
                            options={[{ value: '', label: '📁 Root directory (all files)' }, ...directories.map((d) => ({ value: d, label: `📂 ${d}` }))]}
                            value={subdir}
                            placeholder={
                              loadingDirectories ? 'Loading folders...' : directories.length === 0 ? 'No folders found' : 'Choose folder to focus on...'
                            }
                            searchPlaceholder="Search folders..."
                            disabled={loadingDirectories}
                            onChange={setSubdir}
                            triggerClassName="field-select"
                          />
                          <p className="text-sm text-white/60">
                            {subdir
                              ? `Documentation will focus on "${subdir}" and its contents.`
                              : 'Leave empty to include all files or pick a folder to narrow scope.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* File Selection */}
                  {isGit && (
                    <>
                      <Separator />
                      <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <Label className="text-base font-medium text-white">File Selection</Label>
                            <p className="text-sm text-white/60">Load and pick files to include in your documentation.</p>
                          </div>
                          <div className="flex gap-2">
                            {showLoadButton && (
                              <Button variant="secondary" onClick={listGitFiles} disabled={listing}>
                                {listing ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading…
                                  </>
                                ) : (
                                  'Load files'
                                )}
                              </Button>
                            )}
                            {pickerFiles.length > 0 && (
                              <>
                                <Button type="button" variant="secondary" onClick={selectAll} className="text-sm">
                                  Select all{fileSearchQuery ? ` (${filteredFiles.length})` : ''}
                                </Button>
                                <Button type="button" variant="secondary" onClick={clearAll} className="text-sm">
                                  Clear{fileSearchQuery ? ` (${filteredFiles.length})` : ''}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {pickerFiles.length > 0 && (
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                            <Input
                              className="pl-9 pr-9"
                              placeholder="Search files..."
                              value={fileSearchQuery}
                              onChange={(e) => setFileSearchQuery(e.target.value)}
                            />
                            {fileSearchQuery && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setFileSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                                aria-label="Clear search"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                            {fileSearchQuery && (
                              <p className="mt-1 text-xs text-white/60">
                                Showing {filteredFiles.length} of {pickerFiles.length} files
                              </p>
                            )}
                          </div>
                        )}

                        {pickerFiles.length > 0 ? (
                          filteredFiles.length > 0 ? (
                            <div className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/20">
                              <ul className="divide-y divide-white/10">
                                {filteredFiles.map((f) => (
                                  <li key={f.path} className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-white/5">
                                    <Checkbox
                                      checked={selectedPaths.has(f.path)}
                                      onCheckedChange={() => togglePick(f.path)}
                                      className="border-amber-400/60"
                                    />
                                    <span className="flex-1 font-mono text-white/90">{f.path}</span>
                                    <span className="text-xs text-white/50">{f.size ? `${f.size} bytes` : '—'}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <Alert variant="default" className="text-center">
                              <AlertDescription>
                                No files match &quot;{fileSearchQuery}&quot;
                              </AlertDescription>
                            </Alert>
                          )
                        ) : (
                          <p className="text-sm text-white/60">No files loaded yet.</p>
                        )}

                        {selectedPaths.size > 0 && (
                          <div className="flex items-center justify-between text-sm text-white/70">
                            <span>{selectedPaths.size} file(s) selected</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Prompt Customization */}
                  <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-6">
                    <div>
                      <Label className="text-base font-medium text-white">Prompt Customization</Label>
                      <p className="text-sm text-white/60">Customize the tone, style, audience, and instructions for your documentation.</p>
                    </div>
                    <PromptCustomizer
                      promptConfig={promptConfig}
                      onChange={(config) => {
                        setPromptConfig({
                          personality: config.personality ?? 'default',
                          style: config.style ?? 'default',
                          perspective: config.perspective ?? 'default',
                          audience: config.audience ?? 'technical',
                          customInstructions: config.customInstructions ?? '',
                          temperature: config.temperature ?? 0.3,
                        });
                      }}
                    />
                  </div>

                  <Separator />

                  {/* Document Structure */}
                  <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-6">
                    <div>
                      <Label className="text-base font-medium text-white">Document Structure</Label>
                      <p className="text-sm text-white/60">Configure sections and table of contents for your documentation.</p>
                    </div>
                    <DocumentStructure config={structureConfig} onChange={setStructureConfig} />
                  </div>

                  {(errorMsg || statusMsg) && (
                    <div className="space-y-2">
                      {errorMsg && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{errorMsg}</AlertDescription>
                        </Alert>
                      )}
                      {statusMsg && (
                        <Alert variant="default">
                          <Info className="h-4 w-4" />
                          <AlertDescription>{statusMsg}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Form Actions */}
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" className="flex-1 min-w-[200px]" disabled={running}>
                      {running ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyzing…
                        </>
                      ) : (
                        'Analyze & Save'
                      )}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setActiveTabAndUpdateUrl('edit')} className="min-w-[160px]">
                      View Documents
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edit" className="mt-6">
            {/* Edit Tab */}
            <div className="space-y-6">
              {/* Header with controls */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Edit Documents</h2>
                  <p className="text-white/70">Manage and edit your generated documentation</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const newMode = viewMode === 'tile' ? 'row' : 'tile';
                      setViewMode(newMode);
                      localStorage.setItem('edit-view-mode', newMode);
                    }}
                    className="flex items-center gap-2"
                  >
                    {viewMode === 'tile' ? <List className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
                    {viewMode === 'tile' ? 'List' : 'Grid'}
                  </Button>
                </div>
              </div>

              {/* Success/Error Messages */}
              {editError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}

              {/* Filters */}
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <Input
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-white/5 border-white/10">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent className="bg-black/95 border-white/10 backdrop-blur-xl">
                    <SelectItem value="all" className="text-white hover:bg-white/10 focus:bg-white/10">All Status</SelectItem>
                    <SelectItem value="published" className="text-white hover:bg-white/10 focus:bg-white/10">Published</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={repoFilter} onValueChange={setRepoFilter}>
                  <SelectTrigger className="w-full sm:w-[200px] bg-white/5 border-white/10">
                    <SelectValue placeholder="Filter by repo" />
                  </SelectTrigger>
                  <SelectContent className="bg-black/95 border-white/10 backdrop-blur-xl">
                    <SelectItem value="all" className="text-white hover:bg-white/10 focus:bg-white/10">All Repositories</SelectItem>
                    {repos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.id} className="text-white hover:bg-white/10 focus:bg-white/10">
                        {repo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Documents List */}
              {editLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                  <span className="ml-2 text-white/60">Loading documents...</span>
                </div>
              ) : editItems.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-white/30 mx-auto mb-4" />
                  <p className="text-white/60 mb-2">No documents found</p>
                  <p className="text-sm text-white/40">Generate some documentation to get started</p>
                </div>
              ) : (
                <div className={`grid gap-4 ${viewMode === 'tile' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                  {editItems.map((item) => (
                    <Card
                      key={item.id}
                      className="cursor-pointer border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-colors backdrop-blur"
                      onClick={() => router.push(`/edit/${item.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/edit/${item.id}`);
                        }
                      }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg text-white truncate">{item.title}</CardTitle>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-white/60">{item.repo}</span>
                              <span className="text-xs text-white/40">•</span>
                              <span className="text-sm text-white/60">{item.branch}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="border-white/10 bg-black/95 backdrop-blur-xl z-[100]">
                                <DropdownMenuItem asChild className="text-white hover:bg-white/10 focus:bg-white/10">
                                  <Link href={`/edit/${item.id}`} className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Edit Document
                                  </Link>
                                </DropdownMenuItem>
                                {item.lastPushedUrl && (
                                  <DropdownMenuItem asChild className="text-white hover:bg-white/10 focus:bg-white/10">
                                    <a href={item.lastPushedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                      <ExternalLink className="h-4 w-4" />
                                      View Published
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setItemToDelete({ id: item.id, title: item.title });
                                    setShowDeleteModal(true);
                                  }}
                                  className="text-red-300 hover:bg-red-500/10 focus:bg-red-500/10"
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-white/60">
                            <Clock className="h-4 w-4" />
                            <span>Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
                          </div>
                          {item.isOutdated && (
                            <div className="flex items-center gap-2 text-sm text-yellow-300">
                              <AlertTriangle className="h-4 w-4" />
                              <span>Outdated - source code has changed</span>
                            </div>
                          )}
                          {item.lastPushedAt && item.lastPushedProvider && (
                            <div className="flex items-center gap-2 text-sm text-green-300">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Pushed to {item.lastPushedProvider} {new Date(item.lastPushedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="secondary"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-white/60">
                    Page {page} of {totalPages} ({total} total)
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showConnectionWizard} onOpenChange={setShowConnectionWizard}>
        <DialogContent className="p-0">
          <RepositoryConnectionWizard
            onComplete={handleRepositoryConnected}
            onCancel={() => setShowConnectionWizard(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="border-white/20 bg-black/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-white/70">
              Are you sure you want to delete <span className="font-semibold text-white">&quot;{itemToDelete?.title}&quot;</span>?
              This action cannot be undone.
            </p>
            {deleteError && (
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setItemToDelete(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => itemToDelete && deleteItem(itemToDelete.id, itemToDelete.title)}
              disabled={deletingId === itemToDelete?.id}
            >
              {deletingId === itemToDelete?.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
