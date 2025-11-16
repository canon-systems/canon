<script lang="ts">
	import { ChevronDown, Sparkles, Settings } from '@lucide/svelte';

	export let promptConfig: {
		personality?: string;
		style?: string;
		customInstructions?: string;
		temperature?: number;
	} = {};

	// Initialize defaults if not set
	if (promptConfig.temperature === undefined) {
		promptConfig.temperature = 0.3;
	}
	if (!promptConfig.personality) {
		promptConfig.personality = 'default';
	}
	if (!promptConfig.style) {
		promptConfig.style = 'default';
	}
	if (!promptConfig.customInstructions) {
		promptConfig.customInstructions = '';
	}

	$: hasCustomization = 
		(promptConfig.personality && promptConfig.personality !== 'default') ||
		(promptConfig.style && promptConfig.style !== 'default') ||
		(promptConfig.customInstructions?.trim() || '').length > 0 ||
		(promptConfig.temperature !== undefined && promptConfig.temperature !== 0.3);

	// Start expanded if there's customization, otherwise collapsed
	// Check if any customization exists at initialization
	const hasInitialCustomization = 
		(promptConfig.personality && promptConfig.personality !== 'default') ||
		(promptConfig.style && promptConfig.style !== 'default') ||
		(promptConfig.customInstructions?.trim() || '').length > 0 ||
		(promptConfig.temperature !== undefined && promptConfig.temperature !== 0.3);
	
	let expanded = hasInitialCustomization;
	let showAdvancedSection = false;

	const personalityOptions = [
		{ value: 'default', label: 'Default (Professional)' },
		{ value: 'friendly', label: 'Friendly & Approachable' },
		{ value: 'concise', label: 'Concise & Direct' },
		{ value: 'detailed', label: 'Detailed & Thorough' },
		{ value: 'conversational', label: 'Conversational' },
		{ value: 'formal', label: 'Formal & Academic' }
	];

	const styleOptions = [
		{ value: 'default', label: 'Default (Technical)' },
		{ value: 'beginner-friendly', label: 'Beginner-Friendly' },
		{ value: 'expert-level', label: 'Expert-Level' },
		{ value: 'tutorial', label: 'Tutorial Style' },
		{ value: 'reference', label: 'Reference Manual' },
		{ value: 'blog-post', label: 'Blog Post Style' }
	];

	const temperaturePresets = [
		{ value: 0.0, label: 'Deterministic (0.0)', description: 'Most consistent, same input = same output' },
		{ value: 0.3, label: 'Balanced (0.3)', description: 'Recommended - creative but consistent' },
		{ value: 0.7, label: 'Creative (0.7)', description: 'More varied and creative responses' },
		{ value: 1.0, label: 'Very Creative (1.0)', description: 'Maximum creativity and variation' }
	];
</script>

<div class="rounded-lg border border-white/20 bg-white/5 p-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Sparkles class="h-4 w-4 text-purple-400" />
			<span class="text-sm font-medium text-white">Documentation Style & Personality</span>
			{#if hasCustomization}
				<span class="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">Custom</span>
			{:else}
				<span class="text-xs text-white/50">(Default settings)</span>
			{/if}
		</div>
		<button
			class="flex items-center gap-1 text-xs text-white/60 hover:text-white/80 transition-colors"
			on:click={() => (expanded = !expanded)}
			title={expanded ? 'Hide customization options' : 'Customize how the AI writes documentation'}
		>
			<span>{expanded ? 'Hide' : 'Customize'}</span>
			<span class="transition-transform duration-200" class:rotate-180={expanded}>
				<ChevronDown class="h-3 w-3" />
			</span>
		</button>
	</div>

	<!-- Quick preview when collapsed -->
	{#if !expanded && hasCustomization}
		<div class="mt-2 text-xs text-white/60">
			<span class="font-medium text-white/80">Active:</span>
			{#if promptConfig.personality && promptConfig.personality !== 'default'}
				{personalityOptions.find(o => o.value === promptConfig.personality)?.label || promptConfig.personality}
			{/if}
			{#if promptConfig.style && promptConfig.style !== 'default'}
				{#if promptConfig.personality && promptConfig.personality !== 'default'} • {/if}
				{styleOptions.find(o => o.value === promptConfig.style)?.label || promptConfig.style}
			{/if}
			{#if promptConfig.temperature !== undefined && promptConfig.temperature !== 0.3}
				{#if (promptConfig.personality && promptConfig.personality !== 'default') || (promptConfig.style && promptConfig.style !== 'default')} • {/if}
				Temp: {promptConfig.temperature.toFixed(1)}
			{/if}
		</div>
	{/if}

	{#if expanded}
		<div class="mt-4 space-y-4">
			<!-- Personality -->
			<div>
				<label class="mb-1.5 block text-xs font-medium text-white/70">
					Personality
				</label>
				<select
					bind:value={promptConfig.personality}
					class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
				>
					{#each personalityOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
				<p class="mt-1 text-xs text-white/50">
					Sets the tone and voice of the documentation
				</p>
			</div>

			<!-- Writing Style -->
			<div>
				<label class="mb-1.5 block text-xs font-medium text-white/70">
					Writing Style
				</label>
				<select
					bind:value={promptConfig.style}
					class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
				>
					{#each styleOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
				<p class="mt-1 text-xs text-white/50">
					Determines the technical level and format of the documentation
				</p>
			</div>

			<!-- Custom Instructions -->
			<div>
				<label class="mb-1.5 block text-xs font-medium text-white/70">
					Custom Instructions (Optional)
				</label>
				<textarea
					bind:value={promptConfig.customInstructions}
					placeholder="e.g., 'Focus on security best practices', 'Include code examples for each API endpoint', 'Use emojis sparingly'"
					rows="3"
					class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/40"
				></textarea>
				<p class="mt-1 text-xs text-white/50">
					Add specific instructions to customize the documentation output
				</p>
			</div>

			<!-- Temperature (Always visible, not hidden in Advanced) -->
			<div>
				<label class="mb-1.5 block text-xs font-medium text-white/70">
					Temperature: {promptConfig.temperature?.toFixed(1) || '0.3'}
				</label>
				<div class="space-y-2">
					<input
						type="range"
						min="0"
						max="1"
						step="0.1"
						bind:value={promptConfig.temperature}
						class="w-full accent-purple-500"
					/>
					<div class="grid grid-cols-2 gap-2 text-xs">
						{#each temperaturePresets as preset}
							{@const isSelected = promptConfig.temperature === preset.value}
							<button
								type="button"
								class="rounded-lg border px-2 py-1.5 transition-colors {isSelected 
									? 'bg-purple-500/20 text-purple-300 border-purple-400/50' 
									: 'border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'}"
								on:click={() => (promptConfig.temperature = preset.value)}
							>
								<div class="font-medium">{preset.label}</div>
								<div class="text-xs text-white/50">{preset.description}</div>
							</button>
						{/each}
					</div>
					<p class="text-xs text-white/50">
						Controls randomness: Lower = more consistent, Higher = more creative
					</p>
				</div>
			</div>

			{#if hasCustomization}
				<button
					class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/20"
					on:click={() => {
						promptConfig.personality = 'default';
						promptConfig.style = 'default';
						promptConfig.customInstructions = '';
						promptConfig.temperature = 0.3;
					}}
				>
					Reset to Default
				</button>
			{/if}
		</div>
	{/if}
</div>

