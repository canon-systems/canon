import type { Metadata } from 'next';
import { Fraunces, Space_Grotesk } from 'next/font/google';

import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Canon — Truth Alignment Layer',
  description: 'Keep shared understanding aligned with reality as systems change.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-black text-white antialiased overflow-x-hidden">
        <div className="app-shell">
          <div className="app-shell__backdrop" aria-hidden="true">
            <div className="app-shell__grid" />
          </div>
          <div className="relative z-10">{children}</div>
        </div>
      </body>
    </html>
  );
}
