<script lang="ts">
	// ------------------------------------------------------------
	// /edit  — "landing" for the editor
	// Purpose:
	//   - Allow a permanent Edit tab in the nav
	//   - If `?id=<uuid>` present, redirect to /edit/<uuid>
	//   - Otherwise, offer:
	//       * an input to paste a UUID and open it
	//       * a recent documents list from Supabase (click → edit)
	// ------------------------------------------------------------

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabaseClient';

	// Simple state for the input box
	let pastedId = '';

	// Recent docs state
	type Row = {
		id: string; // uuid
		title: string | null; // doc title
		created_at: string; // ISO timestamp
		status: 'completed' | 'failed' | 'processing' | null;
	};
	let recent: Row[] = [];
	let loading = true;
	let errorMsg = '';

	// If an id is present in the query string (?id=...), jump straight to /edit/[id]
	onMount(async () => {
		const id = $page.url.searchParams.get('id');
		if (id) {
			// Quick client-side redirect to the editor page
			goto(`/edit/${id}`);
			return;
		}

		// Otherwise, load some recent documents so the user can pick one.
		try {
			const { data, error } = await supabase
				.from('submissions')
				.select('id, title, created_at, status')
				.order('created_at', { ascending: false })
				.limit(12);

			if (error) throw new Error(error.message);
			recent = (data ?? []) as Row[];
		} catch (e) {
			errorMsg = String(e);
		} finally {
			loading = false;
		}
	});

	// Handler when the user pastes a UUID and clicks "Open"
	function openById() {
		const id = (pastedId || '').trim();
		if (!id) {
			alert('Please paste a document ID (UUID).');
			return;
		}
		goto(`/edit/${id}`);
	}
</script>

<!-- Page layout -->
<div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-3xl">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="mb-2 text-3xl font-bold text-white">Edit a Document</h1>
			<p class="text-white/70">
				Paste a document ID to edit, or pick from your recent documents below.
			</p>
		</div>

		<!-- UUID open box -->
		<div class="mb-8 rounded-2xl border border-white/20 bg-white/10 p-4">
			<label class="block">
				<div class="mb-1 text-sm text-white/70">Document ID (UUID)</div>
				<input
					class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
					placeholder="e.g. 8f6f3f9a-3f65-4d6a-9dd4-3a31b3e2b9a1"
					bind:value={pastedId}
					on:keydown={(e) => e.key === 'Enter' && openById()}
				/>
			</label>
			<div class="mt-3">
				<button
					class="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-white hover:from-purple-600 hover:to-pink-600"
					on:click={openById}
				>
					Open
				</button>
				<a
					href="/history"
					class="ml-3 rounded-xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
				>
					Go to History
				</a>
			</div>
		</div>

		<!-- Recent list -->
		<div class="rounded-2xl border border-white/20 bg-white/10 p-4">
			<div class="mb-3 flex items-center justify-between">
				<div class="text-sm text-white/70">Recent documents</div>
				<a href="/history" class="underline/50 text-sm text-white hover:underline">See all</a>
			</div>

			{#if loading}
				<div class="space-y-2">
					<div class="h-4 rounded bg-white/10"></div>
					<div class="h-4 w-2/3 rounded bg-white/10"></div>
					<div class="h-4 w-1/3 rounded bg-white/10"></div>
				</div>
			{:else if errorMsg}
				<div class="rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
					{errorMsg}
				</div>
			{:else if recent.length === 0}
				<div class="text-white/70">No documents yet. Submit something first.</div>
			{:else}
				<ul class="divide-y divide-white/10">
					{#each recent as r}
						<li class="flex items-center gap-3 py-2">
							<div class="min-w-0">
								<div class="truncate text-white">
									{r.title || 'Untitled'} <span class="text-white/50">• {r.id}</span>
								</div>
								<div class="text-xs text-white/60">
									{new Date(r.created_at).toLocaleString()} • {r.status || 'unknown'}
								</div>
							</div>
							<a
								href={`/edit/${r.id}`}
								class="ml-auto rounded border border-white/20 px-3 py-1 text-sm text-white hover:bg-white/10"
								title="Open in editor"
							>
								Edit
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>
