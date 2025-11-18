<script lang="ts">
	import { marked } from 'marked';

	export let originalText: string = '';
	export let newText: string = '';
	export let showMarkdown: boolean = true; // Whether to render as markdown or plain text
	
	// Refs for synchronized scrolling (similar to /edit route)
	let originalScrollRef: HTMLDivElement;
	let newScrollRef: HTMLDivElement;
	let isScrolling = false;


	// Scroll-sync: when one pane scrolls, calculate ratio and sync the other (similar to /edit route)
	function handleOriginalScroll() {
		if (isScrolling || !originalScrollRef || !newScrollRef) return;
		isScrolling = true;
		
		// Calculate scroll ratio (0..1) similar to /edit route
		const max = Math.max(1, originalScrollRef.scrollHeight - originalScrollRef.clientHeight);
		const ratio = max > 0 ? originalScrollRef.scrollTop / max : 0;
		
		// Apply same ratio to the other pane
		const newMax = Math.max(1, newScrollRef.scrollHeight - newScrollRef.clientHeight);
		// Choose 'auto' for instant sync (same as /edit route)
		newScrollRef.scrollTo({ top: ratio * newMax, behavior: 'auto' });
		
		requestAnimationFrame(() => {
			isScrolling = false;
		});
	}

	function handleNewScroll() {
		if (isScrolling || !originalScrollRef || !newScrollRef) return;
		isScrolling = true;
		
		// Calculate scroll ratio (0..1) similar to /edit route
		const max = Math.max(1, newScrollRef.scrollHeight - newScrollRef.clientHeight);
		const ratio = max > 0 ? newScrollRef.scrollTop / max : 0;
		
		// Apply same ratio to the other pane
		const originalMax = Math.max(1, originalScrollRef.scrollHeight - originalScrollRef.clientHeight);
		// Choose 'auto' for instant sync (same as /edit route)
		originalScrollRef.scrollTo({ top: ratio * originalMax, behavior: 'auto' });
		
		requestAnimationFrame(() => {
			isScrolling = false;
		});
	}
</script>

<!-- Content Diff View -->
<div class="grid grid-cols-2 gap-4">
	<!-- Original -->
	<div>
		<div class="mb-2 text-sm font-medium text-white/70">Original Documentation</div>
		<div
			bind:this={originalScrollRef}
			class="h-[60vh] overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-4"
			on:scroll={handleOriginalScroll}
		>
			{#if showMarkdown}
				<div class="prose prose-invert max-w-none text-white text-sm leading-relaxed">
					{@html (originalText && marked.parse(originalText)) || '<p class="text-white/50">No content</p>'}
				</div>
			{:else}
				<pre class="whitespace-pre-wrap text-xs text-white/90 font-mono leading-relaxed">{originalText || 'No content'}</pre>
			{/if}
		</div>
	</div>

	<!-- New with highlights -->
	<div>
		<div class="mb-2 text-sm font-medium text-white/70">Updated Documentation</div>
		<div
			bind:this={newScrollRef}
			class="h-[60vh] overflow-y-auto rounded-lg border border-green-500/30 bg-green-500/5 p-4"
			on:scroll={handleNewScroll}
		>
			{#if showMarkdown}
				<!-- Render new text as plain markdown (same structure as original for scroll sync) -->
				<div class="prose prose-invert max-w-none text-white text-sm leading-relaxed">
					{@html (newText && marked.parse(newText)) || '<p class="text-white/50">No content</p>'}
				</div>
			{:else}
				<pre class="whitespace-pre-wrap text-xs text-white/90 font-mono leading-relaxed">{newText || 'No content'}</pre>
			{/if}
		</div>
	</div>
</div>


