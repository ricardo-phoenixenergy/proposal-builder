import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @proposal/shared ships raw TypeScript from the workspace; Next must
  // transpile it rather than treat it as pre-built node_modules code.
  transpilePackages: ["@proposal/shared"],
};

export default nextConfig;
