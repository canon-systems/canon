<script lang="ts">
	// ------------------------------------------------------------
	// PURPOSE
	// Show one submission and allow the owner to edit title + rich content.
	// We still persist Markdown in the DB, converting from/to HTML for TipTap.
	// ------------------------------------------------------------

	// 1) Server-loaded row
	export let data: {
		submission: {
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
		};
	};

	// 2) Local editable copies of title and markdown (we keep storing markdown)
	let title = data.submission.title;
	let markdown = data.submission.markdown;

	// 3) UI state for saves
	let saving = false;
	let saveMsg = '';
	let saveErr = '';

	// 4) Outdated files check state
	let checkingUpdates = false;
	let outdatedFiles: Array<{ file_path: string; old_hash: string; new_hash: string }> = [];
	let isOutdated = false;
	let regenerating = false;
	let regenerateMsg = '';
	let regenerateErr = '';
	let lastCheckedAt: Date | null = null;
	let showChangedFiles = false; // For collapsible file list
	let checkDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// 4a) Regeneration modal state
	let regenerationModalOpen = false;
	let currentStep: 'config' | 'preview' = 'config';
	let generatingPreview = false;
	let previewContent = '';
	let previewModel = '';
	let previewPromptConfig: typeof promptConfig = {};
	let previewError = '';
	let selectedRegenModel = data.submission.source_meta?.model || 'gpt-4o';
	let regenPromptConfig: typeof promptConfig = { ...promptConfig };
	let showRegenModelDropdown = false;
	let regenModelDropdownRef: HTMLElement | null = null;

	// Prompt customization state
	let promptConfig: {
		personality?: string;
		style?: string;
		customInstructions?: string;
		temperature?: number;
	} = data.submission.source_meta?.llm_prompt_config || {
		personality: 'default',
		style: 'default',
		customInstructions: '',
		temperature: 0.3
	};
	let savingPromptConfig = false;
	let promptConfigMsg = '';
	let promptConfigErr = '';

	// 4b) Notion push state
	let notionModalOpen = false;
	let loadingNotionPages = false;
	let notionPages: Array<{ id: string; properties?: any; url?: string }> = [];
	let selectedNotionPageId = '';
	let pushingToNotion = false;
	let notionPushMsg = '';
	let notionPushErr = '';

	// 4c) Confluence push state
	let confluenceModalOpen = false;
	let loadingConfluenceSpaces = false;
	let confluenceSpaces: Array<{ key: string; name: string; type: string }> = [];
	let selectedConfluenceSpaceKey = '';
	let loadingConfluencePages = false;
	let confluencePages: Array<{ id: string; title: string; type: string }> = [];
	let selectedConfluencePageId = '';
	let pushingToConfluence = false;
	let confluencePushMsg = '';
	let confluencePushErr = '';

	// 4d) Google Docs push state
	let googleDocsModalOpen = false;
	let loadingGoogleDocs = false;
	let googleDocs: Array<{ id: string; name: string; createdTime?: string }> = [];
	let selectedGoogleDocId = '';
	let pushingToGoogleDocs = false;
	let googleDocsPushMsg = '';
	let googleDocsPushErr = '';

	// 5) Bring in Supabase + icons
	import { supabase } from '$lib/supabaseClient';
	import { Loader2, RefreshCw, AlertCircle, CheckCircle2, FileText, X, ExternalLink, GitCompare, Clock } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import IntegrationLogos from '$lib/components/IntegrationLogos.svelte';
	import PromptCustomizer from '$lib/components/PromptCustomizer.svelte';
	import { buildFileChangeUrl } from '$lib/utils/repoUrls';

	// 6) Bring in our rich editor component
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	// 7) Converters
	// marked: Markdown -> HTML for TipTap initial content
	import { marked } from 'marked';
	// turndown: HTML -> Markdown when saving
	import TurndownService from 'turndown';
	const turndown = new TurndownService();

	// 7a) Available models for regeneration (same as submit page)
	const availableModels = [
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
	$: selectedRegenModelObj = availableModels.find((m) => m.value === selectedRegenModel) || availableModels[0];

	// 8) Make initial HTML for the editor from the DB markdown
	//    If empty, provide a simple paragraph so the canvas is clickable.
	let initialHTML = (markdown && marked.parse(markdown)) || '<p></p>';

	// 9) Live HTML coming from the editor (we keep it in sync and convert on save)
	let html = String(initialHTML);

	// 10) Status hint
	$: statusNotice =
		data.submission.status === 'processing'
			? 'Note: This submission is still processing.'
			: data.submission.error_message
				? `Last run failed: ${data.submission.error_message}`
				: '';

	// 11) Receive change events from the editor and update our html + markdown
	function handleChange(e: CustomEvent<{ html: string }>) {
		html = e.detail.html;
		// keep the canonical markdown up to date, so Save uses latest value
		markdown = turndown.turndown(html);
	}

	// 12) Save handler: write title/markdown back to Supabase (unchanged table shape)
	async function saveChanges() {
		saveErr = '';
		saveMsg = '';
		saving = true;
		try {
			const { error } = await supabase
				.from('submissions')
				.update({
					title: title || 'Untitled',
					markdown, // store markdown as before
					summary: (markdown || '').replace(/\s+/g, ' ').slice(0, 200)
				})
				.eq('id', data.submission.id);

			if (error) throw new Error(error.message);
			saveMsg = 'Saved.';
		} catch (e) {
			saveErr = String(e);
		} finally {
			saving = false;
		}
	}

	// Save prompt configuration
	async function savePromptConfig() {
		promptConfigErr = '';
		promptConfigMsg = '';
		savingPromptConfig = true;
		try {
			const currentSourceMeta = data.submission.source_meta || {};
			const updatedSourceMeta = {
				...currentSourceMeta,
				llm_prompt_config: promptConfig
			};

			const { error } = await supabase
				.from('submissions')
				.update({
					source_meta: updatedSourceMeta
				})
				.eq('id', data.submission.id);

			if (error) throw new Error(error.message);
			promptConfigMsg = 'Prompt settings saved. These will be used for future regenerations.';
			setTimeout(() => {
				promptConfigMsg = '';
			}, 3000);
		} catch (e) {
			promptConfigErr = String(e);
			setTimeout(() => {
				promptConfigErr = '';
			}, 5000);
		} finally {
			savingPromptConfig = false;
		}
	}

	// Add a ref to the preview container for imperative scrolling.
	let previewPane: HTMLDivElement | null = null;

	// Scroll-sync: when editor emits a ratio (0..1), scroll preview accordingly.
	function handleCursor(e: CustomEvent<{ ratio: number }>) {
		if (!previewPane) return;
		const ratio = e.detail.ratio;
		const max = Math.max(1, previewPane.scrollHeight - previewPane.clientHeight);
		// Choose 'smooth' if you prefer animated sync; 'auto' is instant.
		previewPane.scrollTo({ top: ratio * max, behavior: 'auto' });
	}

	// Check if this is a GitHub repo
	const isGitRepo =
		data.submission.input_type === 'github_repo' ||
		data.submission.input_type === 'github_repo_directory';

	// Check for outdated files (only for repository-based submissions)
	async function checkForUpdates(skipDebounce = false) {
		if (!isGitRepo) return;

		// Debounce checks to avoid redundant API calls
		if (!skipDebounce && checkDebounceTimer) {
			clearTimeout(checkDebounceTimer);
		}

		const doCheck = async () => {
			checkingUpdates = true;
			outdatedFiles = [];
			isOutdated = false;

			try {
				// Verify user is authenticated (more secure than getSession)
				const { data: userData, error: userError } = await supabase.auth.getUser();
				if (userError || !userData?.user) {
					console.warn('No authenticated user available for update check');
					return;
				}
				// Get session token after verifying user
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
						submissionId: data.submission.id
					})
				});

				const result = await res.json().catch(() => ({}));
				if (res.ok) {
					lastCheckedAt = new Date();
					if (result.outdated) {
						isOutdated = true;
						outdatedFiles = result.changedFiles || [];
					}
				} else {
					console.error('Check updates failed:', result);
				}
			} catch (e) {
				console.error('Failed to check for updates:', e);
			} finally {
				checkingUpdates = false;
			}
		};

		if (skipDebounce) {
			await doCheck();
		} else {
			checkDebounceTimer = setTimeout(doCheck, 500); // 500ms debounce
		}
	}

	// Auto-check on page load if not recently checked (with debounce)
	onMount(() => {
		if (isGitRepo && data.submission.status === 'completed') {
			// Check if we should auto-check (not checked in last 5 minutes)
			const shouldAutoCheck = !lastCheckedAt || 
				(Date.now() - lastCheckedAt.getTime()) > 5 * 60 * 1000;
			
			if (shouldAutoCheck) {
				checkForUpdates(true); // Skip debounce for initial check
			}
		}

		// Click outside handler for model dropdown
		function handleClickOutside(event: MouseEvent) {
			if (showRegenModelDropdown && regenModelDropdownRef && !regenModelDropdownRef.contains(event.target as Node)) {
				showRegenModelDropdown = false;
			}
		}
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Open regeneration modal
	function openRegenerationModal() {
		regenerationModalOpen = true;
		currentStep = 'config';
		previewContent = '';
		previewError = '';
		generatingPreview = false;
		// Reset to saved or default values
		selectedRegenModel = data.submission.source_meta?.model || 'gpt-4o';
		regenPromptConfig = { ...promptConfig };
	}

	// Generate preview of updated documentation
	async function generatePreview() {
		generatingPreview = true;
		previewError = '';
		previewContent = '';

		try {
			// Get the authenticated user
			const { data: userData, error: userError } = await supabase.auth.getUser();
			if (userError || !userData?.user) {
				throw new Error('No authenticated user available');
			}
			const { data: sessionData } = await supabase.auth.getSession();
			const token = sessionData?.session?.access_token;

			if (!token) {
				throw new Error('No session token available');
			}

			const res = await fetch('/api/docs/generate-preview', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					submissionId: data.submission.id,
					model: selectedRegenModel,
					promptConfig: regenPromptConfig
				})
			});

			const result = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(result?.error || result?.detail || `Preview generation failed (${res.status})`);
			}

			previewContent = result.markdown || '';
			previewModel = result.model || selectedRegenModel;
			previewPromptConfig = result.promptConfig || regenPromptConfig;
			currentStep = 'preview';
		} catch (e) {
			previewError = String(e);
		} finally {
			generatingPreview = false;
		}
	}

	// Apply the preview changes
	async function applyPreviewChanges() {
		regenerating = true;
		regenerateErr = '';
		regenerateMsg = '';

		try {
			// Get the authenticated user
			const { data: userData, error: userError } = await supabase.auth.getUser();
			if (userError || !userData?.user) {
				throw new Error('No authenticated user available');
			}
			const { data: sessionData } = await supabase.auth.getSession();
			const token = sessionData?.session?.access_token;

			if (!token) {
				throw new Error('No session token available');
			}

			// Use the preview content
			const res = await fetch('/api/docs/update', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					submissionId: data.submission.id,
					previewContent: previewContent // Send preview content to use instead of generating
				})
			});

			const result = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(result?.error || result?.detail || `Update failed (${res.status})`);
			}

			// Fetch updated submission data
			const { data: updatedData, error: fetchError } = await supabase
				.from('submissions')
				.select('markdown, is_outdated')
				.eq('id', data.submission.id)
				.single();

			if (fetchError || !updatedData) {
				// Fallback to page reload if fetch fails
				regenerateMsg = 'Documentation regenerated successfully! Refreshing...';
				setTimeout(() => {
					window.location.reload();
				}, 1500);
				return;
			}

			// Update content in-place without page reload
			markdown = updatedData.markdown || '';
			html = (markdown && marked.parse(markdown)) || '<p></p>';
			initialHTML = html;
			isOutdated = false;
			outdatedFiles = [];
			
			// Close modal
			regenerationModalOpen = false;
			currentStep = 'config';
			previewContent = '';
			
			// Show success message with workspace sync status
			if (result.workspaceUpdated && result.workspaceProvider) {
				regenerateMsg = `Documentation regenerated and synced to ${result.workspaceProvider}!`;
			} else {
				regenerateMsg = 'Documentation regenerated successfully!';
			}
			
			// Clear message after 3 seconds
			setTimeout(() => {
				regenerateMsg = '';
			}, 3000);
		} catch (e) {
			regenerateErr = String(e);
			// Clear error after 5 seconds
			setTimeout(() => {
				regenerateErr = '';
			}, 5000);
		} finally {
			regenerating = false;
		}
	}

	// Click outside handler for model dropdown (will be added to existing onMount)

	// Notion push functions
	async function openNotionModal() {
		notionModalOpen = true;
		notionPushMsg = '';
		notionPushErr = '';
		selectedNotionPageId = '';
		await loadNotionPages();
	}

	async function refreshNotionPages() {
		notionPushErr = '';
		await loadNotionPages();
	}

	async function loadNotionPages() {
		loadingNotionPages = true;
		try {
			const response = await fetch('/api/integrations/notion/pages');
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to load Notion pages');
			}
			const data = await response.json();
			notionPages = data.pages || [];
		} catch (err: any) {
			notionPushErr = err.message || 'Failed to load Notion pages';
		} finally {
			loadingNotionPages = false;
		}
	}

	async function pushToNotion() {
		if (!selectedNotionPageId) {
			notionPushErr = 'Please select a Notion page';
			return;
		}

		pushingToNotion = true;
		notionPushMsg = '';
		notionPushErr = '';

		try {
			const response = await fetch('/api/integrations/notion/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					submissionId: data.submission.id,
					pageId: selectedNotionPageId,
					title: title || 'Documentation',
					html: html, // Send HTML to preserve formatting
					markdown: markdown // Fallback
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || data.detail || 'Failed to push to Notion');
			}

			const result = await response.json();
			notionPushMsg = result.message || 'Successfully pushed to Notion!';
			
			// Close modal after a short delay
			setTimeout(() => {
				notionModalOpen = false;
			}, 2000);
		} catch (err: any) {
			notionPushErr = err.message || 'Failed to push to Notion';
		} finally {
			pushingToNotion = false;
		}
	}

	// Confluence push functions
	async function openConfluenceModal() {
		confluenceModalOpen = true;
		confluencePushMsg = '';
		confluencePushErr = '';
		selectedConfluenceSpaceKey = '';
		selectedConfluencePageId = '';
		confluencePages = [];
		await loadConfluenceSpaces();
	}

	async function refreshConfluenceSpaces() {
		confluencePushErr = '';
		await loadConfluenceSpaces();
	}

	async function loadConfluenceSpaces() {
		loadingConfluenceSpaces = true;
		try {
			const response = await fetch('/api/integrations/confluence/spaces');
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to load Confluence spaces');
			}
			const data = await response.json();
			confluenceSpaces = data.spaces || [];
		} catch (err: any) {
			confluencePushErr = err.message || 'Failed to load Confluence spaces';
		} finally {
			loadingConfluenceSpaces = false;
		}
	}

	async function loadConfluencePages() {
		if (!selectedConfluenceSpaceKey) return;
		loadingConfluencePages = true;
		confluencePushErr = '';
		try {
			const response = await fetch(`/api/integrations/confluence/pages?spaceKey=${selectedConfluenceSpaceKey}`);
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to load Confluence pages');
			}
			const data = await response.json();
			confluencePages = data.pages || [];
		} catch (err: any) {
			confluencePushErr = err.message || 'Failed to load Confluence pages';
		} finally {
			loadingConfluencePages = false;
		}
	}

	async function pushToConfluence() {
		if (!selectedConfluenceSpaceKey) {
			confluencePushErr = 'Please select a Confluence space';
			return;
		}

		pushingToConfluence = true;
		confluencePushMsg = '';
		confluencePushErr = '';

		try {
			const response = await fetch('/api/integrations/confluence/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					submissionId: data.submission.id,
					spaceKey: selectedConfluenceSpaceKey,
					parentPageId: selectedConfluencePageId || undefined,
					title: title || 'Documentation',
					html: html,
					markdown: markdown
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || data.detail || 'Failed to push to Confluence');
			}

			const result = await response.json();
			confluencePushMsg = result.message || 'Successfully pushed to Confluence!';
			
			setTimeout(() => {
				confluenceModalOpen = false;
			}, 2000);
		} catch (err: any) {
			confluencePushErr = err.message || 'Failed to push to Confluence';
		} finally {
			pushingToConfluence = false;
		}
	}

	// Google Docs push functions
	async function openGoogleDocsModal() {
		googleDocsModalOpen = true;
		googleDocsPushMsg = '';
		googleDocsPushErr = '';
		selectedGoogleDocId = '';
		await loadGoogleDocs();
	}

	async function refreshGoogleDocs() {
		googleDocsPushErr = '';
		await loadGoogleDocs();
	}

	async function loadGoogleDocs() {
		loadingGoogleDocs = true;
		try {
			const response = await fetch('/api/integrations/googledocs/documents');
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to load Google Docs');
			}
			const data = await response.json();
			googleDocs = data.documents || [];
		} catch (err: any) {
			googleDocsPushErr = err.message || 'Failed to load Google Docs';
		} finally {
			loadingGoogleDocs = false;
		}
	}

	async function pushToGoogleDocs() {
		pushingToGoogleDocs = true;
		googleDocsPushMsg = '';
		googleDocsPushErr = '';

		try {
			const response = await fetch('/api/integrations/googledocs/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					submissionId: data.submission.id,
					documentId: selectedGoogleDocId || undefined,
					title: title || 'Documentation',
					html: html,
					markdown: markdown
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || data.detail || 'Failed to push to Google Docs');
			}

			const result = await response.json();
			googleDocsPushMsg = result.message || 'Successfully pushed to Google Docs!';
			
			setTimeout(() => {
				googleDocsModalOpen = false;
			}, 2000);
		} catch (err: any) {
			googleDocsPushErr = err.message || 'Failed to push to Google Docs';
		} finally {
			pushingToGoogleDocs = false;
		}
	}

</script>

<!-- ------------------------------------------------------------
     MARKUP
     ------------------------------------------------------------ -->
<div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto w-full max-w-none space-y-6">
		<header>
			<h1 class="text-3xl font-bold text-white">Edit Documentation</h1>
			<p class="text-white/60">
				Submission ID: <span class="font-mono">{data.submission.id}</span>
			</p>
			<p class="text-white/60">
				Created: {new Date(data.submission.created_date).toLocaleString()}
			</p>
			{#if statusNotice}
				<div
					class="mt-2 rounded-xl border border-yellow-300/30 bg-yellow-500/10 px-3 py-2 text-yellow-200"
				>
					{statusNotice}
				</div>
			{/if}

			<!-- Outdated files banner -->
			{#if checkingUpdates}
				<div
					class="mt-2 flex items-center gap-2 rounded-xl border border-blue-300/30 bg-blue-500/10 px-3 py-2 text-blue-200"
				>
					<Loader2 class="h-4 w-4 animate-spin" />
					<span>Checking for updates...</span>
				</div>
			{:else if isOutdated && outdatedFiles.length > 0}
				<div
					class="mt-2 rounded-xl border border-orange-300/30 bg-orange-500/10 px-4 py-3 text-orange-200"
				>
					<div class="mb-2 flex items-center gap-2">
						<AlertCircle class="h-5 w-5" />
						<span class="font-semibold">Source files have changed</span>
					</div>
					<p class="mb-3 text-sm text-orange-200/80">
						{outdatedFiles.length} file{outdatedFiles.length === 1 ? '' : 's'} have been modified since
						this documentation was created.
					</p>
					{#if data.submission.source_meta?.workspace}
						{@const workspace = data.submission.source_meta.workspace}
						{@const providerName = workspace.provider || 'workspace'}
						<p class="mb-3 text-xs text-orange-200/70">
							📝 <strong>{providerName} linked:</strong> Existing documentation will be pulled from {providerName} and used as context for regeneration. The {providerName} page will be updated after regeneration.
						</p>
					{/if}
					{#if lastCheckedAt}
						<p class="mb-3 text-xs text-orange-200/60">
							Last checked: {lastCheckedAt.toLocaleTimeString()}
						</p>
					{/if}
					<button
						class="mb-3 inline-flex items-center gap-2 rounded-lg bg-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-200 hover:bg-orange-500/30"
						on:click|preventDefault={() => (showChangedFiles = !showChangedFiles)}
					>
						<FileText class="h-3 w-3" />
						<span>{showChangedFiles ? 'Hide' : 'Show'} changed files</span>
					</button>
					{#if showChangedFiles}
						<div class="mb-3 ml-4 max-h-48 space-y-2 overflow-y-auto">
							{#each outdatedFiles as file}
								{@const repoUrl = data.submission.source_meta?.repoUrl || ''}
								{@const branch = data.submission.source_meta?.branch || 'main'}
								{@const oldCommitSha = data.submission.code_snapshot?.commitSha}
								{@const urls = buildFileChangeUrl(file.file_path, repoUrl, branch, oldCommitSha)}
								
								<div class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
									<span class="font-mono text-xs text-orange-200/90 flex-1 truncate" title={file.file_path}>
										{file.file_path}
									</span>
									<div class="flex items-center gap-1">
										<a
											href={urls.view}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 transition-colors"
											title="View current version"
										>
											<FileText class="h-3 w-3" />
											View
										</a>
										{#if urls.compare}
											<a
												href={urls.compare}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 transition-colors"
												title="Compare changes"
											>
												<GitCompare class="h-3 w-3" />
												Compare
											</a>
										{/if}
										{#if urls.history}
											<a
												href={urls.history}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-green-300 hover:bg-green-500/20 hover:text-green-200 transition-colors"
												title="View commit history"
											>
												<Clock class="h-3 w-3" />
												History
											</a>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
					<button
						class="inline-flex items-center gap-2 rounded-lg bg-orange-500/20 px-4 py-2 text-sm font-medium text-orange-200 hover:bg-orange-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
						on:click|preventDefault={openRegenerationModal}
						disabled={regenerating}
					>
						{#if regenerating}
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>Regenerating...</span>
						{:else}
							<RefreshCw class="h-4 w-4" />
							<span>Update Documentation</span>
						{/if}
					</button>
					{#if regenerateErr}
						<div class="mt-2 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
							<strong>Error:</strong> {regenerateErr}
						</div>
					{/if}
					{#if regenerateMsg}
						<div class="mt-2 rounded-lg bg-green-500/20 px-3 py-2 text-sm text-green-300">
							<CheckCircle2 class="mr-1 inline h-4 w-4" />
							{regenerateMsg}
						</div>
					{/if}
				</div>
			{:else if isGitRepo && data.submission.status === 'completed'}
				<!-- Fresh status indicator -->
				<div
					class="mt-2 flex items-center gap-2 rounded-xl border border-green-300/30 bg-green-500/10 px-3 py-2 text-green-200"
				>
					<CheckCircle2 class="h-4 w-4" />
					<span class="text-sm">Documentation is up to date</span>
					{#if lastCheckedAt}
						<span class="ml-2 text-xs text-green-200/60">
							(Checked {Math.round((Date.now() - lastCheckedAt.getTime()) / 1000 / 60)} min ago)
						</span>
					{/if}
					<button
						class="ml-auto inline-flex items-center gap-1 rounded-lg bg-green-500/20 px-3 py-1 text-xs font-medium text-green-200 hover:bg-green-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
						on:click|preventDefault={() => checkForUpdates(true)}
						disabled={checkingUpdates}
						title="Check for updates"
					>
						{#if checkingUpdates}
							<Loader2 class="h-3 w-3 animate-spin" />
							Checking...
						{:else}
							<RefreshCw class="h-3 w-3" />
							Check Now
						{/if}
					</button>
				</div>
			{/if}
		</header>

		<!-- Title input -->
		<label class="block">
			<div class="mb-1 text-sm text-white/70">Title</div>
			<input
				class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
				bind:value={title}
				placeholder="Untitled"
			/>
		</label>

		<!-- LLM Prompt Customization -->
		<div class="mb-4">
			<PromptCustomizer bind:promptConfig />
			<div class="mt-2 flex items-center gap-2">
				<button
					class="inline-flex items-center gap-2 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-200 hover:bg-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
					on:click|preventDefault={savePromptConfig}
					disabled={savingPromptConfig}
				>
					{#if savingPromptConfig}
						<Loader2 class="h-3 w-3 animate-spin" />
						<span>Saving...</span>
					{:else}
						<span>Save Prompt Settings</span>
					{/if}
				</button>
				{#if promptConfigMsg}
					<span class="text-xs text-green-300">{promptConfigMsg}</span>
				{/if}
				{#if promptConfigErr}
					<span class="text-xs text-red-300">{promptConfigErr}</span>
				{/if}
			</div>
		</div>

		<!-- Side-by-side full-width layout (desktop-focused, true 50/50 without overflow) -->
		<div class="space-y-2">
			<div class="mb-1 text-sm text-white/70">Content</div>

			<!-- Center the workspace. overflow-x-hidden guards against rare subpixel overflow -->
			<div class="flex justify-center overflow-x-hidden">
				<div class="flex w-full max-w-[4000px] gap-8">
					<div class="h-[75vh] min-w-0 flex-1">
						<RichTextEditor
							initialHTML={String(initialHTML)}
							on:change={handleChange}
							on:cursor={handleCursor}
						/>
					</div>
					<div
						class="h-[75vh] min-w-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-6 backdrop-blur-md"
						bind:this={previewPane}
					>
						<div class="mb-2 text-sm text-white/70">Live preview</div>
						<div
							class="prose prose-invert min-h-full max-w-none break-words text-white"
							on:click|stopPropagation
						>
							{@html html}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Save controls -->
		<div class="flex items-center gap-3">
			<button
				class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
				on:click|preventDefault={saveChanges}
				disabled={saving}
			>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
					<span>Saving…</span>
				{:else}
					<span>Save</span>
				{/if}
			</button>

			<button
				class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10 disabled:opacity-60"
				on:click|preventDefault={openNotionModal}
				disabled={saving}
			>
				<IntegrationLogos provider="notion" size={16} />
				<span>Push to Notion</span>
			</button>

			<button
				class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10 disabled:opacity-60"
				on:click|preventDefault={openConfluenceModal}
				disabled={saving}
			>
				<IntegrationLogos provider="confluence" size={16} />
				<span>Push to Confluence</span>
			</button>

			<button
				class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10 disabled:opacity-60"
				on:click|preventDefault={openGoogleDocsModal}
				disabled={saving}
			>
				<IntegrationLogos provider="google-docs" size={16} />
				<span>Push to Google Docs</span>
			</button>

			<a
				href="/edit"
				class="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
			>
				Back to Edit
			</a>
		</div>

		<!-- Save messages -->
		{#if saveErr}
			<div class="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
				{saveErr}
			</div>
		{/if}
		{#if saveMsg}
			<div class="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white/80">
				{saveMsg}
			</div>
		{/if}
	</div>
</div>

<!-- Notion Push Modal -->
{#if notionModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		on:click={() => (notionModalOpen = false)}
		on:keydown={(e) => e.key === 'Escape' && (notionModalOpen = false)}
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-lg rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
			on:click|stopPropagation
		>
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<IntegrationLogos provider="notion" size={20} />
					<h2 class="text-xl font-semibold text-white">Push to Notion</h2>
				</div>
				<button
					class="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
					on:click={() => (notionModalOpen = false)}
				>
					<X class="h-5 w-5" />
				</button>
			</div>
			<p class="mb-4 text-sm text-white/70">
				Select a Notion page to create a new child page with this documentation.
			</p>

			{#if loadingNotionPages}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin text-white/50" />
					<span class="ml-2 text-white/70">Loading pages...</span>
				</div>
			{:else if notionPages.length === 0}
				<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
					<p class="text-sm">
						No Notion pages found. Make sure you've shared pages with your integration.
					</p>
					<a
						href="/integrations"
						class="mt-2 inline-block text-sm underline"
					>
						Check your Notion connection
					</a>
				</div>
			{:else}
				<div class="mb-4">
					<div class="mb-2 flex items-center justify-between">
						<label class="block text-sm text-white/70">Select a page:</label>
						<button
							class="flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
							on:click={refreshNotionPages}
							disabled={loadingNotionPages}
							title="Refresh pages list"
						>
							<RefreshCw class="h-3 w-3" />
							Refresh
						</button>
					</div>
					<select
						bind:value={selectedNotionPageId}
						class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
					>
						<option value="">-- Select a page --</option>
						{#each notionPages as page}
							<option value={page.id}>
								{page.properties?.title?.title?.[0]?.plain_text || page.id}
							</option>
						{/each}
					</select>
				</div>
			{/if}

			{#if notionPushErr}
				<div class="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
					{notionPushErr}
				</div>
			{/if}

			{#if notionPushMsg}
				<div class="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-200">
					{notionPushMsg}
				</div>
			{/if}

			<div class="flex justify-end gap-3">
				<button
					class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
					on:click={() => (notionModalOpen = false)}
				>
					Cancel
				</button>
				<button
					class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					on:click|preventDefault={pushToNotion}
					disabled={!selectedNotionPageId || pushingToNotion || loadingNotionPages}
				>
					{#if pushingToNotion}
						<span class="flex items-center gap-2">
							<Loader2 class="h-4 w-4 animate-spin" />
							Pushing...
						</span>
					{:else}
						Push to Notion
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Confluence Push Modal -->
{#if confluenceModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		on:click={() => (confluenceModalOpen = false)}
		on:keydown={(e) => e.key === 'Escape' && (confluenceModalOpen = false)}
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-lg rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
			on:click|stopPropagation
		>
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<IntegrationLogos provider="confluence" size={20} />
					<h2 class="text-xl font-semibold text-white">Push to Confluence</h2>
				</div>
				<button
					class="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
					on:click={() => (confluenceModalOpen = false)}
				>
					<X class="h-5 w-5" />
				</button>
			</div>
			<p class="mb-4 text-sm text-white/70">
				Select a Confluence space and optionally a parent page to create a new page with this documentation.
			</p>

			{#if loadingConfluenceSpaces}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin text-white/50" />
					<span class="ml-2 text-white/70">Loading spaces...</span>
				</div>
			{:else if confluenceSpaces.length === 0}
				<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
					<p class="text-sm">
						No Confluence spaces found. Make sure you have access to spaces.
					</p>
					<a
						href="/integrations"
						class="mt-2 inline-block text-sm underline"
					>
						Check your Confluence connection
					</a>
				</div>
			{:else}
				<div class="mb-4">
					<div class="mb-2 flex items-center justify-between">
						<label class="block text-sm text-white/70">Select a space:</label>
						<button
							class="flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
							on:click={refreshConfluenceSpaces}
							disabled={loadingConfluenceSpaces}
							title="Refresh spaces list"
						>
							<RefreshCw class="h-3 w-3" />
							Refresh
						</button>
					</div>
					<select
						bind:value={selectedConfluenceSpaceKey}
						on:change={loadConfluencePages}
						class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
					>
						<option value="">-- Select a space --</option>
						{#each confluenceSpaces as space}
							<option value={space.key}>
								{space.name} ({space.type})
							</option>
						{/each}
					</select>
				</div>

				{#if selectedConfluenceSpaceKey}
					<div class="mb-4">
						<label class="mb-2 block text-sm text-white/70">Select a parent page (optional):</label>
						{#if loadingConfluencePages}
							<div class="flex items-center justify-center py-4">
								<Loader2 class="h-4 w-4 animate-spin text-white/50" />
								<span class="ml-2 text-sm text-white/70">Loading pages...</span>
							</div>
						{:else}
							<select
								bind:value={selectedConfluencePageId}
								class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
							>
								<option value="">-- Create as top-level page --</option>
								{#each confluencePages as page}
									<option value={page.id}>
										{page.title}
									</option>
								{/each}
							</select>
						{/if}
					</div>
				{/if}
			{/if}

			{#if confluencePushErr}
				<div class="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
					{confluencePushErr}
				</div>
			{/if}

			{#if confluencePushMsg}
				<div class="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-200">
					{confluencePushMsg}
				</div>
			{/if}

			<div class="flex justify-end gap-3">
				<button
					class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
					on:click={() => (confluenceModalOpen = false)}
				>
					Cancel
				</button>
				<button
					class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					on:click|preventDefault={pushToConfluence}
					disabled={!selectedConfluenceSpaceKey || pushingToConfluence || loadingConfluenceSpaces}
				>
					{#if pushingToConfluence}
						<span class="flex items-center gap-2">
							<Loader2 class="h-4 w-4 animate-spin" />
							Pushing...
						</span>
					{:else}
						Push to Confluence
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Google Docs Push Modal -->
{#if googleDocsModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		on:click={() => (googleDocsModalOpen = false)}
		on:keydown={(e) => e.key === 'Escape' && (googleDocsModalOpen = false)}
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-lg rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
			on:click|stopPropagation
		>
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<IntegrationLogos provider="google-docs" size={20} />
					<h2 class="text-xl font-semibold text-white">Push to Google Docs</h2>
				</div>
				<button
					class="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
					on:click={() => (googleDocsModalOpen = false)}
				>
					<X class="h-5 w-5" />
				</button>
			</div>
			<p class="mb-4 text-sm text-white/70">
				Select an existing Google Doc to update, or leave empty to create a new document.
			</p>

			{#if loadingGoogleDocs}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin text-white/50" />
					<span class="ml-2 text-white/70">Loading documents...</span>
				</div>
			{:else}
				<div class="mb-4">
					<div class="mb-2 flex items-center justify-between">
						<label class="block text-sm text-white/70">Select a document (optional):</label>
						<button
							class="flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
							on:click={refreshGoogleDocs}
							disabled={loadingGoogleDocs}
							title="Refresh documents list"
						>
							<RefreshCw class="h-3 w-3" />
							Refresh
						</button>
					</div>
					<select
						bind:value={selectedGoogleDocId}
						class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
					>
						<option value="">-- Create new document --</option>
						{#each googleDocs as doc}
							<option value={doc.id}>
								{doc.name}
							</option>
						{/each}
					</select>
				</div>
			{/if}

			{#if googleDocsPushErr}
				<div class="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
					{googleDocsPushErr}
				</div>
			{/if}

			{#if googleDocsPushMsg}
				<div class="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-200">
					{googleDocsPushMsg}
				</div>
			{/if}

			<div class="flex justify-end gap-3">
				<button
					class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
					on:click={() => (googleDocsModalOpen = false)}
				>
					Cancel
				</button>
				<button
					class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					on:click|preventDefault={pushToGoogleDocs}
					disabled={pushingToGoogleDocs || loadingGoogleDocs}
				>
					{#if pushingToGoogleDocs}
						<span class="flex items-center gap-2">
							<Loader2 class="h-4 w-4 animate-spin" />
							Pushing...
						</span>
					{:else}
						{selectedGoogleDocId ? 'Update' : 'Create'} Document
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Regeneration Modal -->
{#if regenerationModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		on:click={() => {
			if (currentStep === 'config') {
				regenerationModalOpen = false;
			}
		}}
		on:keydown={(e) => e.key === 'Escape' && currentStep === 'config' && (regenerationModalOpen = false)}
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-4xl max-h-[90vh] rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md overflow-y-auto"
			on:click|stopPropagation
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-semibold text-white">Update Documentation</h2>
				{#if currentStep === 'config'}
					<button
						class="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
						on:click={() => (regenerationModalOpen = false)}
					>
						<X class="h-5 w-5" />
					</button>
				{/if}
			</div>

			{#if currentStep === 'config'}
				<!-- Configuration Step -->
				<div class="space-y-6">
					<p class="text-sm text-white/70">
						Configure the model and prompt settings for regenerating your documentation.
					</p>

					<!-- Model Selection -->
					<div>
						<label class="mb-2 block text-sm font-medium text-white/70">AI Model</label>
						<div class="relative" bind:this={regenModelDropdownRef}>
							<button
								type="button"
								class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left text-white outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
								on:click={() => (showRegenModelDropdown = !showRegenModelDropdown)}
								disabled={generatingPreview}
							>
								<div class="flex items-center gap-2 flex-wrap">
									<span class="font-medium">{selectedRegenModelObj.label}</span>
									<span class="text-xs text-white/60">({selectedRegenModelObj.provider})</span>
									<span class="text-xs text-yellow-400">{selectedRegenModelObj.cost}</span>
									<span class="text-xs text-blue-400">{selectedRegenModelObj.context}</span>
								</div>
								<svg
									class="h-4 w-4 text-white/60 transition-transform"
									class:rotate-180={showRegenModelDropdown}
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>

							{#if showRegenModelDropdown}
								<div
									class="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-white/20 bg-gray-900 shadow-xl"
									role="listbox"
								>
									{#each availableModels as model}
										<button
											type="button"
											class="w-full px-4 py-3 text-left transition-colors hover:bg-white/10 focus:bg-white/10 focus:outline-none {selectedRegenModel === model.value ? 'bg-white/15' : ''}"
											on:click={() => {
												selectedRegenModel = model.value;
												showRegenModelDropdown = false;
											}}
											role="option"
											aria-selected={selectedRegenModel === model.value}
										>
											<div class="flex items-start justify-between gap-3">
												<div class="flex-1 min-w-0">
													<div class="flex items-center gap-2 mb-1 flex-wrap">
														<span class="font-semibold text-white">{model.label}</span>
														<span class="text-xs text-white/60">({model.provider})</span>
														<span class="text-xs text-yellow-400 font-medium">{model.cost}</span>
														<span class="text-xs text-blue-400 font-medium">{model.context}</span>
													</div>
													<p class="text-xs text-white/70 leading-relaxed">{model.description}</p>
												</div>
												{#if selectedRegenModel === model.value}
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
					</div>

					<!-- Prompt Customization -->
					<div>
						<PromptCustomizer bind:promptConfig={regenPromptConfig} />
					</div>

					<!-- Error Message -->
					{#if previewError}
						<div class="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
							{previewError}
						</div>
					{/if}

					<!-- Actions -->
					<div class="flex justify-end gap-3">
						<button
							class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
							on:click={() => (regenerationModalOpen = false)}
						>
							Cancel
						</button>
						<button
							class="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-white hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
							on:click|preventDefault={generatePreview}
							disabled={generatingPreview}
						>
							{#if generatingPreview}
								<span class="flex items-center gap-2">
									<Loader2 class="h-4 w-4 animate-spin" />
									Generating Preview...
								</span>
							{:else}
								Generate Preview
							{/if}
						</button>
					</div>
				</div>
			{:else if currentStep === 'preview'}
				<!-- Preview Step -->
				<div class="space-y-4">
					<div class="mb-4 flex items-center justify-between">
						<div>
							<p class="text-sm text-white/70">
								Generated with <strong>{previewModel}</strong>
								{#if previewPromptConfig.personality && previewPromptConfig.personality !== 'default'}
									, {previewPromptConfig.personality} personality
								{/if}
								{#if previewPromptConfig.style && previewPromptConfig.style !== 'default'}
									, {previewPromptConfig.style} style
								{/if}
							</p>
						</div>
						<button
							class="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
							on:click={() => (currentStep = 'config')}
							title="Back to configuration"
						>
							<X class="h-5 w-5" />
						</button>
					</div>

					<!-- Side-by-side comparison -->
					<div class="grid grid-cols-2 gap-4">
						<!-- Original -->
						<div>
							<div class="mb-2 text-sm font-medium text-white/70">Original Documentation</div>
							<div class="h-[60vh] overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-4">
								<div class="prose prose-invert max-w-none text-white text-sm">
									{@html (markdown && marked.parse(markdown)) || '<p class="text-white/50">No content</p>'}
								</div>
							</div>
						</div>

						<!-- Preview -->
						<div>
							<div class="mb-2 text-sm font-medium text-white/70">New Documentation (Preview)</div>
							<div class="h-[60vh] overflow-y-auto rounded-lg border border-green-500/30 bg-green-500/5 p-4">
								<div class="prose prose-invert max-w-none text-white text-sm">
									{@html (previewContent && marked.parse(previewContent)) || '<p class="text-white/50">No preview content</p>'}
								</div>
							</div>
						</div>
					</div>

					<!-- Actions -->
					<div class="flex justify-end gap-3">
						<button
							class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
							on:click={() => {
								currentStep = 'config';
								previewContent = '';
							}}
						>
							Back to Settings
						</button>
						<button
							class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
							on:click={() => {
								regenerationModalOpen = false;
								currentStep = 'config';
								previewContent = '';
							}}
						>
							Cancel
						</button>
						<button
							class="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-white hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
							on:click|preventDefault={applyPreviewChanges}
							disabled={regenerating || !previewContent}
						>
							{#if regenerating}
								<span class="flex items-center gap-2">
									<Loader2 class="h-4 w-4 animate-spin" />
									Applying Changes...
								</span>
							{:else}
								Apply Changes
							{/if}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
