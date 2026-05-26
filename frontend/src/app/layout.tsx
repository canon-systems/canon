import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "./layout-client";
import { getSession } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
});

const interDisplay = Inter({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Canon - Onboarding Agent",
  description: "Proactive onboarding for technical GTM hires. Canon delivers AI-curated context from Slack at every ramp milestone.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, session } = await getSession();

  return (
    <html lang="en" className="dark">
      <body className={`min-h-screen antialiased ${inter.variable} ${interDisplay.variable}`}>
        <RootLayoutClient user={user} session={session}>
          {children}
        </RootLayoutClient>
        <Toaster />
      </body>
    </html>
  );
}
