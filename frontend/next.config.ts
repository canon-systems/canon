import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Ensure packages using Node.js APIs are not bundled for Edge Runtime
  experimental: {
    serverComponentsExternalPackages: [
      '@nangohq/node',
      '@octokit/rest',
      'jszip',
      'turndown',
      'marked',
      'node-html-parser',
    ],
  },
};

export default nextConfig;
