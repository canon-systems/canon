import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Ensure packages using Node.js APIs are not bundled for Edge Runtime
  // This prevents Next.js from trying to bundle these packages, which may use __dirname
  serverExternalPackages: [
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
  // Webpack config for API routes (server-side) to handle __dirname polyfill
  // Note: middleware uses esbuild, not webpack, so this only affects API routes
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      // Provide Node.js globals for server-side bundles
      // This ensures __dirname and __filename are available for dependencies
      config.node = {
        ...config.node,
        __dirname: true,
        __filename: true,
      };
    }
    return config;
  },
};

export default nextConfig;
