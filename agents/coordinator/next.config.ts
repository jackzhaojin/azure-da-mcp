import type { NextConfig } from "next";

// The Next.js side is database-free: reads proxy the A2A layer's /runs over
// loopback, writes go through /a2a. No native modules to externalize.
const nextConfig: NextConfig = {};

export default nextConfig;
