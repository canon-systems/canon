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
      </div>

      <div className="mb-6">
        <h2 className="max-w-2xl text-[24px] font-semibold leading-[1.18] tracking-normal text-[var(--text-primary)]">
          Start with the details Canon needs
        </h2>
        <p className="type-body mt-2 max-w-2xl leading-[1.5] text-[var(--text-secondary)]">
          Canon uses the hire&apos;s role and start date to prepare the onboarding path, access requests, and readiness updates.
        </p>
      </div>

      <NewHireForm
        onCreated={(hireId) => router.push(`/new-hires?hire=${hireId}`)}
        onCancel={() => router.push('/new-hires')}
      />
    </div>
  );
}
