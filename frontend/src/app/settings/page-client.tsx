'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, User, Link2, Sliders, Mail, Check, X, Loader2, Github, GitBranch, Plus, Play, ExternalLink, FileText, Search, ChevronDown, Trash2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import Nango from '@nangohq/frontend';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

type TabId = 'profile' | 'integrations' | 'repositories' | 'preferences';

interface Repo {
  id: string;
  name: string;
  provider: string;
  repo_url: string;
  default_branch: string;
  auth_type: string;
  credentials_ref?: string;
  settings?: any;
  created_at: string;
  updated_at: string;
}

interface SettingsPageClientProps {
  user: SupabaseUser | null;
}

const tabs: Array<{ id: TabId; name: string; icon: any }> = [
  { id: 'profile', name: 'Profile', icon: User },
  { id: 'integrations', name: 'Integrations', icon: Link2 },
  { id: 'repositories', name: 'Repositories', icon: Github },
  { id: 'preferences', name: 'Preferences', icon: Sliders }
];

export function SettingsPageClient({ user: initialUser }: SettingsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] = useState<{ connectionId: string; provider: string } | null>(null);

  // Repository management state
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeSuccess, setAnalyzeSuccess] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formRepoUrl, setFormRepoUrl] = useState('');
  const [formBranch, setFormBranch] = useState('main');
  const [formSubdir, setFormSubdir] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Repo detection state
  const [ownerInput, setOwnerInput] = useState('');
  const [baseOwner, setBaseOwner] = useState('');
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [availableRepos, setAvailableRepos] = useState<Array<{ name: string; full_name: string; url: string; private: boolean }>>([]);
  const [loadingRepoSearch, setLoadingRepoSearch] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingDirectories, setLoadingDirectories] = useState(false);

  // Get active tab from URL query param
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const validTabs: TabId[] = ['profile', 'integrations', 'repositories', 'preferences'];
    if (tabParam && validTabs.includes(tabParam as TabId)) {
      setActiveTab(tabParam as TabId);
    }

    // Check for URL params (for OAuth callbacks)
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');
    if (successParam === 'true') {
      const provider = searchParams.get('provider') || 'service';
      setSuccess(`Successfully connected to ${provider}!`);
      // Clean URL but keep tab param
      const tab = searchParams.get('tab') || 'integrations';
      router.replace(`/settings?tab=${tab}`);
      if (tabParam !== 'integrations') {
        setActiveTab('integrations');
      }
    }
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      const tab = searchParams.get('tab') || 'integrations';
      router.replace(`/settings?tab=${tab}`);
      if (tabParam !== 'integrations') {
        setActiveTab('integrations');
      }
    }

    if (tabParam === 'integrations' || (!tabParam && activeTab === 'integrations')) {
      loadConnections();
    }
    if (tabParam === 'repositories' || (!tabParam && activeTab === 'repositories')) {
      loadRepos();
    }
  }, [searchParams, router]);

  // Reload connections when switching to integrations tab
  useEffect(() => {
    if (activeTab === 'integrations' && connections.length === 0 && !loading) {
      loadConnections();
    }
  }, [activeTab]);

  // Reload repos when switching to repositories tab
  useEffect(() => {
    if (activeTab === 'repositories' && repos.length === 0 && !loadingRepos) {
      loadRepos();
    }
  }, [activeTab]);

  // React to repo URL changes - fetch branches
  useEffect(() => {
    if (formRepoUrl && formRepoUrl.includes('github.com')) {
      const noProto = formRepoUrl.replace(/^https?:\/\//, '');
      const parts = noProto.split('/').filter(Boolean);
      if (parts.length >= 3) {
        fetchBranches();
      }
    } else {
      setBranches([]);
      setDirectories([]);
      setFormBranch('main');
      setFormSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formRepoUrl]);

  // React to branch changes - fetch directories
  useEffect(() => {
    if (formBranch && formRepoUrl && formRepoUrl.includes('github.com')) {
      fetchDirectories();
    } else {
      setDirectories([]);
      setFormSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formBranch, formRepoUrl]);

  async function loadConnections() {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/list');
      if (!response.ok) throw new Error('Failed to load connections');
      const data = await response.json();
      setConnections(data.connections || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }

  async function connectToProvider(providerName: string) {
    setConnecting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: providerName })
      });

      if (!response.ok) {
        const data = await response.json();
        const errorMsg = data.detail || data.error || 'Failed to initiate connection';
        console.error('Connection error details:', data);
        throw new Error(errorMsg);
      }

      const { sessionToken, provider } = await response.json();

      if (!sessionToken) {
        throw new Error('No session token returned');
      }

      // Initialize Nango frontend SDK and open Connect UI
      const nango = new Nango();
      const connect = nango.openConnectUI({
        onEvent: async (event) => {
          if (event.type === 'close') {
            setConnecting(false);
          } else if (event.type === 'connect') {
            const connectionId = event.payload?.connectionId;
            const providerConfigKey = event.payload?.providerConfigKey || provider;

            if (connectionId) {
              try {
                const saveResponse = await fetch('/api/integrations/save', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    connectionId,
                    provider: providerConfigKey
                  })
                });

                if (!saveResponse.ok) {
                  const errorData = await saveResponse.json();
                  console.error('Failed to save connection:', errorData);
                }
              } catch (saveErr) {
                console.error('Error saving connection:', saveErr);
              }
            }

            const providerDisplayName = getProviderDisplayName(providerName);
            setSuccess(`Successfully connected to ${providerDisplayName}!`);
            setConnecting(false);

            await loadConnections();

            setTimeout(() => {
              setSuccess('');
            }, 5000);
          }
        }
      });

      connect.setSessionToken(sessionToken);
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
      console.error('Connection error:', err);
      setConnecting(false);
    }
  }

  function openDisconnectModal(connectionId: string, provider: string) {
    setConnectionToDisconnect({ connectionId, provider });
    setDisconnectModalOpen(true);
  }

  function closeDisconnectModal() {
    setDisconnectModalOpen(false);
    setConnectionToDisconnect(null);
  }

  async function disconnect(connectionId: string, provider: string) {
    try {
      const response = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId, provider })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disconnect');
      }

      setSuccess(`Disconnected from ${getProviderDisplayName(provider)}`);
      await loadConnections();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    }
  }

  function getProviderDisplayName(provider: string) {
    if (provider === 'googledocs' || provider === 'google-docs') return 'Google Docs';
    if (provider === 'github') return 'GitHub';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function getProviderName(provider: string) {
    if (provider === 'googledocs') return 'Google Docs';
    if (provider === 'github') return 'GitHub';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function setActiveTabAndUpdateUrl(tabId: TabId) {
    setActiveTab(tabId);
    router.push(`/settings?tab=${tabId}`, { scroll: false });
  }

  // Repository management functions
  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const response = await fetch('/api/repos');
      if (!response.ok) throw new Error('Failed to load repositories');
      const data = await response.json();
      setRepos(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load repositories');
    } finally {
      setLoadingRepos(false);
    }
  }

  async function handleAddRepo() {
    if (!formName || !formRepoUrl) {
      setError('Name and repository URL are required');
      return;
    }

    setFormSubmitting(true);
    setError('');

    try {
      const settings: any = {};
      if (formSubdir) {
        settings.subdir = formSubdir;
      }

      const response = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          provider: 'github',
          repo_url: formRepoUrl,
          default_branch: formBranch,
          auth_type: 'github_pat',
          settings,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.detail || 'Failed to create repository');
      }

      // Reset form and reload
      setFormName('');
      setFormRepoUrl('');
      setFormBranch('main');
      setFormSubdir('');
      setOwnerInput('');
      setBaseOwner('');
      setShowRepoSelector(false);
      setAvailableRepos([]);
      setBranches([]);
      setDirectories([]);
      setShowAddForm(false);
      setSuccess('Repository added successfully!');
      await loadRepos();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add repository');
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleAnalyzeAndGenerate(repoId: string) {
    setAnalyzingId(repoId);
    setAnalyzeError(null);
    setAnalyzeSuccess(null);

    try {
      const response = await fetch(`/api/repos/${repoId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generate_diagram: false }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.detail || 'Failed to analyze repository');
      }

      const result = await response.json();
      setAnalyzeSuccess(`Documentation generated! Doc ID: ${result.doc_id}`);
      
      setTimeout(() => {
        router.push(`/edit/${result.doc_id}`);
      }, 1500);
    } catch (err: any) {
      setAnalyzeError(err.message || 'Failed to analyze repository');
    } finally {
      setAnalyzingId(null);
    }
  }

  function parseRepoUrl(url: string): { owner: string; repo: string } | null {
    try {
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        return { owner: match[1], repo: match[2].replace('.git', '') };
      }
    } catch {
      // Invalid URL
    }
    return null;
  }

  function searchRepos() {
    if (ownerInput.trim()) {
      setShowRepoSelector(true);
      const trimmed = ownerInput.trim();
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
      setAvailableRepos([]);
    }
  }

  async function fetchRepos(owner: string) {
    if (!owner || loadingRepoSearch) return;

    setLoadingRepoSearch(true);
    try {
      const response = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner })
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableRepos((data.repos || [])
          .filter((r: any) => r && r.name && r.full_name && r.url)
          .map((r: { name: string; full_name: string; url: string; private: boolean }) => ({
            name: r.name,
            full_name: r.full_name,
            url: r.url,
            private: r.private || false
          })));
      } else {
        setAvailableRepos([]);
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err);
      setAvailableRepos([]);
    } finally {
      setLoadingRepoSearch(false);
    }
  }

  async function fetchBranches() {
    if (!formRepoUrl.trim() || !formRepoUrl.includes('github.com')) {
      setBranches([]);
      return;
    }

    const noProto = formRepoUrl.replace(/^https?:\/\//, '');
    const parts = noProto.split('/').filter(Boolean);
    if (parts.length < 3) {
      return;
    }

    setLoadingBranches(true);
    try {
      const response = await fetch('/api/github/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl: formRepoUrl })
      });

      if (response.ok) {
        const data = await response.json();
        const branchList = data.branches || [];
        setBranches(branchList);
        if (branchList.length > 0 && !branchList.includes(formBranch)) {
          setFormBranch(branchList[0]);
        }
      } else {
        setBranches([]);
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }

  async function fetchDirectories() {
    if (!formRepoUrl.trim() || !formRepoUrl.includes('github.com') || !formBranch) {
      setDirectories([]);
      return;
    }

    setLoadingDirectories(true);
    try {
      const response = await fetch('/api/github/directories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl: formRepoUrl, branch: formBranch })
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

  function handleRepoSelect(repo: { name: string; full_name: string; url: string }) {
    setFormRepoUrl(repo.url);
    setFormName(repo.name);
    setShowRepoSelector(false);
    setOwnerInput('');
    setBaseOwner('');
    setAvailableRepos([]);
  }

  const isNotionConnected = connections.some(c => c.provider === 'notion' && c.status === 'active');
  const isConfluenceConnected = connections.some(c => c.provider === 'confluence' && c.status === 'active');
  const isGoogleDocsConnected = connections.some(c => c.provider === 'googledocs' && c.status === 'active');
  const isGitHubConnected = connections.some(c => c.provider === 'github' && c.status === 'active');

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-white/70">
            Manage your account settings, integrations, and preferences.
          </p>
        </div>

        {/* Tabs Navigation */}
        <div className="mb-8 border-b border-white/10">
          <nav className="flex gap-1" aria-label="Settings tabs">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabAndUpdateUrl(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'profile' ? (
            /* Profile Tab */
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Profile</h2>
                <p className="text-white/70">Manage your account information</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                      <User className="h-8 w-8 text-white/70" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">{initialUser?.email || 'User'}</p>
                      <p className="text-sm text-white/60">Account ID: {initialUser?.id || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        <Mail className="inline h-4 w-4 mr-2" />
                        Email Address
                      </label>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
                        {initialUser?.email || 'Not available'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm text-white/60">
                      Profile management features coming soon. For now, your account information is managed through authentication.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'integrations' ? (
            /* Integrations Tab */
            <div>
              {/* Success/Error Messages */}
              {success && (
                <div className="mb-6 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-200">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5" />
                    <p>{success}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Available Integrations */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Available Integrations</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* GitHub Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <Github className="h-7 w-7 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">GitHub</h3>
                          <p className="text-sm text-white/60">Access your repositories and private repos</p>
                          <p className="text-xs text-white/40 mt-1">Higher rate limits (5,000/hr vs 60/hr)</p>
                        </div>
                      </div>
                      {isGitHubConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isGitHubConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'github');
                          if (conn) openDisconnectModal(conn.connection_id, 'github');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('github')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect GitHub
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Notion Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="notion" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Notion</h3>
                          <p className="text-sm text-white/60">Access and sync your Notion pages</p>
                        </div>
                      </div>
                      {isNotionConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isNotionConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'notion');
                          if (conn) openDisconnectModal(conn.connection_id, 'notion');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('notion')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect Notion
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Confluence Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="confluence" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Confluence</h3>
                          <p className="text-sm text-white/60">Access and sync your Confluence pages</p>
                        </div>
                      </div>
                      {isConfluenceConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isConfluenceConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'confluence');
                          if (conn) openDisconnectModal(conn.connection_id, 'confluence');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('confluence')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect Confluence
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Google Docs Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="google-docs" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Google Docs</h3>
                          <p className="text-sm text-white/60">Access and sync your Google Docs</p>
                        </div>
                      </div>
                      {isGoogleDocsConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isGoogleDocsConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'googledocs');
                          if (conn) openDisconnectModal(conn.connection_id, 'googledocs');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('google-docs')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect Google Docs
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Connections */}
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">Active Connections</h2>
                {loading ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto mb-2" />
                    <p className="text-white/60">Loading connections...</p>
                  </div>
                ) : connections.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                    <Link2 className="h-12 w-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60">No active connections</p>
                    <p className="text-sm text-white/40 mt-2">Connect an integration above to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connections.map(connection => (
                      <div key={connection.id} className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                              {connection.provider === 'github' ? (
                                <Github className="h-6 w-6 text-white" />
                              ) : (
                                <IntegrationLogos
                                  provider={(connection.provider === 'googledocs' ? 'google-docs' : connection.provider) as 'notion' | 'slack' | 'confluence' | 'google-docs' | 'jira'}
                                  size={24}
                                />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-white">{getProviderName(connection.provider)}</p>
                              <p className="text-xs text-white/60">
                                Connected {formatDate(connection.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {connection.status === 'active' && (
                              <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-300">
                                <Check className="h-3 w-3" />
                                Active
                              </span>
                            )}
                            <button
                              onClick={() => openDisconnectModal(connection.connection_id, connection.provider)}
                              className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'repositories' ? (
            /* Repositories Tab */
            <div>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-semibold text-white">Repositories</h2>
                  <button
                    onClick={() => {
                      if (showAddForm) {
                        setFormName('');
                        setFormRepoUrl('');
                        setFormBranch('main');
                        setFormSubdir('');
                        setOwnerInput('');
                        setBaseOwner('');
                        setShowRepoSelector(false);
                        setAvailableRepos([]);
                        setBranches([]);
                        setDirectories([]);
                      }
                      setShowAddForm(!showAddForm);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    {showAddForm ? 'Cancel' : 'Add Repository'}
                  </button>
                </div>
                <p className="text-white/70">Register repositories to enable manual documentation generation and tracking.</p>
              </div>

              {analyzeError && (
                <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
                  {analyzeError}
                </div>
              )}

              {analyzeSuccess && (
                <div className="mb-6 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-200">
                  {analyzeSuccess}
                </div>
              )}

              {/* Add Repository Form */}
              {showAddForm && (
                <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-white mb-4">Add Repository</h3>
                  <div className="space-y-4">
                    {/* Owner Search */}
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-1">
                        Search by Owner/Organization
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={ownerInput}
                          onChange={(e) => setOwnerInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              searchRepos();
                            }
                          }}
                          placeholder="Enter GitHub username or org (e.g., 'vercel' or 'github.com/vercel')"
                          className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
                        />
                        <button
                          type="button"
                          onClick={searchRepos}
                          disabled={loadingRepoSearch || !ownerInput.trim()}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingRepoSearch ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                          Search
                        </button>
                      </div>
                      {showRepoSelector && availableRepos.length > 0 && (
                        <div className="mt-2 rounded-lg border border-white/20 bg-black/95 max-h-60 overflow-y-auto">
                          {availableRepos.map((repo) => (
                            <button
                              key={repo.url}
                              type="button"
                              onClick={() => handleRepoSelect(repo)}
                              className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0"
                            >
                              <div className="flex items-center gap-2">
                                <Github className="h-4 w-4 text-white/60" />
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-white">{repo.name}</div>
                                  <div className="text-xs text-white/50">{repo.full_name}</div>
                                </div>
                                {repo.private && (
                                  <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded">Private</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Display Name */}
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="My Project"
                        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
                      />
                    </div>

                    {/* Repository URL */}
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-1">
                        Repository URL
                      </label>
                      <input
                        type="text"
                        value={formRepoUrl}
                        onChange={(e) => setFormRepoUrl(e.target.value)}
                        placeholder="https://github.com/owner/repo"
                        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
                      />
                    </div>

                    {/* Branch and Subdirectory */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-1">
                          Default Branch
                        </label>
                        {branches.length > 0 ? (
                          <div className="relative">
                            <select
                              value={formBranch}
                              onChange={(e) => setFormBranch(e.target.value)}
                              disabled={loadingBranches}
                              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none focus:border-white/40 disabled:opacity-50 appearance-none pr-8"
                            >
                              {branches.map((b) => (
                                <option key={b} value={b} className="bg-black text-white">
                                  {b}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 pointer-events-none" />
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              value={formBranch}
                              onChange={(e) => setFormBranch(e.target.value)}
                              placeholder="main"
                              disabled={loadingBranches}
                              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40 disabled:opacity-50"
                            />
                            {loadingBranches && (
                              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-white/60" />
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-1">
                          Subdirectory (optional)
                        </label>
                        {directories.length > 0 ? (
                          <div className="relative">
                            <select
                              value={formSubdir}
                              onChange={(e) => setFormSubdir(e.target.value)}
                              disabled={loadingDirectories}
                              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none focus:border-white/40 disabled:opacity-50 appearance-none pr-8"
                            >
                              <option value="" className="bg-black text-white">None (root)</option>
                              {directories.map((d) => (
                                <option key={d} value={d} className="bg-black text-white">
                                  {d}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 pointer-events-none" />
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              value={formSubdir}
                              onChange={(e) => setFormSubdir(e.target.value)}
                              placeholder="/src (optional)"
                              disabled={loadingDirectories}
                              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40 disabled:opacity-50"
                            />
                            {loadingDirectories && (
                              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-white/60" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={handleAddRepo}
                        disabled={formSubmitting || !formName || !formRepoUrl}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-500/20 border border-green-500/40 px-4 py-2 text-sm font-medium text-green-200 transition-all hover:bg-green-500/30 hover:border-green-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {formSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Add Repository
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Repositories List */}
              {loadingRepos ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto mb-2" />
                  <p className="text-white/60">Loading repositories...</p>
                </div>
              ) : repos.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                  <Github className="h-12 w-12 text-white/30 mx-auto mb-4" />
                  <p className="text-white/60 mb-2">No repositories registered yet.</p>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                  >
                    Add your first repository
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                  <table className="w-full">
                    <thead className="border-b border-white/10 bg-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Repository</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Branch</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Provider</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Added</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-white/90">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {repos.map((repo) => {
                        const repoInfo = parseRepoUrl(repo.repo_url);
                        return (
                          <tr key={repo.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Github className="h-4 w-4 text-white/60" />
                                <div>
                                  <div className="font-semibold text-white">{repo.name}</div>
                                  <div className="text-xs text-white/50 font-mono">
                                    {repo.repo_url}
                                  </div>
                                  {repo.settings?.subdir && (
                                    <div className="text-xs text-white/40 mt-0.5">
                                      Path: {repo.settings.subdir}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 text-sm text-white/70">
                                <GitBranch className="h-3 w-3" />
                                {repo.default_branch}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 rounded border border-blue-400/30 bg-blue-500/20 px-2 py-1 text-xs text-blue-200 capitalize">
                                {repo.provider}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-white/70">
                              {new Date(repo.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleAnalyzeAndGenerate(repo.id)}
                                  disabled={analyzingId === repo.id}
                                  className="inline-flex items-center gap-2 rounded-lg bg-purple-500/20 border border-purple-500/40 px-3 py-1.5 text-sm font-medium text-purple-200 transition-all hover:bg-purple-500/30 hover:border-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                                  title="Analyze repository and generate documentation"
                                >
                                  {analyzingId === repo.id ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      Generating...
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-3 w-3" />
                                      Analyze & Generate
                                    </>
                                  )}
                                </button>
                                <Link
                                  href={`/edit`}
                                  onClick={(e) => {
                                    sessionStorage.setItem('edit-repo-filter', repo.repo_url);
                                  }}
                                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 transition-all hover:bg-white/20 hover:border-white/30"
                                  title="View docs for this repository"
                                >
                                  <FileText className="h-3 w-3" />
                                  View Docs
                                </Link>
                                {repoInfo && (
                                  <a
                                    href={repo.repo_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 transition-all hover:bg-white/20 hover:border-white/30"
                                    title="Open repository on GitHub"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* Preferences Tab */
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Preferences</h2>
                <p className="text-white/70">Customize your application preferences</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Sliders className="h-16 w-16 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60 mb-2">Preferences coming soon</p>
                    <p className="text-sm text-white/40">
                      Configure default LLM models, prompt settings, and other preferences here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {disconnectModalOpen && connectionToDisconnect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeDisconnectModal}
          onKeyDown={(e) => e.key === 'Escape' && closeDisconnectModal()}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-semibold text-white">Disconnect Integration</h2>
            <p className="mb-6 text-white/70">
              Are you sure you want to disconnect from <span className="font-semibold text-white">
                {getProviderName(connectionToDisconnect.provider)}
              </span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
                onClick={closeDisconnectModal}
              >
                Cancel
              </button>
              <button
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/20"
                onClick={async () => {
                  if (connectionToDisconnect) {
                    await disconnect(connectionToDisconnect.connectionId, connectionToDisconnect.provider);
                    closeDisconnectModal();
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

