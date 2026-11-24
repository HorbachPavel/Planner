import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/Planner",
  trailingSlash: true,
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
