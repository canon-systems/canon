import { DocSection } from '../../_components/doc-section';

export default function AtlassianPage() {
  return (
    <DocSection
      title="Atlassian"
      description="Atlassian is a source integration. Canon uses it to read your Jira data so you can track issues and spaces. You connect with your Atlassian account. After you connect, Jira needs one extra step—a webhook—so Canon can receive live issue updates; see Jira Webhook Setup."
      whereToGo="Settings → Integrations Tab"
      links={[
        { label: 'Open Integrations', href: '/settings?tab=integrations' },
        { label: 'Jira Webhook Setup', href: '/docs/jira-webhook-setup' },
      ]}
      steps={[
        { label: '1', text: 'In Canon, open Settings → Integrations and find the Atlassian card.' },
        { label: '2', text: 'Click Connect. You’ll be asked to sign in with your Atlassian account (the one that has access to the Jira sites you care about).' },
        { label: '3', text: 'Authorize Canon to access your Atlassian products and finish the flow. You’ll be sent back to Canon.' },
        { label: '4', text: 'When you return, Canon may open a modal with your Jira webhook details (URL and secret). If you see it, you can copy those and set up the webhook in Jira now, or do it later via the Atlassian card in Settings → Integrations (Configure Jira webhook).' },
        { label: '5', text: 'The Atlassian card should show Connected. After you add the Jira webhook (see Jira Webhook Setup), you can add Jira projects as sources on the Sources page.' },
      ]}
      tip="Atlassian is connected. Set up the Jira webhook, then add Jira projects as sources."
    />
  );
}
