<script lang="ts">
	// ------------------------------------------------------------
	// PURPOSE
	// Show one submission, and allow the owner to edit title/markdown.
	// The UPDATE call will only succeed for the owner due to RLS.
	// We read the row from $page.data.submission which the SERVER loaded.
	// ------------------------------------------------------------

	// 1) Get the server-loaded row.
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
		};
	};

	// 2) Local editable copies of title and markdown.
	let title = data.submission.title;
	let markdown = data.submission.markdown;

	// 3) UI state for saves.
	let saving = false;
	let saveMsg = '';
	let saveErr = '';

	// 4) We still use the browser client for the UPDATE.
	//    RLS ensures only the owner can update this row.
	import { supabase } from '$lib/supabaseClient';
	import { onMount } from 'svelte';
	import { Loader2 } from '@lucide/svelte';

	// 5) Save handler: write title/markdown back to Supabase.
	async function saveChanges() {
		saveErr = '';
		saveMsg = '';
		saving = true;
		try {
			const { error } = await supabase
				.from('submissions')
				.update({
					title: title || 'Untitled',
					markdown,
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

	// 6) Nicety: show a warning if the doc is still "processing" or had an error.
	$: statusNotice =
		data.submission.status === 'processing'
			? 'Note: This submission is still processing.'
			: data.submission.error_message
				? `Last run failed: ${data.submission.error_message}`
				: '';
</script>

<!-- ------------------------------------------------------------
     MARKUP
     A simple, clean editor view for one submission.
     ------------------------------------------------------------ -->
<div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-4xl space-y-6">
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

		<!-- Markdown editor -->
		<label class="block">
			<div class="mb-1 text-sm text-white/70">Markdown</div>
			<textarea
				class="h-[50vh] w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-sm text-white placeholder-white/60 outline-none focus:border-white/40"
				bind:value={markdown}
				placeholder="# Your document..."
			></textarea>
		</label>

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

			<a
				href="/history"
				class="rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
			>
				Back to History
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
