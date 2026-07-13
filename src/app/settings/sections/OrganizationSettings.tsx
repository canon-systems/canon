import { OrganizationProfile } from '@clerk/nextjs';
import { CLERK_EMBEDDED_PROFILE_PROPS } from '@/lib/clerk-config';

export function OrganizationSettings() {
  return (
    <div className="max-w-5xl">
      <OrganizationProfile {...CLERK_EMBEDDED_PROFILE_PROPS} />
    </div>
  );
}
