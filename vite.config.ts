import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { weatherApi } from "./server/vite-plugin.ts";

export default defineConfig({
  plugins: [react(), weatherApi()],
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
  },
});
