import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { trackArchitectureDiagramDeleted } from '@/lib/server/services/usageTracking';

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { user } = await getSession();
		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const supabase = await createClient();
		const { id } = await params;

		// Fetch diagram to verify ownership and capture metadata
		const { data: diagram, error: diagramError } = await supabase
			.from('diagrams')
			.select('id, source_id')
			.eq('id', id)
			.single();

		if (diagramError || !diagram) {
			return NextResponse.json({ error: 'Diagram not found' }, { status: 404 });
		}

		// Verify user owns the repo
		const { data: repo, error: repoError } = await supabase
			.from('workspace_sources')
			.select('user_id, external_url')
			.eq('id', diagram.source_id)
			.single();

		if (repoError || !repo || repo.user_id !== user.id) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		// Track deletion before removing the record
		try {
			await trackArchitectureDiagramDeleted(supabase, user.id, diagram.source_id, diagram.id, repo.external_url ?? undefined);
		} catch (logError) {
			console.warn('Failed to track diagram deletion:', logError);
		}

		const { error: deleteError } = await supabase
			.from('diagrams')
			.delete()
			.eq('id', id);

		if (deleteError) {
			throw deleteError;
		}

		return NextResponse.json({ success: true });
	} catch (err: unknown) {
		console.error('Delete diagram error:', err);
		return NextResponse.json(
			{ error: 'Failed to delete diagram', detail: err instanceof Error ? err.message : String(err) },
			{ status: 500 }
		);
	}
}
