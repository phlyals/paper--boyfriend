import type { NextConfig } from "next";

const r2PublicBase = process.env.R2_PUBLIC_URL;
const r2Hostname = (() => {
  if (!r2PublicBase) return null;
  try {
    return new URL(r2PublicBase).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: r2Hostname
      ? [{ protocol: "https", hostname: r2Hostname }]
      : [],
  },
};

export default nextConfig;
