import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { DocSection } from '../../../_components/doc-section';

export default function SlackAddBotToChannelPage() {
  return (
    <DocSection
      title="Add the Canon bot to your channel"
      description="Canon sends daily signal alerts to a Slack channel you choose. To receive alerts, the Canon app must be able to post to that channel. For public channels the app can post once the workspace is connected; for private channels you must invite the bot to the channel first. Getting the channel ID and entering it in Canon is done in Preferences."
      whereToGo="Slack: your channel → then Preferences in Canon"
      links={[
        { label: 'Preferences (get channel ID & set delivery)', href: '/docs/preferences' },
        { label: 'Open Settings', href: '/settings?tab=preferences' },
        { label: 'Slack', href: '/docs/connect-integrations/slack' },
      ]}
      steps={[
        { label: '1', text: 'In Slack, open the channel where you want Canon alerts (e.g. #alerts or a private channel).' },
        { label: '2', text: 'For a private channel: click the channel name at the top → Integrations → Add apps. Find the Canon app and add it. For a public channel you can skip this if the app is already in the workspace.' },
      ]}
      tip="The bot is in your channel. To get the channel ID and set it in Canon so alerts are delivered there, see Preferences."
    />
  );
}
