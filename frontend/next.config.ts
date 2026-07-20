import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        qrcode: require.resolve("qrcode/lib/browser.js"),
      };
    }
    return config;
  },
};

export default nextConfig;
