/**
 * Proxy endpoint to test backend connection
 * This allows us to test the backend from the frontend without CORS issues
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkBackendHealth } from '@/lib/api/client';

export async function GET(_request: NextRequest) {
    try {
        const health = await checkBackendHealth();
        return NextResponse.json({
            success: true,
            backend: health,
            message: 'Backend connection successful'
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to connect to backend',
            message: 'Backend connection failed'
        }, { status: 500 });
    }
}

