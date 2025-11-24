/**
 * API Client for connecting to FastAPI backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ApiError {
    detail: string;
    message?: string;
}

/**
 * Get authentication headers from Supabase session
 * For client components: Gets token from browser session
 * For server components: Requires authToken to be passed explicitly
 * 
 * @param authToken Optional token to use directly (required for server-side)
 */
export async function getAuthHeaders(authToken?: string | null): Promise<HeadersInit> {
    // If token is provided directly, use it (preferred for server-side)
    if (authToken) {
        return {
            'Authorization': `Bearer ${authToken}`,
        };
    }

    // Only try to get from session if we're in a browser environment
    // This prevents Next.js from analyzing server imports in client components
    if (typeof window === 'undefined') {
        // Server-side: return empty if no token provided
        // Server-side code should always pass authToken explicitly
        return {};
    }

    // Client-side: Get token from browser session
    try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.access_token) {
            return {
                'Authorization': `Bearer ${session.access_token}`,
            };
        }
    } catch (error) {
        console.warn('Failed to get auth headers:', error);
    }

    return {};
}

/**
 * Make a request to the backend API
 * 
 * @param endpoint API endpoint path
 * @param options Fetch options
 * @param requireAuth Whether authentication is required
 * @param authToken Optional auth token (for server-side routes)
 */
export async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = false,
    authToken?: string | null
): Promise<T> {
    const url = `${API_URL}${endpoint}`;

    // Get auth headers if needed
    const authHeaders = requireAuth ? await getAuthHeaders(authToken) : {};

    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...options.headers,
        },
    });

    if (!response.ok) {
        let errorDetail = `API error: ${response.status}`;
        try {
            const errorData: ApiError = await response.json();
            errorDetail = errorData.detail || errorData.message || errorDetail;
        } catch {
            // If response is not JSON, use status text
            errorDetail = response.statusText || errorDetail;
        }
        throw new Error(errorDetail);
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return response.json();
    }

    return response.text() as unknown as T;
}

/**
 * GET request helper
 */
export async function apiGet<T>(
    endpoint: string,
    requireAuth: boolean = false,
    authToken?: string | null
): Promise<T> {
    return apiRequest<T>(endpoint, { method: 'GET' }, requireAuth, authToken);
}

/**
 * POST request helper
 */
export async function apiPost<T>(
  endpoint: string,
  data?: unknown,
  requireAuth: boolean = false,
  authToken?: string | null
): Promise<T> {
  return apiRequest<T>(
    endpoint,
    {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    },
    requireAuth,
    authToken
  );
}

/**
 * Health check - test backend connection
 */
export async function checkBackendHealth(): Promise<{ status: string }> {
    return apiGet<{ status: string }>('/health', false);
}

