<script lang="ts">
	// ------------------------------------------------------------
	// /submit — Streamlined intake → summarize → save
	// Only necessary changes:
	//   - Do NOT preselect all files when loading Git files
	//   - "Clear" now truly deselects everything (reactive Set reassign)
	//   - Hide the "Load files" button once files are loaded
	//   - Reset file list when repoUrl/branch/subdir/method changes (so lists don't carry over)
	//   - Redirect to /edit/{id} after successful analyze+save
	// RLS NOTE (important):
	//   Our table has created_by defaulting to auth.uid().
	//   Policies only allow a user to read/update/delete rows where
	//   created_by = auth.uid(). We never set created_by in the client.
	//   Postgres fills it in. This guarantees the row belongs to the
	//   current user and prevents cross-user access.
	// ------------------------------------------------------------

	import { supabase } from '$lib/supabaseClient';
	import { Github, FolderOpen, Upload, Code, Loader2, AlertTriangle, Info } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import PromptCustomizer from '$lib/components/PromptCustomizer.svelte';
	import SearchableSelect from '$lib/components/SearchableSelect.svelte';

	type InputType = 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code';
	type Status = 'completed' | 'failed' | 'processing';

	// ---------------- UI STATE ----------------
	let method: InputType = 'github_repo_directory';

	// Git inputs
	let repoUrl = 'https://github.com/John-Sellers/documentation-generator';
	let branch = 'master';
	let subdir = 'backend';

	// Dropdown options
	let branches: string[] = [];
	let directories: string[] = [];
	let repos: Array<{ name: string; full_name: string; url: string; private: boolean }> = [];
	let loadingBranches = false;
	let loadingDirectories = false;
	let loadingRepos = false;
	let baseOwner = ''; // Extracted owner from URL for repo search

	// Zip & Paste inputs
	let zipFile: File | null = null;
	let pasteFilename = 'snippet.txt';
	let pasteCode = '';

	// Doc title (saved with the record)
	let docTitle = 'Documentation Draft';

	// LLM Prompt customization
	let promptConfig: {
		personality?: string;
		style?: string;
		audience?: string;
		customInstructions?: string;
		temperature?: number;
	} = {
		personality: 'default',
		style: 'default',
		audience: 'technical',
		customInstructions: '',
		temperature: 0.3
	};

	// Model selection
	// Complete list of models available through Vercel AI Gateway
	// Cost indicators based on actual pricing: $ = cheapest, $$$$$ = most expensive
	const availableModels = [
		// OpenAI Models
		{
			value: 'gpt-4o',
			label: 'GPT-4o',
			provider: 'OpenAI',
			cost: '$$$$',
			context: '128K tokens',
			description:
				'Our most advanced, multimodal flagship model that\'s faster and 50% cheaper than GPT-4 Turbo. GPT-4o ("o" for "omni") is trained across text, vision, and audio.'
		},
		{
			value: 'gpt-4o-mini',
			label: 'GPT-4o Mini',
			provider: 'OpenAI',
			cost: '$',
			context: '128K tokens',
			description:
				'A smaller, more affordable variant of GPT-4o. Fast, intelligent, and cost-effective for most tasks.'
		},
		{
			value: 'gpt-4-turbo',
			label: 'GPT-4 Turbo',
			provider: 'OpenAI',
			cost: '$$$$$',
			context: '128K tokens',
			description:
				'A large multimodal model (accepting text or image inputs and outputting text) that can solve complex tasks with greater accuracy than any of our previous models.'
		},
		{
			value: 'gpt-4',
			label: 'GPT-4',
			provider: 'OpenAI',
			cost: '$$$$$',
			context: '8K tokens',
			description:
				'A large multimodal model (accepting text or image inputs and outputting text) that can solve difficult problems with greater accuracy than any of our previous models.'
		},
		{
			value: 'gpt-3.5-turbo',
			label: 'GPT-3.5 Turbo',
			provider: 'OpenAI',
			cost: '$',
			context: '16K tokens',
			description:
				'A high-performance, cost-effective model optimized for chat and text completion tasks. Fast and efficient for most use cases.'
		},
		{
			value: 'o1-preview',
			label: 'O1 Preview',
			provider: 'OpenAI',
			cost: '$$$$$',
			context: '128K tokens',
			description:
				'Advanced reasoning model optimized for complex problem-solving and deep analysis. Uses a different architecture focused on reasoning capabilities.'
		},
		{
			value: 'o1-mini',
			label: 'O1 Mini',
			provider: 'OpenAI',
			cost: '$$$',
			context: '128K tokens',
			description:
				'A smaller, more affordable version of O1. Optimized for reasoning tasks with improved cost efficiency.'
		},
		// Anthropic Models
		{
			value: 'claude-3-5-sonnet-20241022',
			label: 'Claude 3.5 Sonnet',
			provider: 'Anthropic',
			cost: '$$$$',
			context: '200K tokens',
			description:
				'Our most intelligent model, with improved performance on coding tasks, math, and following complex, multi-step instructions. Excels at nuanced content creation and sophisticated Q&A.'
		},
		{
			value: 'claude-3-opus-20240229',
			label: 'Claude 3 Opus',
			provider: 'Anthropic',
			cost: '$$$$$',
			context: '200K tokens',
			description:
				'Our most powerful model for highly complex tasks. Best for tasks that require deep analysis, complex content creation, code generation, and research.'
		},
		{
			value: 'claude-3-sonnet-20240229',
			label: 'Claude 3 Sonnet',
			provider: 'Anthropic',
			cost: '$$$',
			context: '200K tokens',
			description:
				'A balanced model for enterprise workloads. Ideal for tasks requiring rapid responses, like knowledge retrieval or sales automation.'
		},
		{
			value: 'claude-3-haiku-20240307',
			label: 'Claude 3 Haiku',
			provider: 'Anthropic',
			cost: '$',
			context: '200K tokens',
			description:
				'Our fastest and most compact model for near-instant responsiveness. Perfect for simple queries, lightweight tasks, and high-volume use cases.'
		},
		{
			value: 'claude-3-5-haiku-20241022',
			label: 'Claude 3.5 Haiku',
			provider: 'Anthropic',
			cost: '$$',
			context: '200K tokens',
			description:
				'An improved version of Haiku with better performance while maintaining speed and cost efficiency. Great for general-purpose tasks.'
		},
		// Google Models
		{
			value: 'gemini-2.0-flash-exp',
			label: 'Gemini 2.0 Flash (Experimental)',
			provider: 'Google',
			cost: '$$',
			context: '1M tokens',
			description:
				'Experimental model with massive 1M token context window. Supports text, vision, audio, and function calling. Optimized for speed and efficiency.'
		},
		{
			value: 'gemini-1.5-pro',
			label: 'Gemini 1.5 Pro',
			provider: 'Google',
			cost: '$$$$',
			context: '2M tokens',
			description:
				"Google's most capable model with an enormous 2M token context window. Excellent for complex reasoning, code generation, and multimodal tasks."
		},
		{
			value: 'gemini-1.5-flash',
			label: 'Gemini 1.5 Flash',
			provider: 'Google',
			cost: '$$',
			context: '1M tokens',
			description:
				'Fast and efficient model with 1M token context window. Great balance of speed, cost, and capability for most use cases.'
		},
		{
			value: 'gemini-1.5-flash-8b',
			label: 'Gemini 1.5 Flash 8B',
			provider: 'Google',
			cost: '$',
			context: '1M tokens',
			description:
				'Lightweight 8B parameter model with 1M token context. Ultra-fast and cost-effective for simple tasks.'
		}
	];
	let selectedModel = 'gpt-4o'; // Default model
	let showModelDropdown = false; // For custom dropdown

	// Helper to get selected model object
	$: selectedModelObj =
		availableModels.find((m) => m.value === selectedModel) ||
		(availableModels.length > 0 ? availableModels[0] : null);

	// Check GitHub connection status
	async function checkGitHubConnection() {
		checkingGitHub = true;
		try {
			const response = await fetch('/api/integrations/list');
			if (response.ok) {
				const data = await response.json();
				hasGitHubConnection = (data.connections || []).some(
					(c: { provider: string; status: string }) =>
						c.provider === 'github' && c.status === 'active'
				);
			}
		} catch (err) {
			console.error('Failed to check GitHub connection:', err);
		} finally {
			checkingGitHub = false;
		}
	}

	// Click outside handler for dropdown
	let modelDropdownRef: HTMLElement | null = null;
	onMount(() => {
		checkGitHubConnection();

		function handleClickOutside(event: MouseEvent) {
			if (
				showModelDropdown &&
				modelDropdownRef &&
				!modelDropdownRef.contains(event.target as Node)
			) {
				showModelDropdown = false;
			}
		}
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Progress + errors
	let listing = false; // when loading Git file list
	let running = false; // when orchestrating analyze → save
	let errorMsg = '';
	let statusMsg = ''; // small status line while running

	// GitHub connection status
	let hasGitHubConnection = false;
	let checkingGitHub = true;

	// Git file picker data
	let pickerFiles: Array<{ path: string; size: number }> = [];
	let selectedPaths = new Set<string>();

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

	// ---------------- HELPERS ----------------

	// IMPORTANT: In Svelte, mutating a Set in place (e.g., .clear()) will not trigger reactivity.
	// To notify the UI, always assign a new Set instance.
	function selectAll() {
		// assign a new Set so checkboxes react immediately
		selectedPaths = new Set(pickerFiles.map((f) => f.path));
	}
	function clearAll() {
		// assign a brand new Set (not .clear()) for reactivity
		selectedPaths = new Set();
	}
	function togglePick(path: string) {
		// clone -> mutate -> reassign (reactive)
		const next = new Set(selectedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		selectedPaths = next;
	}
	function selectedArray(): string[] {
		return Array.from(selectedPaths);
	}

	// --------- REACT to Git input changes (reset lists) ----------
	// Is current method a Git method?
	$: isGit = method === 'github_repo' || method === 'github_repo_directory';

	// A key that changes whenever relevant Git params change
	$: gitKey = isGit
		? `${method}|${repoUrl}|${branch}|${method === 'github_repo_directory' ? subdir : ''}`
		: '';

	// When leaving Git methods altogether, wipe lists
	$: if (!isGit) {
		pickerFiles = [];
		selectedPaths = new Set();
	}

	// When any Git input changes (repo/branch/subdir/method), wipe lists
	$: if (isGit && gitKey) {
		// This runs whenever gitKey changes (Svelte tracks the dependency).
		pickerFiles = [];
		selectedPaths = new Set();
	}

	// Separate owner input for repo search
	let ownerInput = '';
	let showRepoSelector = false;

	// Function to search for repos
	function searchRepos() {
		if (ownerInput.trim()) {
			showRepoSelector = true;
			const trimmed = ownerInput.trim();
			// Remove github.com/ prefix if present
			const cleanOwner = trimmed
				.replace(/^https?:\/\/github\.com\//, '')
				.replace(/\/$/, '')
				.split('/')[0];
			if (cleanOwner && cleanOwner !== baseOwner) {
				baseOwner = cleanOwner;
				fetchRepos(cleanOwner);
			}
		} else {
			showRepoSelector = false;
			baseOwner = '';
			repos = [];
		}
	}

	// React to repo URL changes (with debounce to avoid multiple calls)
	let repoUrlKey = '';
	$: {
		const newKey = isGit && repoUrl && repoUrl.includes('github.com') ? repoUrl : '';
		if (newKey !== repoUrlKey) {
			repoUrlKey = newKey;
			if (newKey) {
				// Only fetch branches if we have a full repo URL (owner/repo)
				const noProto = newKey.replace(/^https?:\/\//, '');
				const parts = noProto.split('/').filter(Boolean);
				if (parts.length >= 3) {
					fetchBranches();
				}
			} else {
				branches = [];
				directories = [];
				subdir = '';
			}
		}
	}

	// React to branch changes
	let branchKey = '';
	$: {
		const newKey =
			isGit && branch && repoUrl && repoUrl.includes('github.com') ? `${repoUrl}|${branch}` : '';
		if (newKey !== branchKey) {
			branchKey = newKey;
			if (newKey && branch && method === 'github_repo_directory') {
				fetchDirectories();
			} else {
				directories = [];
			}
		}
	}

	// React to method changes - fetch directories if switching to github_repo_directory
	$: if (
		isGit &&
		method === 'github_repo_directory' &&
		branch &&
		repoUrl &&
		repoUrl.includes('github.com')
	) {
		fetchDirectories();
	}

	// Whether to show the "Load files" button:
	// - Only for Git methods
	// - Only when files are not loaded yet
	// - Show even while listing (so loading state is visible)
	$: showLoadButton = isGit && !pickerFiles.length;

	// --------- Fetch repos, branches and directories ----------
	async function fetchRepos(owner: string) {
		if (!owner || loadingRepos) return;

		loadingRepos = true;
		try {
			const response = await fetch('/api/github/repos', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ owner })
			});

			if (response.ok) {
				const data = await response.json();
				repos = (data.repos || [])
					.filter((r: any) => r && r.name && r.full_name && r.url)
					.map((r: { name: string; full_name: string; url: string; private: boolean }) => ({
						name: r.name,
						full_name: r.full_name,
						url: r.url,
						private: r.private || false
					}));
			} else {
				repos = [];
				const errorData = await response.json().catch(() => ({}));
				if (response.status !== 404) {
					console.error('Failed to fetch repos:', errorData);
				}
			}
		} catch (err) {
			console.error('Failed to fetch repos:', err);
			repos = [];
		} finally {
			loadingRepos = false;
		}
	}

	async function fetchBranches() {
		if (!repoUrl.trim() || !repoUrl.includes('github.com')) {
			branches = [];
			return;
		}

		loadingBranches = true;
		errorMsg = ''; // Clear previous errors
		try {
			const response = await fetch('/api/github/branches', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ repoUrl })
			});

			if (response.ok) {
				const data = await response.json();
				branches = data.branches || [];
				// Auto-select first branch if available and current branch not in list
				if (branches.length > 0 && !branches.includes(branch)) {
					branch = branches[0];
					// Fetch directories for the new branch
					if (method === 'github_repo_directory') {
						fetchDirectories();
					}
				}
			} else {
				branches = [];
				const errorData = await response.json().catch(() => ({}));
				// Only show error if it's not a public repo access issue
				if (response.status === 404 && !hasGitHubConnection) {
					errorMsg =
						'Repository not found or is private. Connect your GitHub account in Settings to access private repositories.';
				} else if (response.status === 403 && !hasGitHubConnection) {
					errorMsg =
						'Rate limit exceeded. Connect your GitHub account in Settings for higher rate limits (5,000/hr vs 60/hr).';
				} else if (response.status !== 404) {
					// Don't show error for 404 on public repos - might just be invalid URL
					errorMsg =
						errorData?.error || errorData?.detail || `Failed to load branches (${response.status})`;
				}
			}
		} catch (err) {
			console.error('Failed to fetch branches:', err);
			branches = [];
		} finally {
			loadingBranches = false;
		}
	}

	async function fetchDirectories() {
		if (!repoUrl.trim() || !repoUrl.includes('github.com') || !branch) {
			directories = [];
			return;
		}

		loadingDirectories = true;
		try {
			const response = await fetch('/api/github/directories', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ repoUrl, branch })
			});

			if (response.ok) {
				const data = await response.json();
				directories = data.directories || [];
			} else {
				directories = [];
				// Don't show error for directories - it's not critical, user can still proceed
			}
		} catch (err) {
			console.error('Failed to fetch directories:', err);
			directories = [];
		} finally {
			loadingDirectories = false;
		}
	}

	// --------- List files for Git methods ----------
	async function listGitFiles() {
		if (!isGit) return;

		errorMsg = '';
		listing = true;
		pickerFiles = [];
		selectedPaths = new Set(); // ensure fresh state

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
				// Check if it's a 404 (private repo without connection) or rate limit
				if (r.status === 404) {
					if (!hasGitHubConnection) {
						throw new Error(
							'Repository not found or is private. Connect your GitHub account in Settings to access private repositories.'
						);
					} else {
						throw new Error("Repository not found or you don't have access to it.");
					}
				} else if (r.status === 403) {
					if (!hasGitHubConnection) {
						throw new Error(
							'Rate limit exceeded or access denied. Connect your GitHub account in Settings for higher rate limits (5,000/hr vs 60/hr).'
						);
					} else {
						throw new Error('Access denied. Please check your GitHub connection in Settings.');
					}
				}
				throw new Error(data?.error || data?.detail || `Git list failed (${r.status})`);
			}

			pickerFiles = Array.isArray(data.files) ? data.files : [];

			// We intentionally do NOT preselect files.
		} catch (e) {
			errorMsg = String(e);
		} finally {
			listing = false;
		}
	}

	// Detect repository provider from URL (client-side version)
	function detectRepoProvider(repoUrl: string): string | null {
		if (!repoUrl) return null;
		try {
			const url = new URL(repoUrl);
			if (url.hostname === 'github.com' || url.hostname.includes('github.com')) {
				return 'github';
			}
			// Future: Add GitLab, Bitbucket detection
		} catch {
			return null;
		}
		return null;
	}

	// Build a friendly input_content string for logging
	function buildInputContent(): string {
		if (method === 'pasted_code') return `${pasteFilename} (pasted)`;
		if (method === 'zipped_folder') return zipFile ? zipFile.name : '(no zip selected)';

		// Git
		const files = selectedArray();
		return [
			repoUrl || '',
			branch ? `@${branch}` : '',
			method === 'github_repo_directory' && subdir ? `/${subdir}` : '',
			files.length ? ` • files: ${files.slice(0, 6).join(', ')}${files.length > 6 ? '…' : ''}` : ''
		].join('');
	}

	// ---------------- MAIN CTA: ANALYZE & SAVE ----------------
	async function analyzeAndSave() {
		errorMsg = '';
		statusMsg = '';
		running = true;

		// Validate GitHub inputs for Git methods
		if (isGit) {
			if (!ownerInput.trim()) {
				errorMsg = 'Please enter a GitHub owner/organization.';
				running = false;
				return;
			}
			if (!repoUrl || !repoUrl.includes('github.com')) {
				errorMsg = 'Please select a repository from the dropdown.';
				running = false;
				return;
			}
		}

		let submissionId: string | null = null;

		try {
			// 1) Log "processing"
			statusMsg = 'Queuing…';
			const filesForLog =
				method === 'pasted_code'
					? [pasteFilename]
					: method === 'zipped_folder'
						? []
						: selectedArray(); // zip names are captured in source_meta

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

			// Detect and set repo_provider for repository-based submissions
			const repoProvider = isGit && repoUrl ? detectRepoProvider(repoUrl) : null;

			// ------------------------------------------------------------
			// RLS ENFORCEMENT (important)
			// We do NOT send created_by. Postgres fills created_by = auth.uid().
			// Our policy allows INSERT only when created_by = auth.uid().
			// This guarantees the new row belongs to the current user.
			// ------------------------------------------------------------
			{
				const insertData: any = {
					input_type: method,
					input_content: buildInputContent(),
					status: 'processing' as Status,
					selected_files: filesForLog,
					source_meta
				};

				// Only set repo_provider if we detected one (for repository-based submissions)
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

				// tiny guard so we fail early if something odd happened
				if (!submissionId) throw new Error('Insert did not return a submission id.');
			}

			// 2) Gather files/content for LLM
			statusMsg = 'Collecting source files…';
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
					// Check if it's a 404 (private repo without connection) or rate limit
					if (r.status === 404) {
						if (!hasGitHubConnection) {
							throw new Error(
								'Repository not found or is private. Connect your GitHub account in Settings to access private repositories.'
							);
						} else {
							throw new Error("Repository not found or you don't have access to it.");
						}
					} else if (r.status === 403) {
						if (!hasGitHubConnection) {
							throw new Error(
								'Rate limit exceeded or access denied. Connect your GitHub account in Settings for higher rate limits (5,000/hr vs 60/hr).'
							);
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
				// pasted_code
				filesForDoc = [{ path: pasteFilename || 'snippet.txt', content: pasteCode || '' }];
			}

			if (!filesForDoc.length) throw new Error('No content gathered for summarization.');

			// 3) LLM: generate documentation
			statusMsg = 'Summarizing with AI…';
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
				throw new Error(
					`Expected JSON from generator but got non-JSON (status ${rGen.status}). First bytes: ${text.slice(
						0,
						200
					)}`
				);
			}
			if (!rGen.ok) throw new Error(gen?.error || `Generate failed (${rGen.status})`);
			const markdown = String(gen.markdown || '');

			// 4) Save final result with code snapshot (for GitHub repos)
			statusMsg = 'Saving…';
			// RLS allows UPDATE only if created_by = auth.uid().
			// Because this row was created by us, this update will succeed only for us.

			// Build code snapshot for tracking changes (only for GitHub repos)
			let codeSnapshot: any = null;
			if (isGit && repoUrl && branch) {
				try {
					const selectedFiles = selectedArray();
					if (selectedFiles.length === 0) {
						// No files selected - this is expected if user hasn't selected any files yet
					} else {
						// Get commit SHA and file SHAs
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
					}
				} catch (e) {
					// Non-fatal: continue without snapshot
					// Silently fail - snapshot is optional
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
				.eq('id', submissionId as string);
			if (uerr) throw new Error(uerr.message);

			// At this point:
			//   - The submission row exists
			//   - markdown, summary, status, and code_snapshot are saved
			//
			// Now we tell the server:
			//   "Hey, for this submissionId, please update submission_files
			//    using the stored code_snapshot."
			//
			// We do this as a best-effort, non-blocking step.
			// If it fails, the documentation is STILL saved and usable.
			// It just means auto-update tracking might be missing for that run.
			if (submissionId && codeSnapshot) {
				try {
					await fetch('/api/docs/post-process', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ submissionId })
					});
					// We do not need to inspect the response here.
					// If it fails, logs on the server will tell us what happened.
				} catch (e) {
					// Non-fatal: post-processing is optional
					// Silently fail - documentation is still saved
				}
			}

			// 5) Done → /edit/{id}
			statusMsg = 'Done. Redirecting…';
			window.location.href = `/edit/${submissionId}`;
		} catch (e) {
			errorMsg = String(e);
			statusMsg = '';
			// best-effort: mark failed if we created a submission row
			if (submissionId) {
				await supabase
					.from('submissions')
					.update({ status: 'failed' as Status, error_message: errorMsg.slice(0, 500) })
					.eq('id', submissionId);
			}
		} finally {
			running = false;
		}
	}
</script>

<!-- ======================= MARKUP ======================= -->
<div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-3xl">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="mb-2 text-3xl font-bold text-white">Submit Source</h1>
			<p class="text-white/70">
				Pick a method, provide inputs, select files (for Git), then Analyze & Save.
			</p>
		</div>

		<!-- Method selector -->
		<div class="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
			{#each [{ id: 'github_repo', label: 'Git Repo' }, { id: 'github_repo_directory', label: 'Git Directory' }, { id: 'zipped_folder', label: 'Zip Upload' }, { id: 'pasted_code', label: 'Paste Code' }] as opt}
				<button
					class="flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm text-white transition hover:bg-white/10"
					class:selected={method === (opt.id as InputType)}
					on:click={() => (method = opt.id as InputType)}
					aria-pressed={method === (opt.id as InputType)}
				>
					<svelte:component this={getMethodIcon(opt.id as InputType)} class="h-4 w-4" />
					<span>{opt.label}</span>
				</button>
			{/each}
		</div>

		<!-- Common: Title and Model -->
		<div class="mb-4 grid gap-4 md:grid-cols-2">
			<label class="block">
				<div class="mb-1 text-sm text-white/70">Document title</div>
				<input
					class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
					bind:value={docTitle}
					placeholder="e.g., API Overview"
				/>
			</label>
			<label class="block">
				<div class="mb-1 text-sm text-white/70">AI Model</div>
				<div class="relative" bind:this={modelDropdownRef}>
					<!-- Custom Dropdown Button -->
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-white outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
						on:click={() => !running && (showModelDropdown = !showModelDropdown)}
						disabled={running}
					>
						<div class="flex flex-wrap items-center gap-2">
							{#if selectedModelObj}
								<span class="font-medium">{selectedModelObj.label}</span>
								<span class="text-xs text-white/60">({selectedModelObj.provider})</span>
								<span class="text-xs text-yellow-400">{selectedModelObj.cost}</span>
								<span class="text-xs text-blue-400">{selectedModelObj.context}</span>
							{:else}
								<span class="font-medium">Select model...</span>
							{/if}
						</div>
						<svg
							class="h-4 w-4 text-white/60 transition-transform"
							class:rotate-180={showModelDropdown}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>

					<!-- Dropdown Menu -->
					{#if showModelDropdown}
						<div
							class="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-white/20 bg-gray-900 shadow-xl"
							role="listbox"
						>
							{#each availableModels.filter((m) => m && m.value && m.label) as model}
								<button
									type="button"
									class="w-full px-4 py-3 text-left transition-colors hover:bg-white/10 focus:bg-white/10 focus:outline-none {model?.value &&
									selectedModel === model.value
										? 'bg-white/15'
										: ''}"
									on:click={() => {
										if (model?.value) {
											selectedModel = model.value;
											showModelDropdown = false;
										}
									}}
									role="option"
									aria-selected={model?.value ? selectedModel === model.value : false}
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="mb-1 flex flex-wrap items-center gap-2">
												<span class="font-semibold text-white"
													>{model?.label || 'Unknown Model'}</span
												>
												{#if model?.provider}
													<span class="text-xs text-white/60">({model.provider})</span>
												{/if}
												{#if model?.cost}
													<span class="text-xs font-medium text-yellow-400">{model.cost}</span>
												{/if}
												{#if model?.context}
													<span class="text-xs font-medium text-blue-400">{model.context}</span>
												{/if}
											</div>
											{#if model?.description}
												<p class="text-xs leading-relaxed text-white/70">{model.description}</p>
											{/if}
										</div>
										{#if model?.value && selectedModel === model.value}
											<svg
												class="h-5 w-5 shrink-0 text-green-400"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path
													fill-rule="evenodd"
													d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
													clip-rule="evenodd"
												/>
											</svg>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</label>
		</div>

		<!-- Method-specific inputs -->
		{#if method === 'github_repo' || method === 'github_repo_directory'}
			<!-- GitHub Connection Warning -->
			{#if !checkingGitHub && !hasGitHubConnection}
				<div class="mb-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
					<div class="flex items-start gap-3">
						<AlertTriangle class="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" />
						<div class="flex-1">
							<p class="mb-1 text-sm font-medium text-yellow-200">GitHub Connection Recommended</p>
							<p class="mb-2 text-xs text-yellow-200/80">
								Public repositories will work without a connection, but you'll have lower rate
								limits (60 requests/hour). Private repositories require a GitHub connection.
							</p>
							<a
								href="/settings?tab=integrations"
								class="inline-flex items-center gap-1 text-xs text-yellow-300 underline hover:text-yellow-200"
							>
								Connect GitHub for higher rate limits and private repo access
							</a>
						</div>
					</div>
				</div>
			{/if}

			<!-- Info for public repos -->
			{#if !checkingGitHub && !hasGitHubConnection && repoUrl && repoUrl.includes('github.com')}
				<div class="mb-4 rounded-lg border border-blue-500/50 bg-blue-500/10 p-3">
					<div class="flex items-start gap-2">
						<Info class="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
						<p class="text-xs text-blue-200">
							Public repositories can be accessed without a GitHub connection. If you encounter rate
							limit errors, consider connecting your GitHub account in Settings.
						</p>
					</div>
				</div>
			{/if}

			<div class="mb-4 grid gap-3 md:grid-cols-2">
				<!-- Owner input for repo search -->
				<label class="block md:col-span-2">
					<div class="mb-1 text-sm text-white/70">
						GitHub Owner/Organization <span class="text-red-400">*</span>
					</div>
					<div class="flex gap-2">
						<input
							class="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
							bind:value={ownerInput}
							placeholder="Enter owner/org (e.g., 'facebook' or 'github.com/facebook')"
							required
							on:keydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									searchRepos();
								}
							}}
						/>
						<button
							type="button"
							class="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
							on:click={searchRepos}
							disabled={!ownerInput.trim() || loadingRepos}
						>
							Search
						</button>
					</div>
					<p class="mt-1 text-xs text-white/50">
						Enter a GitHub username or organization to search for repositories
					</p>
				</label>

				<!-- Repo selector dropdown -->
				{#if showRepoSelector && baseOwner}
					<label class="block md:col-span-2">
						<div class="mb-1 text-sm text-white/70">
							Repository <span class="text-red-400">*</span>
						</div>
						<SearchableSelect
							options={repos && Array.isArray(repos)
								? repos
										.filter((r) => r && r.url && r.full_name)
										.map((r) => ({
											value: r.url || '',
											label: `${r.full_name || ''}${r.private ? ' (private)' : ''}`
										}))
								: []}
							value={repoUrl}
							placeholder={loadingRepos ? 'Loading repositories...' : 'Search repositories...'}
							searchPlaceholder="Search repositories..."
							disabled={loadingRepos}
							on:change={(e) => {
								repoUrl = e.detail.value;
							}}
						/>
						{#if loadingRepos}
							<p class="mt-1 text-xs text-white/50">Loading repositories...</p>
						{:else if Array.isArray(repos) && repos.length === 0 && baseOwner}
							<p class="mt-1 text-xs text-white/50">No repositories found for {baseOwner}</p>
						{/if}
					</label>
				{/if}

				<label class="block">
					<div class="mb-1 text-sm text-white/70">Branch</div>
					<SearchableSelect
						options={branches.map((b) => ({ value: b, label: b }))}
						value={branch}
						placeholder={loadingBranches
							? 'Loading...'
							: branches.length === 0
								? 'Enter repo URL first'
								: 'Select branch...'}
						searchPlaceholder="Search branches..."
						disabled={loadingBranches || branches.length === 0}
						on:change={(e) => {
							branch = e.detail.value;
						}}
					/>
					{#if loadingBranches}
						<p class="mt-1 text-xs text-white/50">Loading branches...</p>
					{/if}
					{#if !hasGitHubConnection && !checkingGitHub && branches.length === 0 && !loadingBranches && repoUrl && repoUrl.includes('github.com')}
						<p class="mt-1 text-xs text-yellow-200/70">
							⚠️ If this is a private repo, you'll need to connect GitHub. Public repos should load
							automatically.
						</p>
					{/if}
				</label>

				{#if method === 'github_repo_directory'}
					<label class="block">
						<div class="mb-1 text-sm text-white/70">Subfolder (optional)</div>
						<SearchableSelect
							options={[
								{ value: '', label: 'Root (all files)' },
								...directories.map((d) => ({ value: d, label: d }))
							]}
							value={subdir}
							placeholder={loadingDirectories
								? 'Loading...'
								: directories.length === 0 && branch
									? 'No subdirectories found'
									: 'Select subfolder...'}
							searchPlaceholder="Search directories..."
							disabled={loadingDirectories || !branch}
							on:change={(e) => {
								subdir = e.detail.value;
							}}
						/>
						{#if loadingDirectories}
							<p class="mt-1 text-xs text-white/50">Loading directories...</p>
						{/if}
						{#if !hasGitHubConnection && !checkingGitHub && directories.length === 0 && !loadingDirectories && branch && repoUrl && repoUrl.includes('github.com')}
							<p class="mt-1 text-xs text-yellow-200/70">
								⚠️ If this is a private repo, you'll need to connect GitHub. Public repos should
								load automatically.
							</p>
						{/if}
					</label>
				{/if}
			</div>

			<!-- Git file list -->
			<div class="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div class="text-sm text-white/70">
						Files in repository{#if method === 'github_repo_directory' && subdir}
							/{subdir}{/if}
					</div>
					<div class="flex items-center gap-2">
						{#if showLoadButton}
							<!-- CHANGED: Only show while no files are loaded -->
							<button
								class="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/10"
								on:click={listGitFiles}
								disabled={listing}
								title="List files from Git"
							>
								{#if listing}
									<span class="inline-flex items-center gap-2"
										><Loader2 class="h-4 w-4 animate-spin" /> Loading…</span
									>
								{:else}
									Load files
								{/if}
							</button>
						{/if}

						{#if pickerFiles.length}
							<button
								class="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10"
								on:click={selectAll}
							>
								Select all
							</button>
							<button
								class="rounded-lg border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10"
								on:click={clearAll}
							>
								Clear
							</button>
						{/if}
					</div>
				</div>

				{#if pickerFiles.length}
					<div class="max-h-64 overflow-auto rounded-lg border border-white/10">
						<ul class="divide-y divide-white/10">
							{#each pickerFiles as f}
								<li class="flex items-center gap-3 px-3 py-2">
									<input
										type="checkbox"
										checked={selectedPaths.has(f.path)}
										on:change={() => togglePick(f.path)}
									/>
									<span class="font-mono text-sm text-white/90">{f.path}</span>
									<span class="ml-auto text-xs text-white/50">{f.size} bytes</span>
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<div class="text-sm text-white/60">No files loaded yet.</div>
				{/if}
			</div>
		{:else if method === 'zipped_folder'}
			<div class="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
				<label class="block">
					<div class="mb-1 text-sm text-white/70">Upload a .zip file</div>
					<input
						type="file"
						accept=".zip"
						class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white file:mr-3 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-1 file:text-white hover:bg-white/5"
						on:change={(e: any) => (zipFile = e?.currentTarget?.files?.[0] ?? null)}
					/>
					{#if zipFile}
						<div class="mt-2 text-sm text-white/70">Selected: {zipFile.name}</div>
					{/if}
				</label>
			</div>
		{:else if method === 'pasted_code'}
			<div class="mb-6 rounded-2xl border border-white/20 bg-white/10 p-4">
				<div class="grid gap-3 md:grid-cols-2">
					<label class="block">
						<div class="mb-1 text-sm text-white/70">Filename</div>
						<input
							class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
							bind:value={pasteFilename}
							placeholder="snippet.txt"
						/>
					</label>
					<div></div>
					<label class="block md:col-span-2">
						<div class="mb-1 text-sm text-white/70">Paste your code</div>
						<textarea
							class="h-48 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
							bind:value={pasteCode}
							placeholder="// paste here…"
						></textarea>
					</label>
				</div>
			</div>
		{/if}

		<!-- LLM Prompt Customization -->
		<div class="mb-6">
			<PromptCustomizer bind:promptConfig />
		</div>

		<!-- Error / Status -->
		{#if errorMsg}
			<div class="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
				{errorMsg}
			</div>
		{/if}
		{#if statusMsg}
			<div class="mb-4 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/80">
				{statusMsg}
			</div>
		{/if}

		<!-- Primary CTA -->
		<div class="flex items-center gap-3">
			<button
				class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
				on:click|preventDefault={analyzeAndSave}
				disabled={running}
			>
				{#if running}
					<Loader2 class="h-4 w-4 animate-spin" />
					<span>Analyzing…</span>
				{:else}
					<span>Analyze & Save</span>
				{/if}
			</button>

			<a
				href="/edit"
				class="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
			>
				View History
			</a>
		</div>
	</div>
</div>

<style>
	/* Small helper so the selected method chip feels active */
	/* button[selected], */
	button[aria-pressed='true'] {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.35);
	}
</style>
