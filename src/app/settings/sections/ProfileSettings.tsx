import { UserProfile } from '@clerk/nextjs';
import { CLERK_EMBEDDED_PROFILE_PROPS } from '@/lib/clerk-config';

export function ProfileSettings() {
  return (
    <div className="max-w-4xl">
      <UserProfile {...CLERK_EMBEDDED_PROFILE_PROPS} />
    </div>
  );
}
