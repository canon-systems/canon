<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Settings from '@lucide/svelte/icons/settings';
	import User from '@lucide/svelte/icons/user';
	import Link2 from '@lucide/svelte/icons/link-2';
	import Sliders from '@lucide/svelte/icons/sliders';
	import Mail from '@lucide/svelte/icons/mail';
	import { Check, X, Loader2, Github } from '@lucide/svelte';
	import Nango from '@nangohq/frontend';
	import IntegrationLogos from '$lib/components/IntegrationLogos.svelte';

	type Connection = {
		id: string;
		provider: string;
		connection_id: string;
		status: string;
		metadata: any;
		created_at: string;
		updated_at: string;
	};

	type TabId = 'profile' | 'integrations' | 'preferences';

	const tabs: Array<{ id: TabId; name: string; icon: any }> = [
		{ id: 'profile', name: 'Profile', icon: User },
		{ id: 'integrations', name: 'Integrations', icon: Link2 },
		{ id: 'preferences', name: 'Preferences', icon: Sliders }
	];

	// Get active tab from URL query param, default to 'profile'
	// Validate tab is one of the valid options
	let activeTab: TabId = 'profile';
	$: {
		const tabParam = $page.url.searchParams.get('tab');
		const validTabs: TabId[] = ['profile', 'integrations', 'preferences'];
		activeTab = (validTabs.includes(tabParam as TabId) ? tabParam : 'profile') as TabId;
	}

	function setActiveTab(tabId: TabId) {
		goto(`/settings?tab=${tabId}`, { replaceState: true, noScroll: true });
	}

	// Integrations state
	let connections: Connection[] = [];
	let loading = true;
	let connecting = false;
	let error = '';
	let success = '';

	// Check for URL params on mount (for OAuth callbacks)
	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('success') === 'true') {
			success = `Successfully connected to ${urlParams.get('provider') || 'service'}!`;
			// Clean URL but keep tab param
			const tab = urlParams.get('tab') || 'integrations';
			window.history.replaceState({}, '', `/settings?tab=${tab}`);
			// Auto-switch to integrations tab if not already there
			if (activeTab !== 'integrations') {
				setActiveTab('integrations');
			}
		}
		if (urlParams.get('error')) {
			error = decodeURIComponent(urlParams.get('error') || 'Unknown error');
			const tab = urlParams.get('tab') || 'integrations';
			window.history.replaceState({}, '', `/settings?tab=${tab}`);
			if (activeTab !== 'integrations') {
				setActiveTab('integrations');
			}
		}
		if (activeTab === 'integrations') {
			loadConnections();
		}
	});

	// Reload connections when switching to integrations tab
	$: if (activeTab === 'integrations' && connections.length === 0 && !loading) {
		loadConnections();
	}

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

	// Generic connect function for any provider
	async function connectToProvider(providerName: string) {
		connecting = true;
		error = '';
		success = '';

		try {
			// Step 1: Get Connect session token from backend
			const response = await fetch('/api/integrations/connect', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: providerName })
			});

			if (!response.ok) {
				const data = await response.json();
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
						connecting = false;
					} else if (event.type === 'connect') {
						const connectionId = event.payload?.connectionId;
						const providerConfigKey = event.payload?.providerConfigKey || provider;
						
						if (connectionId) {
							try {
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
								}
							} catch (saveErr) {
								console.error('Error saving connection:', saveErr);
							}
						}

						const providerDisplayName = getProviderDisplayName(providerName);
						success = `Successfully connected to ${providerDisplayName}!`;
						connecting = false;
						
						await loadConnections();
						
						setTimeout(() => {
							success = '';
						}, 5000);
					}
				}
			});

			connect.setSessionToken(sessionToken);
		} catch (err: any) {
			error = err.message || 'Failed to connect';
			console.error('Connection error:', err);
			connecting = false;
		}
	}

	async function connectToNotion() {
		await connectToProvider('notion');
	}

	async function connectToConfluence() {
		await connectToProvider('confluence');
	}

	async function connectToGoogleDocs() {
		await connectToProvider('google-docs');
	}

	async function connectToGitHub() {
		await connectToProvider('github');
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

			success = `Disconnected from ${getProviderDisplayName(provider)}`;
			await loadConnections();
		} catch (err: any) {
			error = err.message || 'Failed to disconnect';
		}
	}

	function getProviderDisplayName(provider: string) {
		if (provider === 'googledocs' || provider === 'google-docs') return 'Google Docs';
		if (provider === 'github') return 'GitHub';
		return provider.charAt(0).toUpperCase() + provider.slice(1);
	}

	function getProviderName(provider: string) {
		if (provider === 'googledocs') return 'Google Docs';
		if (provider === 'github') return 'GitHub';
		return provider.charAt(0).toUpperCase() + provider.slice(1);
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Reactive checks for connection status
	$: isNotionConnected = connections.some(c => c.provider === 'notion' && c.status === 'active');
	$: isConfluenceConnected = connections.some(c => c.provider === 'confluence' && c.status === 'active');
	$: isGoogleDocsConnected = connections.some(c => c.provider === 'googledocs' && c.status === 'active');
	$: isGitHubConnected = connections.some(c => c.provider === 'github' && c.status === 'active');

	$: user = $page.data.user;
</script>

<div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8">
		<div class="flex items-center gap-3 mb-2">
			<Settings class="h-8 w-8 text-white" />
			<h1 class="text-3xl font-bold text-white">Settings</h1>
		</div>
		<p class="text-white/70">
			Manage your account settings, integrations, and preferences.
		</p>
	</div>

	<!-- Tabs Navigation -->
	<div class="mb-8 border-b border-white/10">
		<nav class="flex gap-1" aria-label="Settings tabs">
			{#each tabs as tab}
				<button
					on:click={() => setActiveTab(tab.id)}
					class={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
						activeTab === tab.id
							? 'border-blue-500 text-white'
							: 'border-transparent text-white/60 hover:text-white hover:border-white/20'
					}`}
				>
					<svelte:component this={tab.icon} class="h-4 w-4" />
					{tab.name}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Tab Content -->
	<div class="mt-6">
		{#if activeTab === 'profile'}
			<!-- Profile Tab -->
			<div>
				<div class="mb-6">
					<h2 class="text-2xl font-semibold text-white mb-2">Profile</h2>
					<p class="text-white/70">Manage your account information</p>
				</div>

				<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
					<div class="space-y-6">
						<div class="flex items-center gap-4">
							<div class="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
								<User class="h-8 w-8 text-white/70" />
							</div>
							<div>
								<p class="text-lg font-semibold text-white">{user?.email || 'User'}</p>
								<p class="text-sm text-white/60">Account ID: {user?.id || 'N/A'}</p>
							</div>
						</div>

						<div class="space-y-4">
							<div>
								<label class="block text-sm font-medium text-white/80 mb-2">
									<Mail class="inline h-4 w-4 mr-2" />
									Email Address
								</label>
								<div class="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
									{user?.email || 'Not available'}
								</div>
							</div>
						</div>

						<div class="pt-4 border-t border-white/10">
							<p class="text-sm text-white/60">
								Profile management features coming soon. For now, your account information is managed through authentication.
							</p>
						</div>
					</div>
				</div>
			</div>

		{:else if activeTab === 'integrations'}
			<!-- Integrations Tab -->
			<div>
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
						<!-- GitHub Integration -->
						<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
							<div class="flex items-start justify-between mb-4">
								<div class="flex items-center gap-3">
									<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
										<Github class="h-7 w-7 text-white" />
									</div>
									<div>
										<h3 class="text-lg font-semibold text-white">GitHub</h3>
										<p class="text-sm text-white/60">Access your repositories and private repos</p>
										<p class="text-xs text-white/40 mt-1">Higher rate limits (5,000/hr vs 60/hr)</p>
									</div>
								</div>
								{#if isGitHubConnected}
									<span class="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
										<Check class="h-3 w-3" />
										Connected
									</span>
								{/if}
							</div>
							{#if isGitHubConnected}
								<button
									on:click={() => {
										const conn = connections.find(c => c.provider === 'github');
										if (conn) openDisconnectModal(conn.connection_id, 'github');
									}}
									class="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
								>
									Disconnect
								</button>
							{:else}
								<button
									on:click={connectToGitHub}
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
											Connect GitHub
										</span>
									{/if}
								</button>
							{/if}
						</div>

						<!-- Notion Integration -->
						<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
							<div class="flex items-start justify-between mb-4">
								<div class="flex items-center gap-3">
									<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
										<IntegrationLogos provider="notion" size={28} />
									</div>
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

						<!-- Confluence Integration -->
						<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
							<div class="flex items-start justify-between mb-4">
								<div class="flex items-center gap-3">
									<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
										<IntegrationLogos provider="confluence" size={28} />
									</div>
									<div>
										<h3 class="text-lg font-semibold text-white">Confluence</h3>
										<p class="text-sm text-white/60">Access and sync your Confluence pages</p>
									</div>
								</div>
								{#if isConfluenceConnected}
									<span class="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
										<Check class="h-3 w-3" />
										Connected
									</span>
								{/if}
							</div>
							{#if isConfluenceConnected}
								<button
									on:click={() => {
										const conn = connections.find(c => c.provider === 'confluence');
										if (conn) openDisconnectModal(conn.connection_id, 'confluence');
									}}
									class="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
								>
									Disconnect
								</button>
							{:else}
								<button
									on:click={connectToConfluence}
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
											Connect Confluence
										</span>
									{/if}
								</button>
							{/if}
						</div>

						<!-- Google Docs Integration -->
						<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
							<div class="flex items-start justify-between mb-4">
								<div class="flex items-center gap-3">
									<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
										<IntegrationLogos provider="google-docs" size={28} />
									</div>
									<div>
										<h3 class="text-lg font-semibold text-white">Google Docs</h3>
										<p class="text-sm text-white/60">Access and sync your Google Docs</p>
									</div>
								</div>
								{#if isGoogleDocsConnected}
									<span class="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
										<Check class="h-3 w-3" />
										Connected
									</span>
								{/if}
							</div>
							{#if isGoogleDocsConnected}
								<button
									on:click={() => {
										const conn = connections.find(c => c.provider === 'googledocs');
										if (conn) openDisconnectModal(conn.connection_id, 'googledocs');
									}}
									class="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
								>
									Disconnect
								</button>
							{:else}
								<button
									on:click={connectToGoogleDocs}
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
											Connect Google Docs
										</span>
									{/if}
								</button>
							{/if}
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
											<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
												{#if connection.provider === 'github'}
													<Github class="h-6 w-6 text-white" />
												{:else}
													<IntegrationLogos 
														provider={(connection.provider === 'googledocs' ? 'google-docs' : connection.provider) as 'notion' | 'slack' | 'confluence' | 'google-docs' | 'jira'} 
														size={24} 
													/>
												{/if}
											</div>
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

		{:else if activeTab === 'preferences'}
			<!-- Preferences Tab -->
			<div>
				<div class="mb-6">
					<h2 class="text-2xl font-semibold text-white mb-2">Preferences</h2>
					<p class="text-white/70">Customize your application preferences</p>
				</div>

				<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
					<div class="flex items-center justify-center py-12">
						<div class="text-center">
							<Sliders class="h-16 w-16 text-white/30 mx-auto mb-4" />
							<p class="text-white/60 mb-2">Preferences coming soon</p>
							<p class="text-sm text-white/40">
								Configure default LLM models, prompt settings, and other preferences here.
							</p>
						</div>
					</div>
				</div>
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
