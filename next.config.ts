import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone", // a small self-contained server for the Docker image
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    authInterrupts: true, // enables forbidden() for admin-only pages
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
