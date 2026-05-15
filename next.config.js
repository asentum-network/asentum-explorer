/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  async rewrites() {
    return [
      // Expose the faucet relay at /dev/faucet too, so callers that
      // already construct ${base}/dev/faucet (the wallet bot) just work.
      { source: '/dev/faucet', destination: '/api/dev/faucet' },
    ];
  },
};

module.exports = nextConfig;
