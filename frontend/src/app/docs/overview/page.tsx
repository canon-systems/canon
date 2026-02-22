import { DocSection } from '../_components/doc-section';

export default function OverviewPage() {
  return (
    <DocSection
      title="Overview"
      description="Canon connects to your tools so you can see how work is moving—commits, pull requests, issue changes, and more. You connect integrations in Settings (source integrations for data and, optionally, a delivery integration like Slack for alerts). For Jira, set up the webhook in Settings so Canon receives live issue updates (see Jira Webhook Setup). Then you add the specific sources you care about on the Sources page and assign each to a domain so Canon can group work by product area. Use History to compare periods and Signals to spot important changes. This page explains each step in plain language."
    />
  );
}
