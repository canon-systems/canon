import { DocSection } from '../../_components/doc-section';

export default function GitHubPage() {
  return (
    <DocSection
      title="GitHub"
      description="GitHub is a source integration. Canon uses it to read your repositories and pull request activity so you can see commits, PRs, and related signals. You connect by installing the Canon GitHub App."
      whereToGo="Settings → Integrations Tab"
      links={[{ label: 'Open Integrations', href: '/settings?tab=integrations' }]}
      steps={[
        { label: '1', text: 'In Canon, open Settings → Integrations and find the GitHub card.' },
        { label: '2', text: 'Click Connect. You’ll be sent to GitHub to install the Canon app.' },
        { label: '3', text: 'On GitHub, choose the organization or personal account and the repos you want Canon to access (or select all).' },
        { label: '4', text: 'Complete the installation. GitHub will send you back to Canon.' },
        { label: '5', text: 'Back in Canon, the GitHub card should show Connected. You can now add those repos as sources on the Sources page.' },
      ]}
      tip="GitHub is connected. Add repos as sources on the Sources page."
    />
  );
}
