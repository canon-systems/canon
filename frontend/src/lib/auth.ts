import { createClient } from '@/lib/supabase/server';

export async function getSession() {
  const supabase = await createClient();

  try {
    // Use getUser() for authentication - it verifies the session with Supabase Auth server
    const { data: userData, error: userError } = await supabase.auth.getUser();

    // Handle refresh token errors specifically
    if (userError) {
      const isRefreshTokenError = userError.message?.includes('refresh_token_not_found') ||
                                  userError.message?.includes('Invalid Refresh Token') ||
                                  userError.message?.includes('refresh token') ||
                                  userError.status === 400;

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

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStatus = (error as { status?: number })?.status;
    const isRefreshTokenError = errorMessage?.includes('refresh_token_not_found') ||
                                errorMessage?.includes('Invalid Refresh Token') ||
                                errorMessage?.includes('refresh token') ||
                                errorStatus === 400;

    if (isRefreshTokenError) {
      console.log('Refresh token error caught in getSession');
      return { user: null, session: null };
    }

    // For other errors, return null session
    return { user: null, session: null };
  }
}

