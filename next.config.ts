import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'static2.finnhub.io' },
      { protocol: 'https', hostname: 'logo.clearbit.com' },
    ],
  },
}

export default nextConfig
