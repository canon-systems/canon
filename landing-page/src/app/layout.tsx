import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Canon — Automated Knowledge Infrastructure',
  description: 'Keep service pages, runbooks, and system maps in sync with your codebase.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-white antialiased">{children}</body>
    </html>
  );
}
