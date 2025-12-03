import { Metadata } from 'next';
import AutomationReviewPageClient from './page-client';

interface AutomationReviewPageProps {
  params: Promise<{
    automationId: string;
  }>;
}

export async function generateMetadata({
  params,
}: AutomationReviewPageProps): Promise<Metadata> {
  const { automationId } = await params;
  return {
    title: 'Review Automation Results',
    description: 'Review and approve automation-generated content',
  };
}

export default async function AutomationReviewPage({
  params,
}: AutomationReviewPageProps) {
  const { automationId } = await params;

  return <AutomationReviewPageClient automationId={automationId} />;
}
