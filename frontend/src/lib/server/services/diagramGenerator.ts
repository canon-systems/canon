import type { SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { analyzeRepository } from './analyzeRepository';
import { detectTools, DetectionResult } from '../architecture/detectTools';
import { generateMarkdownDoc } from '../architecture/generateDiagram';
import {
	getArchitectureDiagramsByRepo,
	saveArchitectureDiagram,
	updateArchitectureDiagram,
} from '../architecture/persistence';

type FileInput = { path: string; content: string };

export type GenerateDiagramParams = {
	supabase: SupabaseClient;
	userId?: string | null;
	method: 'github' | 'zip' | 'files';
	repoUrl?: string | null;
	branch?: string | null;
	subdir?: string | null;
	files?: FileInput[];
	zipContent?: ArrayBuffer | Buffer;
	saveDiagram?: boolean;
	title?: string;
	description?: string | null;
};

export type GenerateDiagramResult = {
	diagram: string;
	tools: DetectionResult;
	file_count: number;
	saved: boolean;
	diagram_id: string | null;
	is_new_diagram: boolean;
};

export async function generateArchitectureDiagram(params: GenerateDiagramParams): Promise<GenerateDiagramResult> {
	const {
		supabase,
		userId,
		method,
		repoUrl,
		branch,
		subdir,
		files,
		zipContent,
		saveDiagram = false,
		title = 'Untitled Diagram',
		description = null,
	} = params;

	let targetFiles: FileInput[] = [];
	let detectionResult: DetectionResult | null = null;
	let fileSnapshot = { commitSha: '', fileShas: {} as Record<string, string | null>, createdAt: new Date().toISOString() };

	if (method === 'github') {
		if (!repoUrl) {
			throw new Error('repoUrl is required for github method');
		}

		const analysis = await analyzeRepository({
			supabase,
			userId: userId || '',
			repoUrl,
			branch: branch || undefined,
			subdir,
			filters: null,
		});

		targetFiles = analysis.rawFiles ?? [];
		detectionResult = analysis.detection_result;
		fileSnapshot = analysis.snapshot;
	} else if (method === 'files') {
		if (!files || files.length === 0) {
			throw new Error('files are required for files method');
		}
		targetFiles = files;
		detectionResult = detectTools(files);
	} else if (method === 'zip') {
		if (!zipContent) {
			throw new Error('zip_content is required for zip method');
		}
		targetFiles = await extractFilesFromZip(zipContent);
		if (targetFiles.length === 0) {
			throw new Error('No files found in ZIP archive');
		}
		detectionResult = detectTools(targetFiles);
	} else {
		throw new Error(`Unknown method: ${method}`);
	}

	if (!detectionResult) {
		throw new Error('Detection result is not available');
	}

	const diagramMarkdown = generateMarkdownDoc(detectionResult);

	let diagramId: string | null = null;
	let isNewDiagram = false;
	let saved = false;

	if (saveDiagram && userId && repoUrl) {
		const diagrams = await getArchitectureDiagramsByRepo(
			supabase,
			userId,
			repoUrl,
			branch || 'main',
			subdir
		);

		if (diagrams.length > 0) {
			diagramId = diagrams[0].id;
			await updateArchitectureDiagram(supabase, diagramId, {
				detection_result: detectionResult,
				diagram_markdown: diagramMarkdown,
				code_snapshot: fileSnapshot,
				last_commit_sha: fileSnapshot.commitSha,
				title,
				description: description || undefined,
			});
			saved = true;
		} else {
			const savedResult = await saveArchitectureDiagram(supabase, {
				user_id: userId,
				repo_provider: 'github',
				repo_url: repoUrl,
				branch: branch || 'main',
				subdir: subdir || null,
				detection_result: detectionResult,
				diagram_markdown: diagramMarkdown,
				code_snapshot: fileSnapshot,
				last_commit_sha: fileSnapshot.commitSha,
				title,
				description: description || undefined,
			});

			if (savedResult) {
				diagramId = savedResult.id;
				isNewDiagram = true;
				saved = true;
			}
		}
	}

	return {
		diagram: diagramMarkdown,
		tools: detectionResult,
		file_count: targetFiles.length,
		saved,
		diagram_id: diagramId,
		is_new_diagram: isNewDiagram,
	};
}

async function extractFilesFromZip(content: ArrayBuffer | Buffer): Promise<FileInput[]> {
	const jszip = new JSZip();
	const zip = await jszip.loadAsync(content);
	const files: FileInput[] = [];

	await Promise.all(
		Object.keys(zip.files).map(async (path) => {
			const entry = zip.files[path];
			if (entry.dir) return;

			const data = await entry.async('string');
			files.push({ path, content: data });
		})
	);

	return files;
}

