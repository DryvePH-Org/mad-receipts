import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next", // the browser tests use their own folder so they can run beside `npm run dev`
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
