import { defineConfig } from "vitest/config";

// convex-test runs functions in an edge-like runtime; inline the package so its
// virtual module resolution works under Vitest.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
  },
});
