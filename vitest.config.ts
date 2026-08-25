import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only this package's tests. `.inbox/` holds vendored checkouts (e.g. the
    // TypeScript SDK) whose own suites would otherwise be collected.
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", ".inbox/**", "hf-space/**"],
  },
});
