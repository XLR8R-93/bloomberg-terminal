import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'static2.finnhub.io' },
      { protocol: 'https', hostname: 'logo.clearbit.com' },
    ],
  },
}

export default nextConfig
