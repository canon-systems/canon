import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "./layout-client";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Canon - Automated Knowledge Infrastructure",
  description: "Automatically generate clear, non-technical summaries that explain the business purpose and value of any code.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, session } = await getSession();

  return (
    <html lang="en" className="dark">
      <body className={`min-h-screen bg-black text-white antialiased ${inter.variable} ${spaceGrotesk.variable}`}>
        <RootLayoutClient user={user} session={session}>
          {children}
        </RootLayoutClient>
      </body>
    </html>
  );
}
