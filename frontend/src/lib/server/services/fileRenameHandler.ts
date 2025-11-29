import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auto-update tracked files when renames are detected
 * Updates selected_files, code_snapshot.fileShas, and submission_files table
 */
export async function updateTrackedFilesForRenames(
	supabase: SupabaseClient,
	submissionId: string,
	filesRenamed: Array<{ old_path: string; new_path: string }>
): Promise<{ updated: boolean; newFiles: string[] }> {
	if (filesRenamed.length === 0) {
		return { updated: false, newFiles: [] };
	}

	// Get current submission
	const { data: submission, error: subError } = await supabase
		.from('submissions')
		.select('selected_files, code_snapshot')
		.eq('id', submissionId)
		.single();

	if (subError || !submission) {
		console.warn(`Failed to get submission ${submissionId} for rename update:`, subError);
		return { updated: false, newFiles: [] };
	}

	const trackedFiles = [...(submission.selected_files || [])];
	let updated = false;

	// Replace old paths with new paths for renamed files
	for (const rename of filesRenamed) {
		const index = trackedFiles.indexOf(rename.old_path);
		if (index !== -1) {
			// File was tracked, update to new path
			trackedFiles[index] = rename.new_path;
			updated = true;
		}
	}

	if (!updated) {
		return { updated: false, newFiles: trackedFiles };
	}

	// Update code_snapshot fileShas
	const codeSnapshot = submission.code_snapshot || {};
	const fileShas = { ...(codeSnapshot.fileShas || {}) };

	// Move SHA from old path to new path
	for (const rename of filesRenamed) {
		if (fileShas[rename.old_path]) {
			fileShas[rename.new_path] = fileShas[rename.old_path];
			delete fileShas[rename.old_path];
		}
	}

	// Update submission with new file list and updated fileShas
	const { error: updateError } = await supabase
		.from('submissions')
		.update({
			selected_files: trackedFiles,
			code_snapshot: {
				...codeSnapshot,
				fileShas,
			},
			updated_at: new Date().toISOString(),
		})
		.eq('id', submissionId);

	if (updateError) {
		console.error(`Failed to update submission ${submissionId} for renames:`, updateError);
		return { updated: false, newFiles: trackedFiles };
	}

	// Update submission_files table entries
	for (const rename of filesRenamed) {
		// Delete old entry
		await supabase
			.from('submission_files')
			.delete()
			.eq('submission_id', submissionId)
			.eq('file_path', rename.old_path);

		// Update or insert new entry
		const oldFileHash = fileShas[rename.new_path];
		if (oldFileHash) {
			// Try to get existing entry to preserve size_bytes and file_type
			const { data: oldEntry } = await supabase
				.from('submission_files')
				.select('size_bytes, file_type')
				.eq('submission_id', submissionId)
				.eq('file_path', rename.old_path)
				.single();

			await supabase
				.from('submission_files')
				.upsert({
					submission_id: submissionId,
					file_path: rename.new_path,
					file_hash: oldFileHash,
					size_bytes: oldEntry?.size_bytes || null,
					file_type: oldEntry?.file_type || null,
				}, {
					onConflict: 'submission_id,file_path',
				});
		}
	}

	return { updated: true, newFiles: trackedFiles };
}

