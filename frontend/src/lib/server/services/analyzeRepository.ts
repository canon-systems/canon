import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { detectTools } from '../architecture/detectTools';

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

type AnalyzeRepositoryParams = {
	supabase: SupabaseClient;
	userId: string;
	repoUrl: string;
	branch?: string;
	subdir?: string | null;
	filters?: Record<string, unknown> | null;
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
	filters,
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

	const { data: branchData } = await octokit.repos.getBranch({
		owner,
		repo,
		branch: overrideBranch,
	});

	const commitSha = branchData.commit.sha;

	const treeResponse = await octokit.git.getTree({
		owner,
		repo,
		tree_sha: commitSha,
		recursive: '1',
	});

	const treeItems = (treeResponse.data.tree || []).filter((item) => item.type === 'blob');
	const treeMap = new Map<string, { path: string; sha: string; size?: number }>();
	treeItems.forEach((item) => {
		if (item.path) {
			treeMap.set(item.path, { path: item.path, sha: item.sha, size: Number(item.size ?? 0) });
		}
	});

	const relevantFiles = Array.from(treeMap.values()).filter((item) => {
		if (!item.path) return false;
		const lowerPath = item.path.toLowerCase();
		const matched = Array.from(RELEVANT_EXTENSIONS).some((ext) =>
			lowerPath.endsWith(ext) || lowerPath === ext
		);
		return matched;
	});

	const bySubdir = subdir ? subdir.replace(/^\/+|\/+$/g, '') : '';
	const finalFiles = bySubdir
		? relevantFiles.filter((item) => item.path === bySubdir || item.path.startsWith(`${bySubdir}/`))
		: relevantFiles;

	const limitedFiles = finalFiles.slice(0, 500);

	const files: FileEntry[] = [];
	for (const file of limitedFiles) {
		try {
			const { data: fileData } = await octokit.repos.getContent({
				owner,
				repo,
				path: file.path,
				ref: commitSha,
			});

			if (!Array.isArray(fileData) && fileData.type === 'file') {
				let content = '';
				if (fileData.encoding === 'base64' && fileData.content) {
					content = Buffer.from(fileData.content, 'base64').toString('utf-8');
				} else if (typeof fileData.content === 'string') {
					content = fileData.content;
				}

				files.push({
					path: file.path,
					content,
					size: Number(fileData.size ?? file.size ?? content.length),
				});
			}
		} catch (error) {
			console.warn(`Failed to fetch file ${file.path}:`, error);
		}
	}

	if (files.length === 0) {
		throw new Error('No files found in repository for analysis');
	}

	const detectionResult = detectTools(files);

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

