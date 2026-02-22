import { DocSection } from '../_components/doc-section';

export default function SignalsPage() {
  return (
    <DocSection
      title="Using the Signals Page"
      description="Signals are the highest-priority deviations Canon has detected. Use this page to monitor what matters and open any signal to investigate in detail."
      whereToGo="Signals Page"
      links={[{ label: 'Go to Signals', href: '/signals' }]}
      steps={[
        { label: '1', text: 'Open Signals to see the latest signal feed for your workspace.' },
        { label: '2', text: 'Use the date range filter to focus on a specific time window.' },
        { label: '3', text: 'Filter by Severity and Metric to narrow the list.' },
        { label: '4', text: 'Click a signal card (or Investigate) to open full details and evidence.' },
        { label: '5', text: 'Use this page regularly to spot meaningful movement and escalate when needed.' },
      ]}
      tip="You can filter signals and open details for fast investigation."
    />
  );
}
