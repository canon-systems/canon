import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auto-update tracked files when renames are detected
 * Updates document_files table
 */
export async function updateTrackedFilesForRenames(
	supabase: SupabaseClient,
	documentId: string,
	filesRenamed: Array<{ old_path: string; new_path: string }>
): Promise<{ updated: boolean; newFiles: string[] }> {
	if (filesRenamed.length === 0) {
		return { updated: false, newFiles: [] };
	}

	// Get current document files
	const { data: documentFiles, error: docError } = await supabase
		.from('document_files')
		.select('file_path')
		.eq('document_id', documentId);

	if (docError) {
		console.warn(`Failed to get document files ${documentId} for rename update:`, docError);
		return { updated: false, newFiles: [] };
	}

	const trackedFiles = (documentFiles || []).map(df => df.file_path);
	let updated = false;

	// Check if any renamed files are tracked
	for (const rename of filesRenamed) {
		if (trackedFiles.includes(rename.old_path)) {
			updated = true;
			break;
		}
	}

	if (!updated) {
		return { updated: false, newFiles: trackedFiles };
	}

	// Update document_files table entries
	for (const rename of filesRenamed) {
		// Check if old path exists
		const oldFileExists = trackedFiles.includes(rename.old_path);
		
		if (oldFileExists) {
		// Delete old entry
		await supabase
				.from('document_files')
			.delete()
				.eq('document_id', documentId)
			.eq('file_path', rename.old_path);

			// Insert new entry (check if it doesn't already exist)
			const newFileExists = trackedFiles.includes(rename.new_path);
			if (!newFileExists) {
			await supabase
					.from('document_files')
					.insert({
						document_id: documentId,
						file_path: rename.new_path
					});
			}
		}
	}

	// Update document timestamp
	await supabase
		.from('documents')
		.update({
			updated_at: new Date().toISOString()
		})
		.eq('id', documentId);

	// Get updated file list
	const { data: updatedFiles } = await supabase
		.from('document_files')
		.select('file_path')
		.eq('document_id', documentId);

	return { 
		updated: true, 
		newFiles: (updatedFiles || []).map(df => df.file_path) 
	};
}


