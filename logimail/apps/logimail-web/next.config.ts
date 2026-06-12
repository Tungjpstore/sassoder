import type { NextConfig } from 'next';
import { join } from 'node:path';

const nextConfig: NextConfig = {
  turbopack: {
    root: join(process.cwd(), '../..'),
  },
  agentRules: false,
};

export default nextConfig;
