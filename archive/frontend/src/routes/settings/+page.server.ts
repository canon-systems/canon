// Protect the /settings page so only logged-in users can use it
import { redirect } from "@sveltejs/kit";

export const load = async ({ locals: { safeGetSession } }) => {
    const { user, session } = await safeGetSession();

    if (!session || !user) throw redirect(303, "/login");

    return {
        user
    };
};

