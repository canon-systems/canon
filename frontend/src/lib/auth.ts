import { createClient } from '@/lib/supabase/server';
import { isAuthApiError } from '@supabase/supabase-js';

export async function getSession() {
  const supabase = await createClient();

  try {
    // Use getUser() for authentication - it verifies the session with Supabase Auth server
    const { data: userData, error: userError } = await supabase.auth.getUser();

    // Handle refresh token errors specifically using Supabase's recommended error checking
    if (userError) {
      // Use isAuthApiError and error.code as recommended by Supabase docs
      const isRefreshTokenError = 
        (isAuthApiError(userError) && (
          userError.code === 'refresh_token_not_found' ||
          userError.code === 'session_not_found' ||
          userError.code === 'session_expired' ||
          userError.code === 'refresh_token_already_used'
        )) ||
        userError.status === 400 ||
        userError.status === 401;

      if (isRefreshTokenError) {
        console.log('Refresh token error in getSession, clearing session');
        // Clear the invalid session
        await supabase.auth.signOut({ scope: 'local' });
        return { user: null, session: null };
      }

      // For other errors, return null session
      if (!userData.user) {
        return { user: null, session: null };
      }
    }

    if (!userData.user) {
      return { user: null, session: null };
    }

    // Only get session data after verifying user with getUser()
    const { data: sessionData } = await supabase.auth.getSession();

    return {
      user: userData.user,
      session: sessionData.session ?? null
    };
  } catch (error: unknown) {
    // Handle any unexpected auth errors
    console.error('Unexpected auth error in getSession:', error);

    // Use Supabase's error checking utilities
    if (isAuthApiError(error)) {
      const isRefreshTokenError = 
        error.code === 'refresh_token_not_found' ||
        error.code === 'session_not_found' ||
        error.code === 'session_expired' ||
        error.code === 'refresh_token_already_used' ||
        error.status === 400 ||
        error.status === 401;

      if (isRefreshTokenError) {
        console.log('Refresh token error caught in getSession');
        return { user: null, session: null };
      }
    }

    // For other errors, return null session
    return { user: null, session: null };
  }
}

