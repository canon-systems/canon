import { MilestoneResponseClient } from './page-client';

export default async function MilestoneResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <MilestoneResponseClient token={token} />;
}
