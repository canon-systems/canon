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
 * Works in both browser and server environments
 * 
 * @param authToken Optional token to use directly (for server-side routes)
 */
export async function getAuthHeaders(authToken?: string | null): Promise<HeadersInit> {
    // If token is provided directly, use it
    if (authToken) {
        return {
            'Authorization': `Bearer ${authToken}`,
        };
    }

    try {
        // Try server client first (for API routes)
        try {
            const { createClient } = await import('@/lib/supabase/server');
            const supabase = await createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.access_token) {
                return {
                    'Authorization': `Bearer ${session.access_token}`,
                };
            }
        } catch {
            // Fall back to browser client (for client-side calls)
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.access_token) {
                return {
                    'Authorization': `Bearer ${session.access_token}`,
                };
            }
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

