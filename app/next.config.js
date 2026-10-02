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
  // every route is a folder with its own index.html (draw/index.html), so /drawsol/draw/?n=0 resolves on
  // GitHub Pages and any static host; /drawsol/draw redirects to it
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // the generated IDL ships without its developer `docs` (the file itself is never edited)
    config.module.rules.push({
      test: /[\\/]idl[\\/]drawsol\.json$/,
      use: [{ loader: require('path').resolve(__dirname, 'scripts/strip-idl-docs.cjs') }],
    });
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
