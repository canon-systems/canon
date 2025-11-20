import { createClient } from '@/lib/supabase/server';

export async function getSession() {
  const supabase = await createClient();
  
  // Use getUser() for authentication - it verifies the session with Supabase Auth server
  const { data: userData, error: userError } = await supabase.auth.getUser();
  
  if (userError || !userData.user) {
    return { user: null, session: null };
  }

  // Only get session data after verifying user with getUser()
  const { data: sessionData } = await supabase.auth.getSession();
  
  return { 
    user: userData.user, 
    session: sessionData.session ?? null 
  };
}

