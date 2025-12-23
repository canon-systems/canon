import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
    try {
        // Only allow authenticated users to run migrations
        const { user } = await getSession();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createClient();

        // Fetch all diagrams that contain 'graph LR'
        const { data: diagrams, error: fetchError } = await supabase
            .from('diagrams')
            .select('id, content')
            .like('content', '%graph LR%');

        if (fetchError) {
            console.error('Error fetching diagrams for migration:', fetchError);
            return NextResponse.json({
                error: 'Failed to fetch diagrams for migration'
            }, { status: 500 });
        }

        if (!diagrams || diagrams.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No diagrams with old syntax found. Migration not needed.',
                migrated: 0
            });
        }

        let migrated = 0;
        let errors = 0;

        // Update each diagram
        for (const diagram of diagrams) {
            const updatedContent = diagram.content.replace(/graph LR/g, 'graph TD');

            const { error: updateError } = await supabase
                .from('diagrams')
                .update({ content: updatedContent })
                .eq('id', diagram.id);

            if (updateError) {
                console.error(`Error updating diagram ${diagram.id}:`, updateError);
                errors++;
            } else {
                migrated++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Migration completed. ${migrated} diagrams updated${errors > 0 ? `, ${errors} errors` : ''}.`,
            migrated,
            errors
        });

    } catch (error: any) {
        console.error('Diagram migration error:', error);
        return NextResponse.json(
            {
                error: 'Failed to migrate diagrams',
                detail: error.message
            },
            { status: 500 }
        );
    }
}
