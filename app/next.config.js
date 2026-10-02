/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Always define these so the bundler inlines literals and drops dead branches.
  // In particular NEXT_PUBLIC_FIXTURES must be a literal "0" in production builds,
  // otherwise the fixtures module would be bundled behind a runtime check.
  env: {
    NEXT_PUBLIC_FIXTURES: process.env.NEXT_PUBLIC_FIXTURES === '1' ? '1' : '0',
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com',
  },
  basePath: '/drawsol',
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;
