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
			status: 'processing' | 'completed' | 'failed';
		}>;
		loadError: string | null;
	};

	// [2] Simple flags for UI logic.
	const isAuthed = !!data.user; // server already enforced auth, so this is always true
	const hasItems = data.items.length > 0;

	// [3] Little formatter for the date/time.
	function fmt(iso: string) {
		const d = new Date(iso);
		return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
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
				<h1 class="text-3xl font-bold text-white">Edit a Document</h1>
				<p class="text-white/70">
					Choose one of your submissions to open the editor. You will only see your own items due to
					Row Level Security.
				</p>
				{#if data.loadError}
					<div
						class="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200"
					>
						{data.loadError}
					</div>
				{/if}
			</header>

			<!-- Empty state -->
			{#if !hasItems}
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
				<!-- List of submissions that belong to the current user -->
				<ul
					class="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/20 bg-white/10"
				>
					{#each data.items as item}
						<li
							class="flex flex-col gap-2 p-4 text-white md:flex-row md:items-center md:justify-between"
						>
							<div class="min-w-0">
								<!-- Title and created time -->
								<div class="truncate text-lg font-semibold">{item.title}</div>
								<div class="text-sm text-white/60">{fmt(item.created_date)}</div>
								<!-- Show the UUID for clarity/auditing -->
								<div class="font-mono text-xs text-white/50">ID: {item.id}</div>
							</div>

							<!-- Status -->
							<div class="mt-2 md:mt-0">
								{#if item.status === 'completed'}
									<span
										class="inline-block rounded border border-green-400/30 bg-green-500/20 px-2 py-1 text-xs text-green-200"
									>
										completed
									</span>
								{:else if item.status === 'failed'}
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

							<!-- Open editor -->
							<div class="mt-2 md:mt-0">
								<a
									href={`/edit/${item.id}`}
									class="inline-block rounded-xl border border-white/20 px-4 py-2 text-white/90 hover:bg-white/10"
								>
									Open Editor
								</a>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
