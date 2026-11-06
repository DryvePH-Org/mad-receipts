import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next", // the browser tests use their own folder so they can run beside `npm run dev`
  /* config options here */
  poweredByHeader: false,
  output: "standalone", // a small self-contained server for the Docker image
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    authInterrupts: true, // enables forbidden() for admin-only pages
  },
  async headers() {
    // Safe defaults for every page. The microphone is allowed for the voice note; the camera for photos of documents.
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=(), payment=(), usb=()" },
        { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
      ],
    }];
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
