import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { RootLayoutClient } from "./layout-client";
import { Toaster } from "@/components/ui/sonner";
import { CLERK_LOCALIZATION } from "@/lib/clerk-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Canon - Technical GTM Readiness Platform",
  description: "Canon gets new hires customer-ready faster and keeps field teams current as products, pricing, positioning, and processes change.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ClerkProvider localization={CLERK_LOCALIZATION}>
          <RootLayoutClient>
            {children}
          </RootLayoutClient>
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
