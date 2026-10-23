import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `npm test`: the money, price list, numbering and import rules, run without a browser.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", setupFiles: ["./tests/setup.ts"], include: ["tests/**/*.test.ts"] },
});
