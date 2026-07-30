import type { NextConfig } from 'next';

/**
 * `standalone` output makes the Railway image markedly smaller: Next.js traces
 * the modules actually reached and copies only those, rather than shipping the
 * whole node_modules tree.
 */
const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
