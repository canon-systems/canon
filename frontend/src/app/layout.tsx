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
  title: "Canon - Technical GTM Readiness Platform",
  description: "Canon gets new hires customer-ready faster and keeps field teams current as products, pricing, positioning, and processes change.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, session } = await getSession();

  return (
    <html lang="en">
      <body className={`min-h-screen antialiased ${inter.variable} ${interDisplay.variable}`}>
        <RootLayoutClient user={user} session={session}>
          {children}
        </RootLayoutClient>
        <Toaster />
      </body>
    </html>
  );
}
