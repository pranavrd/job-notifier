import { defineConfig } from "vitest/config";

// Plain Node unit tests over the pure lib/ helpers — no DOM, no network.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
