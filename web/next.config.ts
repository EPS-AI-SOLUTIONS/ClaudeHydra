import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ollama proxy is now handled by Hono API layer
  // Storage migrated from SQLite to Upstash Redis — no native packages needed
};

export default nextConfig;
