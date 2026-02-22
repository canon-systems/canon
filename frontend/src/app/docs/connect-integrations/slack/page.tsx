import { DocSection } from '../../_components/doc-section';

export default function SlackPage() {
  return (
    <DocSection
      title="Slack"
      description="Slack is a delivery integration. Canon uses it to send daily signal alerts and other notifications to a channel you choose. You connect your workspace once; then in Preferences you’ll pick the exact channel and save."
      whereToGo="Settings → Integrations Tab"
      links={[
        { label: 'Open Integrations', href: '/settings?tab=integrations' },
        { label: 'Preferences', href: '/docs/preferences' },
      ]}
      steps={[
        { label: '1', text: 'In Canon, open Settings → Integrations and find the Slack card.' },
        { label: '2', text: 'Click Connect. You’ll be asked to sign in to Slack (if needed) and to allow Canon to post to your workspace.' },
        { label: '3', text: 'Choose the workspace you want and approve the permissions. You’ll be sent back to Canon.' },
        { label: '4', text: 'The Slack card should show Connected. In Preferences you’ll enter the Slack Channel ID where you want alerts (e.g. for a private channel, invite the Canon app to that channel first, then paste its channel ID).' },
      ]}
      tip="Slack is connected. Set your alert channel in Preferences."
    />
  );
}
