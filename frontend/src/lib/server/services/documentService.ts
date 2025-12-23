import type { SupabaseClient } from '@supabase/supabase-js';
import { LLMGateway } from './llmGateway';

/**
 * Generate document from selected file summaries
 * Simple: get summaries → combine → generate doc → save
 */
export async function generateDocument(
	supabase: SupabaseClient,
	repoId: string,
	title: string,
	selectedFiles: string[]
): Promise<{ documentId: string }> {
	// 1. Get summaries for selected files
	// Normalize repoId to match repo_file_summaries format (github.com/owner/repo)
	const normalizedRepoId = repoId.startsWith('github.com/') ? repoId : `github.com/${repoId}`;
	const { data: summaries, error: summariesError } = await supabase
		.from('repo_file_summaries')
		.select('file_path, summary_text')
		.ilike('repo_id', normalizedRepoId)
		.in('file_path', selectedFiles);

	if (summariesError) {
		throw new Error(`Failed to fetch summaries: ${summariesError.message}`);
	}

	if (!summaries || summaries.length === 0) {
		throw new Error('No summaries found for selected files');
	}

	// 2. Combine summaries into prompt
	const combinedSummaries = summaries
		.map(s => `File: ${s.file_path}\n${s.summary_text}`)
		.join('\n\n');

	// 3. Generate document
	const gateway = new LLMGateway();
	const prompt = `Generate comprehensive documentation from these file summaries. Create well-structured documentation that explains the codebase, its architecture, key components, and how they work together.

File Summaries:
${combinedSummaries}

Generate professional documentation in markdown format with:
- Overview/Introduction
- Architecture/Structure
- Key Components
- How components interact
- Important patterns or conventions

Be thorough and clear.`;

	let documentContent: string;
	try {
		documentContent = await gateway.call(
			[{ role: 'user', content: prompt }],
			'gpt-4o',
			0.3
		);
	} catch (error: any) {
		throw new Error(`Failed to generate document: ${error.message}`);
	}

	// 4. Save document
	const { data: doc, error: docError } = await supabase
		.from('documents')
		.insert({
			repo_id: repoId,
			title,
			content: documentContent
		})
		.select()
		.single();

	if (docError) {
		throw new Error(`Failed to save document: ${docError.message}`);
	}

	// 5. Save file mappings
	const fileMappings = selectedFiles.map(filePath => ({
		document_id: doc.id,
		file_path: filePath
	}));

	const { error: filesError } = await supabase
		.from('document_files')
		.insert(fileMappings);

	if (filesError) {
		console.error('Failed to save file mappings:', filesError);
		// Don't throw - document is saved, mappings are secondary
	}

	// 6. Create initial version
	const { data: versionData } = await supabase.rpc('get_next_document_version', {
		doc_id: doc.id
	});

	const versionNumber = versionData || 1;

	await supabase.from('document_versions').insert({
		document_id: doc.id,
		version_number: versionNumber,
		content: documentContent,
		change_summary: 'Initial version'
	});

	return { documentId: doc.id };
}

/**
 * Get document by ID
 */
export async function getDocument(
	supabase: SupabaseClient,
	documentId: string
): Promise<{ id: string; title: string; content: string; repo_id: string; kb_id: string | null; kb_provider: string | null; created_at: string; updated_at: string; configuration?: any } | null> {
	const { data, error } = await supabase
		.from('documents')
		.select('id, title, content, repo_id, kb_id, kb_provider, created_at, updated_at, configuration')
		.eq('id', documentId)
		.single();

	if (error || !data) return null;
	return data;
}

/**
 * Get files for a document
 */
export async function getDocumentFiles(
	supabase: SupabaseClient,
	documentId: string
): Promise<string[]> {
	const { data, error } = await supabase
		.from('document_files')
		.select('file_path')
		.eq('document_id', documentId);

	if (error || !data) return [];
	return data.map(f => f.file_path);
}

/**
 * Create or update a document for a repository
 * Simple: check if exists → update or create → save files → create version
 */
export async function createOrUpdateDocument(
	supabase: SupabaseClient,
	repoId: string,
	title: string,
	content: string,
	filePaths: string[],
	sourceMeta?: Record<string, unknown>
): Promise<{ documentId: string; isNew: boolean }> {
	// Check if document exists for this repo
	const { data: existingDoc } = await supabase
		.from('documents')
		.select('id')
		.eq('repo_id', repoId)
		.eq('title', title)
		.single();

	let documentId: string;
	let isNew = false;

	if (existingDoc?.id) {
		// Update existing document
		const { data: updatedDoc, error: updateError } = await supabase
			.from('documents')
			.update({
				content,
				updated_at: new Date().toISOString(),
			})
			.eq('id', existingDoc.id)
			.select()
			.single();

		if (updateError) {
			throw new Error(`Failed to update document: ${updateError.message}`);
		}

		documentId = updatedDoc.id;

		// Update file mappings
		await supabase
			.from('document_files')
			.delete()
			.eq('document_id', documentId);

		const fileMappings = filePaths.map(filePath => ({
			document_id: documentId,
			file_path: filePath
		}));

		await supabase
			.from('document_files')
			.insert(fileMappings);

		// Create new version
		const { data: versionData } = await supabase.rpc('get_next_document_version', {
			doc_id: documentId
		});

		const versionNumber = versionData || 1;

		await supabase.from('document_versions').insert({
			document_id: documentId,
			version_number: versionNumber,
			content,
			change_summary: 'Updated document'
		});
	} else {
		// Create new document
		const { data: newDoc, error: createError } = await supabase
			.from('documents')
			.insert({
				repo_id: repoId,
				title,
				content,
			})
			.select()
			.single();

		if (createError) {
			throw new Error(`Failed to create document: ${createError.message}`);
		}

		documentId = newDoc.id;
		isNew = true;

		// Save file mappings
		const fileMappings = filePaths.map(filePath => ({
			document_id: documentId,
			file_path: filePath
		}));

		await supabase
			.from('document_files')
			.insert(fileMappings);

		// Create initial version
		const { data: versionData } = await supabase.rpc('get_next_document_version', {
			doc_id: documentId
		});

		const versionNumber = versionData || 1;

		await supabase.from('document_versions').insert({
			document_id: documentId,
			version_number: versionNumber,
			content,
			change_summary: 'Initial version'
		});
	}

	return { documentId, isNew };
}

