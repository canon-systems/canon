import { DocSection } from '../_components/doc-section';

export default function PreferencesPage() {
  return (
    <DocSection
      title="Preferences"
      description="Tell Canon where to send alerts and how to treat dates and signal windows. This is all in Settings under the Preferences tab."
      whereToGo="Settings → Preferences Tab"
      links={[
        { label: 'Open Preferences', href: '/settings?tab=preferences' },
        { label: 'Add bot to channel (Slack)', href: '/docs/connect-integrations/slack/add-bot-to-channel' },
      ]}
      steps={[
        { label: '1', text: 'Go to Settings and open the Preferences tab.' },
        { label: '2', text: 'Delivery: choose how you want daily signal alerts (e.g. Slack) and enter the destination. For Slack: get the channel ID (right-click the channel in Slack → Copy link, or open channel details and copy the ID from the URL, e.g. C01234ABCD; or use View channel details and copy the Channel ID). Enter that Slack Channel ID here. For private channels, invite the Canon app to the channel first (see Add bot to channel).' },
        { label: '3', text: 'Time zone: set the time zone Canon uses for daily alert timing and date-based views.' },
        { label: '4', text: 'Signal lookback days: how many recent full days Canon includes when evaluating signal trends.' },
        { label: '5', text: 'Click Save Preferences.' },
      ]}
      tip="Delivery, time zone, and lookback are saved. You’re ready to add sources."
    />
  );
}
