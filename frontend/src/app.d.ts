// -------------------------------------------------------------
// PURPOSE
// Type declarations that teach SvelteKit about objects we put
// on event.locals in hooks.server.ts.
// With this file, TypeScript will know safeGetSession exists,
// and it will know the shape of what it returns.
// -------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session, User } from "@supabase/supabase-js";

declare global {
	namespace App {
		// We extend "Locals" that SvelteKit carries per request.
		interface Locals {
			// The per request Supabase server client we created in hooks.
			supabase: SupabaseClient;
			// A helper that validates the cookie and returns a safe user and session.
			safeGetSession: () => Promise<{
				user: User | null;
				session: Session | null;
			}>;
		}

		// You can also add "PageData" here if you want strict typing for $page.data.
		// For example:
		// interface PageData {
		//   user: User | null;
		//   session: Session | null;
		// }
	}
}

export { };