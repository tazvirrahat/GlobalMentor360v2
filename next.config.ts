import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Overridable so a second dev server (verification) can run alongside the
  // primary one without fighting over .next/dev/lock. Defaults to .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
