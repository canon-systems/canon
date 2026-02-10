import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "./layout-client";
import { getSession } from "@/lib/auth";

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
  title: "Canon - Automated Knowledge Infrastructure",
  description: "Keep shared understanding aligned with reality across code, tools, and workflows.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, session } = await getSession();

  return (
    <html lang="en" className="dark">
      <body className={`min-h-screen bg-black text-white antialiased ${inter.variable} ${interDisplay.variable}`}>
        <RootLayoutClient user={user} session={session}>
          {children}
        </RootLayoutClient>
      </body>
    </html>
  );
}
