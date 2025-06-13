import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/firestarter-proxy-test',
  assetPrefix: '/firestarter-proxy-test',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.google.com',
        pathname: '/s2/favicons**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
