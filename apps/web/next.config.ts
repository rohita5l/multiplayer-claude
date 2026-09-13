import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // Keep the sandbox SDK and the agent bundle out of the client/edge bundles and make the
  // bundle available to the serverless functions that write it into sandboxes.
  serverExternalPackages: ["@vercel/sandbox"],
  outputFileTracingIncludes: {
    "/api/sessions/**": ["./agent-dist/**"],
  },
};

export default nextConfig;
