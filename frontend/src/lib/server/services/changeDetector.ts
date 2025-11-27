import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { analyzeRepository, AnalyzeRepositoryResult } from './analyzeRepository';
import {
	compareCodeSnapshots,
	compareDetectionResults,
} from '../architecture/detectChanges';
import { detectTools } from '../architecture/detectTools';
import type { DetectionResult } from '../architecture/detectTools';

type DetectChangesParams = {
	supabase: SupabaseClient;
	userId: string;
	repoUrl?: string | null;
	branch?: string | null;
	commitRange?: string | null;
	submissionId?: string | null;
	diagramId?: string | null;
};

type FileChange = {
	path: string;
	old_hash?: string | null;
	new_hash?: string | null;
	status: 'modified';
};

export async function detectRepositoryChanges({
	supabase,
	userId,
	repoUrl,
	branch,
	submissionId,
	diagramId,
}: DetectChangesParams): Promise<{
	has_changes: boolean;
	commit_changed: boolean;
	files_changed: FileChange[];
	files_added: string[];
	files_removed: string[];
	architecture_changes?: Record<string, unknown> | null;
	summary: string;
	current_commit_sha: string;
	old_commit_sha: string | null;
}> {
	let effectiveRepoUrl = repoUrl;
	let effectiveBranch = branch;
	let oldSnapshot: AnalyzeRepositoryResult['snapshot'] | null = null;
	let oldDetectionResult: DetectionResult | null = null;

	if (submissionId) {
		const submission = await supabase
			.from('submissions')
			.select('*')
			.eq('id', submissionId)
			.single();

		if (submission && submission.data) {
			const data = submission.data;
			effectiveRepoUrl =
				data.source_meta?.repoUrl || effectiveRepoUrl || null;
			effectiveBranch =
				data.source_meta?.branch || effectiveBranch || 'main';
			oldSnapshot = data.code_snapshot || null;
		}
	} else if (diagramId) {
		const diagram = await supabase
			.from('architecture_diagrams')
			.select('*')
			.eq('id', diagramId)
			.single();

		if (diagram && diagram.data) {
			effectiveRepoUrl =
				diagram.data.repo_url || effectiveRepoUrl || null;
			effectiveBranch =
				diagram.data.branch || effectiveBranch || 'main';
			oldSnapshot = diagram.data.code_snapshot || null;
			oldDetectionResult = diagram.data.detection_result || null;
		}
	}

	if (!effectiveRepoUrl) {
		throw new Error('repo_url is required for change detection');
	}

	const parsed = parseRepoUrl(effectiveRepoUrl);
	if (!parsed) {
		throw new Error(`Invalid GitHub URL: ${effectiveRepoUrl}`);
	}

	const resolvedBranch = effectiveBranch || parsed.branch || 'main';

	const analyzeResult = await analyzeRepository({
		supabase,
		userId,
		repoUrl: effectiveRepoUrl,
		branch: resolvedBranch,
		subdir: parsed.subdir || null,
		filters: null,
	});

	const newSnapshot = analyzeResult.snapshot;

	const codeComparison = compareCodeSnapshots(oldSnapshot, newSnapshot);

	let architectureChanges: Record<string, unknown> | null = null;

	if (diagramId && oldDetectionResult) {
		const changedPaths = [
			...codeComparison.filesChanged.map((c) => c.path),
			...codeComparison.filesAdded,
		];

		const detectionFiles = await fetchFilesContent(
			supabase,
			userId,
			effectiveRepoUrl,
			resolvedBranch,
			Array.from(new Set(changedPaths))
		);

		if (detectionFiles.length > 0) {
			const updatedDetection = detectTools(detectionFiles);
			const comparison = compareDetectionResults(oldDetectionResult, updatedDetection);

			architectureChanges = {
				tools_added: comparison.toolsAdded,
				tools_removed: comparison.toolsRemoved,
				connections_added: comparison.connectionsAdded,
				connections_removed: comparison.connectionsRemoved,
			};
		}
	}

	const summaryPieces: string[] = [];
	if (codeComparison.commitChanged) summaryPieces.push('Commit changed');
	if (codeComparison.filesChanged.length)
		summaryPieces.push(`${codeComparison.filesChanged.length} file(s) modified`);
	if (codeComparison.filesAdded.length)
		summaryPieces.push(`${codeComparison.filesAdded.length} file(s) added`);
	if (codeComparison.filesRemoved.length)
		summaryPieces.push(`${codeComparison.filesRemoved.length} file(s) removed`);

	const summary = summaryPieces.length ? summaryPieces.join('. ') : 'No changes detected';

	if (submissionId) {
		await supabase
			.from('submissions')
			.update({
				is_outdated: codeComparison.hasChanges,
				last_checked_at: new Date().toISOString(),
			})
			.eq('id', submissionId);
	} else if (diagramId) {
		await supabase
			.from('architecture_diagrams')
			.update({
				last_checked_at: new Date().toISOString(),
			})
			.eq('id', diagramId);
	}

	return {
		has_changes: codeComparison.hasChanges,
		commit_changed: codeComparison.commitChanged,
		files_changed: codeComparison.filesChanged.map((change) => ({
			path: change.path,
			old_hash: change.oldHash,
			new_hash: change.newHash,
			status: 'modified',
		})),
		files_added: codeComparison.filesAdded,
		files_removed: codeComparison.filesRemoved,
		architecture_changes: architectureChanges,
		summary,
		current_commit_sha: newSnapshot.commitSha,
		old_commit_sha: oldSnapshot?.commitSha || null,
	};
}

async function fetchFilesContent(
	supabase: SupabaseClient,
	userId: string,
	repoUrl: string,
	branch: string,
	paths: string[]
) {
	const octokit = await getUserOctokit(supabase, userId);
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		return [];
	}

	const owner = parsed.owner;
	const repo = parsed.repo;

	const contents: Array<{ path: string; content: string }> = [];
	for (const filePath of paths) {
		try {
			const { data } = await octokit.repos.getContent({
				owner,
				repo,
				path: filePath,
				ref: branch,
			});

			if (!Array.isArray(data) && data.type === 'file') {
				const content =
					data.encoding === 'base64' && typeof data.content === 'string'
						? Buffer.from(data.content, 'base64').toString('utf-8')
						: (data.content as string);

				contents.push({ path: filePath, content });
			}
		} catch (error) {
			console.warn(`Failed to fetch ${filePath} for change detection`, error);
		}
	}

	return contents;
}

