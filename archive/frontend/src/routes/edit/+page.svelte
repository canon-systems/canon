<script lang="ts">
	// ------------------------------------------------------------
	// PURPOSE
	// /edit — a simple chooser page that lists ONLY your own submissions
	// (thanks to server-side RLS) and links to /edit/[id].
	// We DO NOT fetch in the browser; we only render $page.data from the server.
	// ------------------------------------------------------------

	// [1] The server loader gives us these values as "data".
	export let data: {
		user: { email?: string | null } | null; // verified user (never null here due to server guard)
		items: Array<{
			id: string;
			created_date: string;
			title: string;
			status: 'Processing' | 'Completed' | 'Failed';
			input_type: 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code' | null;
			last_checked_at: string | null;
			is_outdated: boolean;
		}>;
		loadError: string | null;
	};

	// [2] Simple flags for UI logic.
	const isAuthed = !!data.user; // server already enforced auth, so this is always true

	// Delete state
	let deletingId: string | null = null;
	let deleteError: string | null = null;
	let items = data.items;
	let openMenuId: string | null = null;
	let showDeleteModal: boolean = false;
	let itemToDelete: { id: string; title: string } | null = null;

	// Reactive check for items
	$: hasItems = items.length > 0;

	// Close menu when clicking outside
	import { onMount, onDestroy } from 'svelte';
	let menuRefs: Record<string, HTMLElement> = {};

	function toggleMenu(id: string, event: MouseEvent) {
		event.stopPropagation();
		openMenuId = openMenuId === id ? null : id;
	}

	function closeMenu() {
		openMenuId = null;
	}

	// Close menu on outside click
	function handleClickOutside(event: MouseEvent) {
		if (!openMenuId) return;
		const target = event.target as HTMLElement;
		const menu = menuRefs[openMenuId];
		const button = target.closest('button[title="More options"]');
		if (menu && !menu.contains(target) && !button) {
			closeMenu();
		}
	}

	let clickListener: ((e: MouseEvent) => void) | null = null;

	$: if (openMenuId) {
		// Add listener after menu opens
		setTimeout(() => {
			clickListener = handleClickOutside;
			document.addEventListener('click', clickListener);
		}, 0);
	} else if (clickListener) {
		document.removeEventListener('click', clickListener);
		clickListener = null;
	}

	onDestroy(() => {
		if (clickListener) {
			document.removeEventListener('click', clickListener);
		}
	});

	// View toggle state (persisted in localStorage)
	type ViewMode = 'tile' | 'row';
	let viewMode: ViewMode = 'row';

	// Load view preference from localStorage on mount
	import { Grid3x3, List, MoreVertical, RefreshCw, Clock, CheckCircle2, AlertCircle } from '@lucide/svelte';
	import { supabase } from '$lib/supabaseClient';
	import { invalidate } from '$app/navigation';

	onMount(() => {
		const saved = localStorage.getItem('edit-view-mode') as ViewMode | null;
		if (saved === 'tile' || saved === 'row') {
			viewMode = saved;
		}
	});

	function setViewMode(mode: ViewMode) {
		viewMode = mode;
		localStorage.setItem('edit-view-mode', mode);
	}

	// Open delete confirmation modal
	function openDeleteModal(item: { id: string; title: string }, event: MouseEvent) {
		event.stopPropagation();
		itemToDelete = item;
		showDeleteModal = true;
		closeMenu();
	}

	// Confirm and delete submission
	async function confirmDelete() {
		if (!itemToDelete) return;

		const idToDelete = itemToDelete.id;
		deletingId = idToDelete;
		deleteError = null;

		try {
			const { error } = await supabase.from('submissions').delete().eq('id', idToDelete);

			if (error) throw error;

			// Remove from local list
			items = items.filter((item) => item.id !== idToDelete);

			// Invalidate to refresh server data
			await invalidate('supabase:submissions');

			// Close modal
			showDeleteModal = false;
			itemToDelete = null;
		} catch (e) {
			deleteError = String(e);
			console.error('Delete failed:', e);
		} finally {
			deletingId = null;
		}
	}

	function cancelDelete() {
		showDeleteModal = false;
		itemToDelete = null;
	}

	// [3] Little formatter for the date/time.
	function fmt(iso: string) {
		const d = new Date(iso);
		return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
	}

	// Format relative time (e.g., "2 hours ago")
	function fmtRelative(iso: string | null): string {
		if (!iso) return 'Never checked';
		const d = new Date(iso);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
		if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
		return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
	}

	// Check if item is a GitHub repo (can be checked for updates)
	function isGitRepo(item: typeof data.items[0]): boolean {
		return item.input_type === 'github_repo' || item.input_type === 'github_repo_directory';
	}

	// Batch refresh state
	let refreshingAll = false;
	let refreshAllMsg = '';
	let refreshAllErr = '';

	// Refresh all outdated submissions
	async function refreshAllOutdated() {
		refreshingAll = true;
		refreshAllMsg = '';
		refreshAllErr = '';

		try {
			// Get the session token for the API call
			const { data: userData, error: userError } = await supabase.auth.getUser();
			if (userError || !userData?.user) {
				throw new Error('No authenticated user available');
			}
			const { data: sessionData } = await supabase.auth.getSession();
			const token = sessionData?.session?.access_token;

			if (!token) {
				throw new Error('No session token available');
			}

			// First check for updates
			const checkRes = await fetch('/api/docs/batch-check', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				}
			});

			const checkResult = await checkRes.json().catch(() => ({}));
			if (!checkRes.ok) {
				throw new Error(checkResult?.error || `Check failed (${checkRes.status})`);
			}

			const { outdated } = checkResult;

			if (outdated === 0) {
				refreshAllMsg = 'All documentation is up to date!';
				return;
			}

			// Then refresh outdated ones
			const refreshRes = await fetch('/api/docs/batch-refresh', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${token}`
				}
			});

			const refreshResult = await refreshRes.json().catch(() => ({}));
			if (!refreshRes.ok) {
				throw new Error(refreshResult?.error || `Refresh failed (${refreshRes.status})`);
			}

			const { refreshed, failed } = refreshResult;
			refreshAllMsg = `Refreshed ${refreshed} submission${refreshed === 1 ? '' : 's'}. ${failed > 0 ? `${failed} failed.` : ''}`;

			// Refresh the page data
			await invalidate('supabase:submissions');
			setTimeout(() => {
				window.location.reload();
			}, 2000);
		} catch (e) {
			refreshAllErr = String(e);
		} finally {
			refreshingAll = false;
		}
	}
</script>

{#if !isAuthed}
	<!-- This should not render because the server already redirected guests. -->
	<div class="flex min-h-screen items-center justify-center p-6">
		<div class="rounded-2xl border border-white/20 bg-white/10 p-6 text-center text-white">
			<p class="mb-4">You must be signed in to edit</p>
			<a href="/login" class="rounded bg-white/20 px-4 py-2 hover:bg-white/30">Go to Login</a>
		</div>
	</div>
{:else}
	<div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
		<div class="mx-auto max-w-4xl space-y-6">
			<!-- Header -->
			<header class="space-y-2">
				<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div class="flex-1">
						<h1 class="text-3xl font-bold text-white">Edit a Document</h1>
						<p class="text-white/70">
							Choose one of your submissions to open the editor. You will only see your own items
							due to Row Level Security.
						</p>
					</div>
					{#if hasItems}
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
							<button
								class="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20 disabled:opacity-60"
								on:click|preventDefault={refreshAllOutdated}
								disabled={refreshingAll}
								title="Check and refresh all outdated documentation"
							>
								{#if refreshingAll}
									<Loader2 class="h-4 w-4 animate-spin" />
									<span>Refreshing...</span>
								{:else}
									<RefreshCw class="h-4 w-4" />
									<span>Refresh All</span>
								{/if}
							</button>
							<div
								class="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-1 backdrop-blur-sm"
							>
							<button
								type="button"
								class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors {viewMode ===
								'tile'
									? 'bg-white/20 text-white'
									: 'text-white/70'}"
								on:click={() => setViewMode('tile')}
								title="Tile view"
							>
								<Grid3x3 class="h-4 w-4" />
								<span class="hidden sm:inline">Tile</span>
							</button>
							<button
								type="button"
								class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors {viewMode ===
								'row'
									? 'bg-white/20 text-white'
									: 'text-white/70'}"
								on:click={() => setViewMode('row')}
								title="Row view"
							>
								<List class="h-4 w-4" />
								<span class="hidden sm:inline">Row</span>
							</button>
							</div>
						</div>
					{/if}
				</div>
				{#if data.loadError}
					<div
						class="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200"
					>
						{data.loadError}
					</div>
				{/if}
			</header>

			<!-- Empty state -->
			{#if items.length === 0}
				<div class="rounded-2xl border border-white/20 bg-white/10 p-6 text-center text-white/80">
					<p class="mb-3">You do not have any submissions yet.</p>
					<a
						href="/submit"
						class="inline-block rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white hover:from-purple-600 hover:to-pink-600"
					>
						Create your first submission
					</a>
				</div>
			{:else}
				{#if viewMode === 'row'}
					<!-- Row/List View -->
					<ul
						class="divide-y divide-white/10 rounded-2xl border border-white/20 bg-white/10"
					>
						{#each items as item}
							<li
								class="relative flex flex-col gap-3 p-4 text-white md:flex-row md:items-start md:justify-between cursor-pointer transition-colors hover:bg-white/15"
								on:click={() => window.location.href = `/edit/${item.id}`}
								role="button"
								tabindex="0"
								on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										window.location.href = `/edit/${item.id}`;
									}
								}}
							>
								<div class="min-w-0 flex-1">
									<!-- Title and created time -->
									<div class="truncate text-lg font-semibold">{item.title}</div>
									<div class="text-sm text-white/60">{fmt(item.created_date)}</div>
									<!-- Show the UUID for clarity/auditing -->
									<div class="font-mono text-xs text-white/50">ID: {item.id}</div>
									<!-- Stale/Fresh status for GitHub repos -->
									{#if isGitRepo(item) && item.status?.toLowerCase() === 'completed'}
										<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
											{#if item.is_outdated}
												<span
													class="inline-flex items-center gap-1 rounded border border-orange-400/30 bg-orange-500/20 px-2 py-0.5 text-orange-200"
													title="Source files have changed"
												>
													<AlertCircle class="h-3 w-3" />
													Outdated
												</span>
											{:else}
												<span
													class="inline-flex items-center gap-1 rounded border border-green-400/30 bg-green-500/20 px-2 py-0.5 text-green-200"
													title="Up to date"
												>
													<CheckCircle2 class="h-3 w-3" />
													Fresh
												</span>
											{/if}
											{#if item.last_checked_at}
												<span class="inline-flex items-center gap-1 text-white/50" title="Last checked">
													<Clock class="h-3 w-3" />
													{fmtRelative(item.last_checked_at)}
												</span>
											{/if}
										</div>
									{/if}
								</div>

								<!-- Status and Actions Container -->
								<div class="flex shrink-0 items-center gap-3 md:flex-col md:items-end">
									<!-- Status -->
									<div class="shrink-0">
										{#if item.status?.toLowerCase() === 'completed'}
											<span
												class="inline-block rounded border border-green-400/30 bg-green-500/20 px-2 py-1 text-xs text-green-200"
											>
												completed
											</span>
										{:else if item.status?.toLowerCase() === 'failed'}
											<span
												class="inline-block rounded border border-red-400/30 bg-red-500/20 px-2 py-1 text-xs text-red-200"
											>
												failed
											</span>
										{:else}
											<span
												class="inline-block rounded border border-yellow-400/30 bg-yellow-500/20 px-2 py-1 text-xs text-yellow-200"
											>
												processing
											</span>
										{/if}
									</div>

									<!-- Actions -->
									<div class="relative shrink-0">
										<button
											type="button"
											class="rounded-lg border border-white/20 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
											on:click={(e) => {
												e.stopPropagation();
												toggleMenu(item.id, e);
											}}
											title="More options"
										>
											<MoreVertical class="h-4 w-4" />
										</button>
										{#if openMenuId === item.id}
											<div
												class="absolute right-0 top-full z-[100] mt-1 min-w-[160px] rounded-lg border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md"
												bind:this={menuRefs[item.id]}
												on:click|stopPropagation
											>
												<a
													href={`/edit/${item.id}`}
													class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
													on:click={closeMenu}
												>
													Open Editor
												</a>
												<button
													type="button"
													class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
													on:click={(e) => openDeleteModal(item, e)}
												>
													Delete
												</button>
											</div>
										{/if}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<!-- Tile/Grid View -->
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
						{#each items as item}
							<div
								class="flex flex-col rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md transition hover:bg-white/15 cursor-pointer"
								on:click={() => window.location.href = `/edit/${item.id}`}
								role="button"
								tabindex="0"
								on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										window.location.href = `/edit/${item.id}`;
									}
								}}
							>
								<div class="mb-3">
									<div class="mb-2 truncate text-lg font-semibold text-white">{item.title}</div>
									<div class="mb-1 text-sm text-white/60">{fmt(item.created_date)}</div>
									<div class="truncate font-mono text-xs text-white/50">ID: {item.id}</div>
									<!-- Stale/Fresh status for GitHub repos -->
									{#if isGitRepo(item) && item.status?.toLowerCase() === 'completed'}
										<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
											{#if item.is_outdated}
												<span
													class="inline-flex items-center gap-1 rounded border border-orange-400/30 bg-orange-500/20 px-2 py-0.5 text-orange-200"
													title="Source files have changed"
												>
													<AlertCircle class="h-3 w-3" />
													Outdated
												</span>
											{:else}
												<span
													class="inline-flex items-center gap-1 rounded border border-green-400/30 bg-green-500/20 px-2 py-0.5 text-green-200"
													title="Up to date"
												>
													<CheckCircle2 class="h-3 w-3" />
													Fresh
												</span>
											{/if}
											{#if item.last_checked_at}
												<span class="inline-flex items-center gap-1 text-white/50" title="Last checked">
													<Clock class="h-3 w-3" />
													{fmtRelative(item.last_checked_at)}
												</span>
											{/if}
										</div>
									{/if}
								</div>

								<div
									class="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-3"
								>
									<!-- Status -->
									<div>
										{#if item.status?.toLowerCase() === 'completed'}
											<span
												class="inline-block rounded border border-green-400/30 bg-green-500/20 px-2 py-1 text-xs text-green-200"
											>
												completed
											</span>
										{:else if item.status?.toLowerCase() === 'failed'}
											<span
												class="inline-block rounded border border-red-400/30 bg-red-500/20 px-2 py-1 text-xs text-red-200"
											>
												failed
											</span>
										{:else}
											<span
												class="inline-block rounded border border-yellow-400/30 bg-yellow-500/20 px-2 py-1 text-xs text-yellow-200"
											>
												processing
											</span>
										{/if}
									</div>

									<!-- Actions -->
									<div class="relative">
										<button
											type="button"
											class="rounded-lg border border-white/20 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
											on:click={(e) => {
												e.stopPropagation();
												toggleMenu(item.id, e);
											}}
											title="More options"
										>
											<MoreVertical class="h-4 w-4" />
										</button>
										{#if openMenuId === item.id}
											<div
												class="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-white/20 bg-black/90 p-1 shadow-lg backdrop-blur-md"
												bind:this={menuRefs[item.id]}
												on:click|stopPropagation
											>
												<a
													href={`/edit/${item.id}`}
													class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
													on:click={closeMenu}
												>
													Open Editor
												</a>
												<button
													type="button"
													class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
													on:click={(e) => openDeleteModal(item, e)}
												>
													Delete
												</button>
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Delete error message -->
				{#if deleteError}
					<div
						class="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200"
					>
						Error deleting document: {deleteError}
					</div>
				{/if}

				<!-- Refresh all messages -->
				{#if refreshAllMsg}
					<div
						class="mt-4 rounded-xl border border-green-400/30 bg-green-500/10 px-3 py-2 text-green-200"
					>
						{refreshAllMsg}
					</div>
				{/if}
				{#if refreshAllErr}
					<div
						class="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200"
					>
						Error refreshing: {refreshAllErr}
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && itemToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		on:click={cancelDelete}
		on:keydown={(e) => {
			if (e.key === 'Escape') cancelDelete();
		}}
	>
		<div
			class="w-full max-w-md rounded-2xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
			on:click|stopPropagation
			role="document"
		>
			<h2 class="mb-4 text-xl font-semibold text-white">Confirm Delete</h2>
			<p class="mb-6 text-white/80">
				Are you sure you want to delete <span class="font-semibold">"{itemToDelete.title}"</span>?
				This action cannot be undone.
			</p>
			<div class="flex items-center justify-end gap-3">
				<button
					type="button"
					class="rounded-xl border border-white/20 px-4 py-2 text-white/90 transition-colors hover:bg-white/10"
					on:click={cancelDelete}
					disabled={deletingId !== null}
				>
					Cancel
				</button>
				<button
					type="button"
					class="rounded-xl border border-red-400/30 bg-red-500/20 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
					on:click={confirmDelete}
					disabled={deletingId !== null}
				>
					{#if deletingId === itemToDelete.id}
						Deleting...
					{:else}
						Delete
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
