import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module — must stay external to the bundler (same as agents/ui).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
