import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

type GitHubAppConfig = {
	appId: number;
	privateKey: string;
	installationId?: number;
};

const installationCache = new Map<string, number>();
const tokenCache = new Map<number, { token: string; expiresAt: string }>();

function normalizePrivateKey(value: string): string {
	const trimmed = value.trim();
	const withNewlines = trimmed.replace(/\\n/g, '\n');
	if (withNewlines.includes('BEGIN') && withNewlines.includes('PRIVATE KEY')) {
		return withNewlines;
	}

	try {
		const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
		if (decoded.includes('BEGIN') && decoded.includes('PRIVATE KEY')) {
			return decoded;
		}
	} catch {
		// Fall through to newline-normalized value.
	}

	return withNewlines;
}

function getGitHubAppConfig(): GitHubAppConfig | null {
	const appIdRaw = process.env.GITHUB_APP_ID;
	const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
	const installationIdRaw = process.env.GITHUB_APP_INSTALLATION_ID;

	if (!appIdRaw || !privateKeyRaw) {
		return null;
	}

	const appId = Number(appIdRaw);
	if (!Number.isFinite(appId) || appId <= 0) {
		throw new Error('Invalid GITHUB_APP_ID. Expected a numeric app id.');
	}

	const privateKey = normalizePrivateKey(privateKeyRaw);
	if (!privateKey) {
		throw new Error('Invalid GITHUB_APP_PRIVATE_KEY. Expected a PEM or base64-encoded PEM.');
	}

	const installationId = installationIdRaw ? Number(installationIdRaw) : undefined;
	if (installationId !== undefined && (!Number.isFinite(installationId) || installationId <= 0)) {
		throw new Error('Invalid GITHUB_APP_INSTALLATION_ID. Expected a numeric installation id.');
	}

	return {
		appId,
		privateKey,
		installationId: installationIdRaw ? installationId : undefined
	};
}

function createAppOctokit(config: GitHubAppConfig): Octokit {
	return new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: config.appId,
			privateKey: config.privateKey
		}
	});
}

async function resolveInstallationId(
	appOctokit: Octokit,
	owner: string,
	repo: string
): Promise<number> {
	const cacheKey = `${owner}/${repo}`.toLowerCase();
	const cached = installationCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const { data } = await appOctokit.apps.getRepoInstallation({ owner, repo });
	installationCache.set(cacheKey, data.id);
	return data.id;
}

export function getGitHubAppOctokit(installationIdOverride?: number): Octokit {
	const config = getGitHubAppConfig();
	if (!config) {
		throw new Error('GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
	}

	const installationId = installationIdOverride ?? config.installationId;
	if (!installationId) {
		throw new Error('Missing GitHub App installation id. Set GITHUB_APP_INSTALLATION_ID.');
	}

	return new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: config.appId,
			privateKey: config.privateKey,
			installationId
		}
	});
}

export function getGitHubAppOctokitForApp(): Octokit {
	const config = getGitHubAppConfig();
	if (!config) {
		throw new Error('GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
	}

	return createAppOctokit(config);
}

export async function getGitHubAppOctokitForRepo(
	owner: string,
	repo: string,
	installationIdOverride?: number
): Promise<Octokit> {
	const config = getGitHubAppConfig();
	if (!config) {
		throw new Error('GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
	}

	const appOctokit = createAppOctokit(config);
	const installationId =
		installationIdOverride ??
		(await resolveInstallationId(appOctokit, owner, repo));

	return new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: config.appId,
			privateKey: config.privateKey,
			installationId
		}
	});
}

export async function getInstallationAccessToken(
	auth: ReturnType<typeof createAppAuth>,
	installationId: number
): Promise<{ token: string; expiresAt: string }> {
	const cached = tokenCache.get(installationId);
	if (cached) {
		const expiresAt = Date.parse(cached.expiresAt);
		if (!Number.isNaN(expiresAt) && Date.now() < expiresAt - 60_000) {
			return cached;
		}
	}

	const authResult = await auth({
		type: 'installation',
		installationId
	});

	const token = authResult.token;
	const expiresAt = authResult.expiresAt;
	if (!token || !expiresAt) {
		throw new Error('Failed to generate GitHub App installation access token.');
	}

	const entry = { token, expiresAt };
	tokenCache.set(installationId, entry);
	return entry;
}
