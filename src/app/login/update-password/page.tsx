import type { Metadata } from 'next';

import { UpdatePasswordPageClient } from '@/app/login/update-password/page-client';

export const metadata: Metadata = {
  title: 'Update password | Canon',
  description: 'Set a new password for your Canon account.',
};

export default function UpdatePasswordPage() {
  return <UpdatePasswordPageClient />;
}
