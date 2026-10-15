import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@standix/ui", "@standix/types"],
};

export default nextConfig;
