import type { NextConfig } from "next";
const lan_host = process.env.COS_LAN_HOST?.trim();
const next_config: NextConfig = {
  devIndicators: false,
  distDir: process.env.COS_NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    ...(lan_host ? [lan_host] : []),
  ],
};
export default next_config;
