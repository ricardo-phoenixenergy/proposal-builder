import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @proposal/shared ships raw TypeScript from the workspace; Next must
  // transpile it rather than treat it as pre-built node_modules code.
  transpilePackages: ["@proposal/shared"],
  // @vercel/nft fails to trace these when they are imported from the *transpiled*
  // @proposal/shared package, so they were omitted from the serverless bundle and
  // every route whose graph imports @proposal/shared 500'd on Vercel at module load
  // with "Cannot find module 'sanitize-html'". Marking them external forces Next and
  // Vercel to include them in the function at runtime. (postcss is also Next's own
  // dependency so it traced anyway, but list it for parity/safety.)
  serverExternalPackages: ["sanitize-html", "postcss", "postcss-selector-parser"],
};

export default nextConfig;
