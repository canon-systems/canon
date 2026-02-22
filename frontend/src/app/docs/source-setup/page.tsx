import { redirect } from 'next/navigation';

export default function SourceSetupRedirect() {
  redirect('/docs/jira-webhook-setup');
}
