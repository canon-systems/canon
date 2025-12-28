import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Canon - AI-Powered Code Documentation',
  description: 'Transform your codebase into business intelligence with AI-powered documentation, architecture diagrams, and automated insights.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
