import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Ensure packages using Node.js APIs are not bundled for Edge Runtime
  // This prevents Next.js from trying to bundle these packages, which may use __dirname
  experimental: {
    serverComponentsExternalPackages: [
      // Nango packages
      '@nangohq/node',
      // GitHub/Octokit packages  
      '@octokit/rest',
      '@octokit/core',
      '@octokit/auth-token',
      '@octokit/request',
      '@octokit/request-error',
      '@octokit/graphql',
      '@octokit/types',
      // File processing packages
      'jszip',
      'turndown',
      'marked',
      'node-html-parser',
      // Supabase packages (may have Node.js dependencies)
      '@supabase/supabase-js',
      // Note: '@supabase/ssr' is Edge-compatible and should NOT be externalized
      // Externalizing it causes bundling issues in middleware (Edge Runtime)
      // Other potential Node.js packages
      'dagre',
      'simple-icons',
    ],
  },
  webpack: (config, { isServer }) => {
    // Fix for Edge Runtime __dirname issue
    // Prevent Node.js-specific modules from being bundled for Edge Runtime
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Additional configuration for Edge Runtime compatibility
    config.resolve.alias = {
      ...config.resolve.alias,
    };

    return config;
  },
};

export default nextConfig;
