import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { detectTools } from '../architecture/detectTools';
import { getCachedBranch, getCachedTree, getCachedFileShas } from '../github/cachedOctokit';
import { fetchFilesViaZip, fetchFilesSmart } from '../github/batchFetch';
import { getRateLimitStatus, hasQuotaFor } from '../github/rateLimiter';

const RELEVANT_EXTENSIONS = new Set([
	'.py',
	'.js',
	'.ts',
	'.tsx',
	'.jsx',
	'.java',
	'.go',
	'.rs',
	'.rb',
	'.php',
	'.cpp',
	'.c',
	'.h',
	'.hpp',
	'.cs',
	'.swift',
	'.kt',
	'.scala',
	'.clj',
	'.sh',
	'.bash',
	'.zsh',
	'.fish',
	'.json',
	'.yaml',
	'.yml',
	'.toml',
	'.ini',
	'.xml',
	'.html',
	'.css',
	'.scss',
	'.sass',
	'.less',
	'.md',
	'.txt',
	'.rst',
	'.dockerfile',
	'.makefile',
	'.cmake',
	'.gradle',
	'.maven',
	'package.json',
	'requirements.txt',
	'Pipfile',
	'Cargo.toml',
	'go.mod',
	'pom.xml',
	'build.gradle',
	'composer.json',
	'.yml',
]);

// Files to exclude (auto-generated, lock files, or too large for LLM processing)
const EXCLUDED_FILES = new Set([
	'package-lock.json',
	'yarn.lock',
	'pnpm-lock.yaml',
	'composer.lock',
	'Gemfile.lock',
	'Cargo.lock',
	'poetry.lock',
	'Pipfile.lock',
	'shrinkwrap.json',
	'npm-shrinkwrap.json',
	'bun.lockb',
]);

// Patterns for files to exclude (will be checked against the full path)
const EXCLUDED_PATTERNS = [
	/node_modules\//i,
	/vendor\//i,
	/\.min\.(js|css)$/i,
	/\.bundle\.(js|css)$/i,
	/dist\/.*\.(js|css)$/i,
	/build\/.*\.(js|css)$/i,
];

type AnalyzeRepositoryParams = {
	supabase: SupabaseClient;
	userId: string;
	repoUrl: string;
	branch?: string;
	subdir?: string | null;
	filters?: Record<string, unknown> | null;
	// New options for optimization
	useZipFetch?: boolean; // Force ZIP fetch (default: auto-decide based on file count)
	maxFiles?: number; // Maximum files to fetch (default: 500)
};

type FileEntry = {
	path: string;
	content: string;
	size?: number;
};

export type AnalyzeRepositoryResult = {
	success: boolean;
	message: string;
	files: Array<{ path: string; size: number; hash: string | null; language: string | null }>;
	languages: string[];
	detection_result: ReturnType<typeof detectTools>;
	snapshot: {
		commitSha: string;
		fileShas: Record<string, string | null>;
		createdAt: string;
	};
	rawFiles?: FileEntry[];
};

export async function analyzeRepository({
	supabase,
	userId,
	repoUrl,
	branch,
	subdir,
	useZipFetch,
	maxFiles = 500,
}: AnalyzeRepositoryParams): Promise<AnalyzeRepositoryResult> {
	if (!repoUrl) {
		throw new Error('repoUrl is required for repository analysis');
	}

	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid GitHub URL: ${repoUrl}`);
	}

	const owner = parsed.owner;
	const repo = parsed.repo;
	const overrideBranch = branch?.trim() || parsed.branch || 'main';

	const octokit = await getUserOctokit(supabase, userId);

	// Use cached branch lookup (saves API calls on repeated requests)
	const branchData = await getCachedBranch(octokit, owner, repo, overrideBranch);
	const commitSha = branchData.commit.sha;

	// Use cached tree lookup (returns all file SHAs in one call)
	const treeData = await getCachedTree(octokit, owner, repo, commitSha);
	const treeItems = (treeData.tree || []).filter((item) => item.type === 'blob');

	// Build tree map from tree data (no additional API calls needed)
	const treeMap = new Map<string, { path: string; sha: string; size: number }>();
	treeItems.forEach((item) => {
		if (item.path && item.sha) {
			treeMap.set(item.path, {
				path: item.path,
				sha: item.sha,
				size: Number(item.size ?? 0)
			});
		}
	});

	// Filter to relevant files (exclude lock files and auto-generated files)
	const relevantFiles = Array.from(treeMap.values()).filter((item) => {
		if (!item.path) return false;
		const lowerPath = item.path.toLowerCase();
		const fileName = item.path.split('/').pop() || '';
		
		// Check if file is in exclusion list
		if (EXCLUDED_FILES.has(fileName)) {
			return false;
		}
		
		// Check if file matches any exclusion pattern
		if (EXCLUDED_PATTERNS.some(pattern => pattern.test(item.path))) {
			return false;
		}
		
		const matched = Array.from(RELEVANT_EXTENSIONS).some((ext) =>
			lowerPath.endsWith(ext) || lowerPath === ext
		);
		return matched;
	});

	// Apply subdir filter
	const bySubdir = subdir ? subdir.replace(/^\/+|\/+$/g, '') : '';
	const finalFiles = bySubdir
		? relevantFiles.filter((item) => item.path === bySubdir || item.path.startsWith(`${bySubdir}/`))
		: relevantFiles;

	const limitedFiles = finalFiles.slice(0, maxFiles);
	const filePaths = limitedFiles.map(f => f.path);

	// Decide whether to use ZIP or individual fetches
	// ZIP is more efficient for large numbers of files (1 API call vs N)
	// But for small numbers of files, individual calls may be faster
	const shouldUseZip = useZipFetch ?? (
		filePaths.length >= 10 || // More than 10 files
		!hasQuotaFor(filePaths.length + 5) // Not enough quota for individual calls
	);

	let files: FileEntry[] = [];

	if (shouldUseZip) {
		// Use ZIP download (1 API call regardless of file count)
		console.log(`[analyzeRepository] Using ZIP fetch for ${filePaths.length} files`);

		const zipFiles = await fetchFilesViaZip(
			octokit,
			owner,
			repo,
			commitSha,
			filePaths,
			{ maxFileSize: 1024 * 1024, maxFiles }
		);

		files = zipFiles.map(f => ({
			path: f.path,
			content: f.content,
			size: f.size,
		}));
	} else {
		// Use smart fetch (individual calls with caching for small batches)
		console.log(`[analyzeRepository] Using smart fetch for ${filePaths.length} files`);

		const fetchedFiles = await fetchFilesSmart(
			octokit,
			owner,
			repo,
			commitSha,
			filePaths,
			{ maxFileSize: 1024 * 1024 }
		);

		files = fetchedFiles.map(f => ({
			path: f.path,
			content: f.content,
			size: f.size,
		}));
	}

	// Log rate limit status for monitoring
	const rateLimitStatus = getRateLimitStatus();
	console.log(
		`[analyzeRepository] Completed. Rate limit: ${rateLimitStatus.remaining}/${rateLimitStatus.limit} ` +
		`(${rateLimitStatus.percentUsed}% used)`
	);

	if (files.length === 0) {
		throw new Error('No files found in repository for analysis');
	}

	const detectionResult = detectTools(files);

	// Build snapshot from tree data (no additional API calls needed)
	const snapshot = {
		commitSha,
		fileShas: Object.fromEntries(
			Array.from(treeMap.entries()).map(([path, item]) => [path, item.sha || null])
		),
		createdAt: new Date().toISOString(),
	};

	const fileInfo = files.map((file) => ({
		path: file.path,
		size: file.size ?? file.content.length,
		hash: snapshot.fileShas[file.path] || null,
		language: detectLanguageFromPath(file.path),
	}));

	const languages = detectLanguages(files);

	return {
		success: true,
		message: `Repo analyzed: ${files.length} files detected`,
		files: fileInfo,
		languages,
		detection_result: detectionResult,
		snapshot,
		rawFiles: files,
	};
}

function detectLanguages(files: FileEntry[]): string[] {
	const detected = new Set<string>();
	for (const file of files) {
		const lang = detectLanguageFromPath(file.path);
		if (lang) {
			detected.add(lang);
		}
	}
	return Array.from(detected).sort();
}

function detectLanguageFromPath(path: string): string | null {
	if (!path || path.indexOf('.') === -1) {
		return null;
	}

	const ext = path.split('.').pop()?.toLowerCase();
	const map: Record<string, string> = {
		py: 'Python',
		js: 'JavaScript',
		ts: 'TypeScript',
		tsx: 'TypeScript',
		jsx: 'JavaScript',
		java: 'Java',
		go: 'Go',
		rs: 'Rust',
		rb: 'Ruby',
		php: 'PHP',
		cpp: 'C++',
		c: 'C',
		h: 'C/C++ Header',
		hpp: 'C++',
		cs: 'C#',
		swift: 'Swift',
		kt: 'Kotlin',
		scala: 'Scala',
		clj: 'Clojure',
		sh: 'Shell',
		bash: 'Bash',
		zsh: 'Zsh',
		fish: 'Fish',
		json: 'JSON',
		yaml: 'YAML',
		yml: 'YAML',
		toml: 'TOML',
		xml: 'XML',
		html: 'HTML',
		css: 'CSS',
		scss: 'SCSS',
		sass: 'SASS',
		less: 'Less',
		md: 'Markdown',
		txt: 'Text',
		rst: 'reStructuredText',
		dockerfile: 'Dockerfile',
	};

	if (!ext) {
		return null;
	}

	return map[ext] || ext.toUpperCase();
}
