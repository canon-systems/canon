'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconArrowLeft } from '@tabler/icons-react';
import { NewHireForm } from '@/components/new-hire-form';

export function NewHireFormClient() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/new-hires" className="mb-6 inline-flex items-center gap-1.5 type-body transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <IconArrowLeft size={16} />
        New Hires
      </Link>

      <div className="mb-6">
        <h1 className="type-page-title text-[var(--text-primary)]">Add New Hire</h1>
        <p className="text-[var(--text-secondary)] type-body mt-0.5">Canon will set up their onboarding path, access requests, and readiness updates.</p>
      </div>

      <NewHireForm
        onCreated={(hireId) => router.push(`/new-hires?hire=${hireId}`)}
        onCancel={() => router.push('/new-hires')}
      />
    </div>
  );
}
