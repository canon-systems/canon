import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "./layout-client";
import { getSession } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CodeSense - Business Intelligence",
  description: "Automatically generate clear, non-technical summaries that explain the business purpose and value of any code.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, session } = await getSession();

  return (
    <html lang="en">
      <body className={inter.className}>
        <RootLayoutClient user={user} session={session}>
          {children}
        </RootLayoutClient>
      </body>
    </html>
  );
}
