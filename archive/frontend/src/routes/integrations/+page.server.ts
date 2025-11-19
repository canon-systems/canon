// Redirect old /integrations route to new /settings/integrations
import { redirect } from "@sveltejs/kit";

export const load = async () => {
    throw redirect(301, "/settings/integrations");
};
