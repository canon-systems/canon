<script lang="ts">
	// ------------------------------------------------------------
	// /edit/[id] — Minimal Markdown editor for LLM output
	// - Loads the submission by UUID (id param)
	// - Lets user edit title + markdown
	// - Saves back to Supabase
	// - Shows UUID on screen for auditability
	// ------------------------------------------------------------

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabaseClient';
	import { Loader2 } from '@lucide/svelte';

	// Pull the UUID from the route param
	let id: string | undefined = '';
	$: id = $page.params.id;

	// UI state
	let loading = true;
	let saving = false;
	let errorMsg = '';
	let savedMsg = '';

	// Document fields
	let title = '';
	let markdown = '';

	// For "Revert" support
	let originalTitle = '';
	let originalMarkdown = '';

	// DOM handle to textarea for toolbar helpers
	let editorEl: HTMLTextAreaElement | null = null;

	onMount(async () => {
		try {
			const { data, error } = await supabase
				.from('submissions')
				.select('id,title,markdown')
				.eq('id', id)
				.single();
			if (error) throw new Error(error.message);

			title = data?.title || 'Untitled';
			markdown = data?.markdown || '';
			originalTitle = title;
			originalMarkdown = markdown;
		} catch (e) {
			errorMsg = String(e);
		} finally {
			loading = false;
		}
	});

	async function saveChanges() {
		saving = true;
		errorMsg = '';
		savedMsg = '';
		try {
			const { error } = await supabase.from('submissions').update({ title, markdown }).eq('id', id);
			if (error) throw new Error(error.message);
			originalTitle = title;
			originalMarkdown = markdown;
			savedMsg = 'Saved ✓';
			setTimeout(() => (savedMsg = ''), 1500);
		} catch (e) {
			errorMsg = String(e);
		} finally {
			saving = false;
		}
	}

	function revert() {
		title = originalTitle;
		markdown = originalMarkdown;
	}

	// -------- toolbar helpers (no deps) --------
	function wrapSelection(before: string, after = before) {
		if (!editorEl) return;
		const el = editorEl;
		const start = el.selectionStart ?? 0;
		const end = el.selectionEnd ?? 0;
		const sel = markdown.slice(start, end);
		const next = markdown.slice(0, start) + before + sel + after + markdown.slice(end);
		markdown = next;
		queueMicrotask(() => {
			const pos = start + before.length + sel.length + after.length;
			el.focus();
			el.setSelectionRange(pos, pos);
		});
	}
	function linePrefix(prefix: string) {
		if (!editorEl) return;
		const el = editorEl;
		const start = el.selectionStart ?? 0;
		const end = el.selectionEnd ?? 0;

		// expand to line boundaries
		const left = markdown.lastIndexOf('\n', start - 1) + 1;
		const right = markdown.indexOf('\n', end);
		const selEnd = right === -1 ? markdown.length : right;

		const block = markdown
			.slice(left, selEnd)
			.split('\n')
			.map((l) => (l.startsWith(prefix) ? l : prefix + l))
			.join('\n');

		markdown = markdown.slice(0, left) + block + markdown.slice(selEnd);
		queueMicrotask(() => {
			el.focus();
			el.setSelectionRange(left, left + block.length);
		});
	}
	function insertLink() {
		if (!editorEl) return;
		const url = prompt('URL to link to:');
		if (!url) return;
		const el = editorEl;
		const start = el.selectionStart ?? 0;
		const end = el.selectionEnd ?? 0;
		const sel = markdown.slice(start, end) || 'link text';
		const md = `[${sel}](${url})`;
		markdown = markdown.slice(0, start) + md + markdown.slice(end);
		queueMicrotask(() => {
			const pos = start + md.length;
			el.focus();
			el.setSelectionRange(pos, pos);
		});
	}
</script>

<div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-3xl">
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-3xl font-bold text-white">Edit Document</h1>
			<a
				href="/history"
				class="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
				>Back to History</a
			>
		</div>

		<!-- show the UUID for auditability -->
		<div class="mb-4 text-sm text-white/60">ID: <span class="font-mono">{id}</span></div>

		{#if loading}
			<div class="rounded-xl border border-white/20 bg-white/10 p-4 text-white/80">
				<Loader2 class="mr-2 inline h-4 w-4 animate-spin" /> Loading document…
			</div>
		{:else}
			{#if errorMsg}
				<div class="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
					{errorMsg}
				</div>
			{/if}

			<label class="mb-4 block">
				<div class="mb-1 text-sm text-white/70">Title</div>
				<input
					class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
					bind:value={title}
					placeholder="Untitled"
				/>
			</label>

			<!-- Toolbar -->
			<div class="mb-2 flex flex-wrap gap-2">
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => linePrefix('# ')}>H1</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => linePrefix('## ')}>H2</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => wrapSelection('**')}>Bold</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => wrapSelection('_')}>Italic</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => wrapSelection('`')}>Code</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => linePrefix('- ')}>• List</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => linePrefix('1. ')}>1. List</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={insertLink}>Link</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => linePrefix('> ')}>Quote</button
				>
				<button
					class="rounded border border-white/20 px-2 py-1 text-sm text-white hover:bg-white/10"
					on:click={() => (markdown += '\n\n---\n\n')}>HR</button
				>
			</div>

			<!-- Editor -->
			<textarea
				bind:this={editorEl}
				bind:value={markdown}
				class="h-[55vh] w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/40"
				placeholder="# Start writing…"
			></textarea>

			<!-- Footer actions -->
			<div class="mt-4 flex items-center gap-3">
				<button
					class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white shadow hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
					on:click|preventDefault={saveChanges}
					disabled={saving}
				>
					{#if saving}
						<Loader2 class="h-4 w-4 animate-spin" />
						<span>Saving…</span>
					{:else}
						<span>Save changes</span>
					{/if}
				</button>

				<button
					class="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
					on:click={revert}
				>
					Revert
				</button>

				{#if savedMsg}
					<div class="text-sm text-white/70">{savedMsg}</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
