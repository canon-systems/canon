<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { Link2, Check, X, Loader2, FileText, ExternalLink } from '@lucide/svelte';
	import Nango from '@nangohq/frontend';

	type Connection = {
		id: string;
		provider: string;
		connection_id: string;
		status: string;
		metadata: any;
		created_at: string;
		updated_at: string;
	};

	let connections: Connection[] = [];
	let loading = true;
	let connecting = false;
	let error = '';
	let success = '';

	// Check for URL params
	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('success') === 'true') {
			success = `Successfully connected to ${urlParams.get('provider') || 'service'}!`;
			// Clean URL
			window.history.replaceState({}, '', '/integrations');
		}
		if (urlParams.get('error')) {
			error = decodeURIComponent(urlParams.get('error') || 'Unknown error');
			window.history.replaceState({}, '', '/integrations');
		}
		loadConnections();
	});

	async function loadConnections() {
		loading = true;
		try {
			const response = await fetch('/api/integrations/list');
			if (!response.ok) throw new Error('Failed to load connections');
			const data = await response.json();
			connections = data.connections || [];
		} catch (err: any) {
			error = err.message || 'Failed to load connections';
		} finally {
			loading = false;
		}
	}

	async function connectToNotion() {
		connecting = true;
		error = '';
		success = '';

		try {
			// Step 1: Get Connect session token from backend
			const response = await fetch('/api/integrations/connect', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: 'notion' })
			});

			if (!response.ok) {
				const data = await response.json();
				// Show detailed error message
				const errorMsg = data.detail || data.error || 'Failed to initiate connection';
				console.error('Connection error details:', data);
				throw new Error(errorMsg);
			}

			const { sessionToken, provider } = await response.json();
			
			if (!sessionToken) {
				throw new Error('No session token returned');
			}

			// Step 2: Initialize Nango frontend SDK and open Connect UI
			const nango = new Nango();
			const connect = nango.openConnectUI({
				onEvent: async (event) => {
					if (event.type === 'close') {
						// User closed the modal
						connecting = false;
					} else if (event.type === 'connect') {
						// Connection successful - save to Supabase
						const connectionId = event.payload?.connectionId;
						const providerConfigKey = event.payload?.providerConfigKey || provider;
						
						if (connectionId) {
							try {
								// Save the connection to Supabase
								const saveResponse = await fetch('/api/integrations/save', {
									method: 'POST',
									headers: { 'content-type': 'application/json' },
									body: JSON.stringify({
										connectionId,
										provider: providerConfigKey
									})
								});

								if (!saveResponse.ok) {
									const errorData = await saveResponse.json();
									console.error('Failed to save connection:', errorData);
									// Still show success since Nango connection worked
								}
							} catch (saveErr) {
								console.error('Error saving connection:', saveErr);
								// Still show success since Nango connection worked
							}
						}

						// Show success message and refresh connections
						success = 'Successfully connected to Notion!';
						connecting = false;
						
						// Refresh connections list to show the new connection
						await loadConnections();
						
						// Clear success message after 5 seconds
						setTimeout(() => {
							success = '';
						}, 5000);
					}
				}
			});

			// Set the session token to start the auth flow
			connect.setSessionToken(sessionToken);
		} catch (err: any) {
			error = err.message || 'Failed to connect';
			console.error('Connection error:', err);
			connecting = false;
		}
	}

	// Disconnect modal state
	let disconnectModalOpen = false;
	let connectionToDisconnect: { connectionId: string; provider: string } | null = null;

	function openDisconnectModal(connectionId: string, provider: string) {
		connectionToDisconnect = { connectionId, provider };
		disconnectModalOpen = true;
	}

	function closeDisconnectModal() {
		disconnectModalOpen = false;
		connectionToDisconnect = null;
	}

	async function disconnect(connectionId: string, provider: string) {
		try {
			const response = await fetch('/api/integrations/disconnect', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ connectionId, provider })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to disconnect');
			}

			success = `Disconnected from ${provider}`;
			await loadConnections();
		} catch (err: any) {
			error = err.message || 'Failed to disconnect';
		}
	}

	function getProviderIcon(provider: string) {
		switch (provider) {
			case 'notion':
				return '📝';
			case 'slack':
				return '💬';
			case 'jira':
				return '🎯';
			case 'confluence':
				return '📚';
			default:
				return '🔗';
		}
	}

	function getProviderName(provider: string) {
		return provider.charAt(0).toUpperCase() + provider.slice(1);
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Reactive check for Notion connection status - updates when connections change
	$: isNotionConnected = connections.some(c => c.provider === 'notion' && c.status === 'active');
</script>

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-white mb-2">Integrations</h1>
		<p class="text-white/70">
			Connect your knowledge management platforms to sync and access your content.
		</p>
	</div>

	<!-- Success/Error Messages -->
	{#if success}
		<div class="mb-6 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-200">
			<div class="flex items-center gap-2">
				<Check class="h-5 w-5" />
				<p>{success}</p>
			</div>
		</div>
	{/if}

	{#if error}
		<div class="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
			<p class="font-medium">Error</p>
			<p class="text-sm">{error}</p>
		</div>
	{/if}

	<!-- Available Integrations -->
	<div class="mb-8">
		<h2 class="text-xl font-semibold text-white mb-4">Available Integrations</h2>
		<div class="grid gap-4 md:grid-cols-2">
			<!-- Notion Integration -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
				<div class="flex items-start justify-between mb-4">
					<div class="flex items-center gap-3">
						<span class="text-3xl">📝</span>
						<div>
							<h3 class="text-lg font-semibold text-white">Notion</h3>
							<p class="text-sm text-white/60">Access and sync your Notion pages</p>
						</div>
					</div>
					{#if isNotionConnected}
						<span class="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
							<Check class="h-3 w-3" />
							Connected
						</span>
					{/if}
				</div>
				{#if isNotionConnected}
					<button
						on:click={() => {
							const conn = connections.find(c => c.provider === 'notion');
							if (conn) openDisconnectModal(conn.connection_id, 'notion');
						}}
						class="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
					>
						Disconnect
					</button>
				{:else}
					<button
						on:click={connectToNotion}
						disabled={connecting}
						class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if connecting}
							<span class="flex items-center justify-center gap-2">
								<Loader2 class="h-4 w-4 animate-spin" />
								Connecting...
							</span>
						{:else}
							<span class="flex items-center justify-center gap-2">
								<Link2 class="h-4 w-4" />
								Connect Notion
							</span>
						{/if}
					</button>
				{/if}
			</div>

			<!-- Placeholder for future integrations -->
			<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm opacity-50">
				<div class="flex items-start justify-between mb-4">
					<div class="flex items-center gap-3">
						<span class="text-3xl">💬</span>
						<div>
							<h3 class="text-lg font-semibold text-white">Slack</h3>
							<p class="text-sm text-white/60">Coming soon</p>
						</div>
					</div>
				</div>
				<button
					disabled
					class="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/40 cursor-not-allowed"
				>
					Coming Soon
				</button>
			</div>
		</div>
	</div>

	<!-- Active Connections -->
	<div>
		<h2 class="text-xl font-semibold text-white mb-4">Active Connections</h2>
		{#if loading}
			<div class="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
				<Loader2 class="h-8 w-8 animate-spin text-white/50 mx-auto mb-2" />
				<p class="text-white/60">Loading connections...</p>
			</div>
		{:else if connections.length === 0}
			<div class="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
				<Link2 class="h-12 w-12 text-white/30 mx-auto mb-4" />
				<p class="text-white/60">No active connections</p>
				<p class="text-sm text-white/40 mt-2">Connect an integration above to get started</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each connections as connection}
					<div class="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class="text-2xl">{getProviderIcon(connection.provider)}</span>
								<div>
									<p class="font-medium text-white">{getProviderName(connection.provider)}</p>
									<p class="text-xs text-white/60">
										Connected {formatDate(connection.created_at)}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2">
								{#if connection.status === 'active'}
									<span class="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-300">
										<Check class="h-3 w-3" />
										Active
									</span>
								{/if}
								<button
									on:click={() => openDisconnectModal(connection.connection_id, connection.provider)}
									class="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/20"
								>
									<X class="h-4 w-4" />
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Disconnect Confirmation Modal -->
{#if disconnectModalOpen && connectionToDisconnect}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		on:click={closeDisconnectModal}
		on:keydown={(e) => e.key === 'Escape' && closeDisconnectModal()}
		role="dialog"
		aria-modal="true"
	>
		<div
			class="w-full max-w-md rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
			on:click|stopPropagation
		>
			<h2 class="mb-4 text-xl font-semibold text-white">Disconnect Integration</h2>
			<p class="mb-6 text-white/70">
				Are you sure you want to disconnect from <span class="font-semibold text-white">
					{getProviderName(connectionToDisconnect.provider)}
				</span>? This action cannot be undone.
			</p>
			<div class="flex justify-end gap-3">
				<button
					class="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
					on:click={closeDisconnectModal}
				>
					Cancel
				</button>
				<button
					class="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/20"
					on:click={async () => {
						if (connectionToDisconnect) {
							await disconnect(connectionToDisconnect.connectionId, connectionToDisconnect.provider);
							closeDisconnectModal();
						}
					}}
				>
					Disconnect
				</button>
			</div>
		</div>
	</div>
{/if}

