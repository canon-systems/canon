<script lang="ts">
	// ------------------------------------------------------------
	// PURPOSE
	// Regenerate documentation for a submission with preview and diff view
	// ------------------------------------------------------------

	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import { Loader2, X, ArrowLeft } from '@lucide/svelte';
	import PromptCustomizer from '$lib/components/PromptCustomizer.svelte';
	import DiffViewer from '$lib/components/DiffViewer.svelte';
	import { marked } from 'marked';

	// Server-loaded data
	export let data: {
		submission: {
			id: string;
			title: string;
			markdown: string;
			source_meta?: any;
		};
	};

	// Available models (same as submit page)
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

	// State
	let currentStep: 'config' | 'preview' = 'config';
	let generatingPreview = false;
	let previewContent = '';
	let previewModel = '';
	let previewPromptConfig: typeof promptConfig = {};
	let previewError = '';
	let selectedRegenModel = data.submission.source_meta?.model || 'gpt-4o';
	let regenPromptConfig: {
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
	let showRegenModelDropdown = false;
	let regenModelDropdownRef: HTMLElement | null = null;
	let regenerating = false;

	// Helper to get selected model object
	$: selectedRegenModelObj = availableModels.find((m) => m.value === selectedRegenModel) || availableModels[0];

	// Click outside handler for dropdown
	import { onMount } from 'svelte';
	onMount(() => {
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

			// Redirect back to edit page after successful update
			await goto(`/edit/${data.submission.id}`);
		} catch (e) {
			previewError = String(e);
		} finally {
			regenerating = false;
		}
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 sm:p-6 lg:p-8">
	<div class="mx-auto max-w-6xl">
		<!-- Header -->
		<div class="mb-6 flex items-center gap-4">
			<a
				href="/edit/{data.submission.id}"
				class="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/20"
			>
				<ArrowLeft class="h-4 w-4" />
				Back to Editor
			</a>
			<h1 class="text-2xl font-semibold text-white">Update Documentation</h1>
		</div>

		<!-- Main Content -->
		<div class="rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md">
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
						<a
							href="/edit/{data.submission.id}"
							class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
						>
							Cancel
						</a>
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

					<!-- Enhanced Diff Viewer (content diff only, no Git diff) -->
					<DiffViewer
						originalText={data.submission.markdown}
						newText={previewContent}
						showMarkdown={true}
					/>

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
						<a
							href="/edit/{data.submission.id}"
							class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
						>
							Cancel
						</a>
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
</div>

