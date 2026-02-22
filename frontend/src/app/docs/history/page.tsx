import { DocSection } from '../_components/doc-section';

export default function HistoryPage() {
  return (
    <DocSection
      title="Using the History Page"
      description="History lets you compare a period of activity to a baseline. You pick a date range, then see a narrative summary and metrics so you can explain what changed and which source drove it."
      whereToGo="History Page"
      links={[{ label: 'Go to History', href: '/history' }]}
      steps={[
        { label: '1', text: 'Open History and click Select Primary Range.' },
        { label: '2', text: 'Choose the date range you want to analyze and confirm.' },
        { label: '3', text: 'Read the Inside summary for a quick narrative of what changed.' },
        { label: '4', text: 'Use the metric cards to compare Current vs Baseline.' },
        { label: '5', text: 'Open Detailed View and switch between tabs by source type for event-level drill-down.' },
      ]}
      tip="You can explain what changed in your selected period and which source drove it."
    />
  );
}
