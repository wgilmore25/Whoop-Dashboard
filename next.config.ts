import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow server components to call the local Python FastAPI service
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};

export default nextConfig;
