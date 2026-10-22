import type { NextConfig } from "next";
const api_origin = process.env.COS_API_ORIGIN ?? "http://127.0.0.1:8080";
const next_config: NextConfig = {
  devIndicators: false,
  distDir: process.env.COS_NEXT_DIST_DIR ?? ".next",
  async rewrites() {
    return [
      {
        source: "/api/v1/cos/:path*",
        destination: `${api_origin}/api/v1/cos/:path*`,
      },
    ];
  },
};
export default next_config;
