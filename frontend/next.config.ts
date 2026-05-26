import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: [
    '@octokit/rest',
    '@supabase/supabase-js',
    'crypto',
    'simple-icons',
  ],
};

export default nextConfig;
