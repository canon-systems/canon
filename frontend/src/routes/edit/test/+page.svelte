<script lang="ts">
	import { onMount } from 'svelte';
	// Import the rich text editor you built earlier
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	// Keep a reactive variable to hold the HTML content emitted by the editor
	let contentHTML = '<p>Welcome to your new rich text editor 🎉</p>';

	// Log every time content changes so you can see it working
	function handleChange(event: CustomEvent<{ html: string }>) {
		contentHTML = event.detail.html;
		console.log('Editor content:', contentHTML);
	}

	onMount(() => {
		console.log('Edit page mounted');
	});
</script>

<div class="min-h-screen bg-gray-900 p-8 text-white">
	<h1 class="mb-6 text-3xl font-bold">Rich Text Editor Demo</h1>

	<!-- Mount your editor -->
	<RichTextEditor initialHTML={contentHTML} on:change={handleChange} />

	<!-- Show live HTML output below for testing -->
	<div class="mt-10 rounded-lg bg-black/30 p-4">
		<h2 class="mb-2 text-xl font-semibold">Live HTML Output</h2>
		<div class="break-words text-sm text-white/70">
			{@html contentHTML}
		</div>
	</div>
</div>
