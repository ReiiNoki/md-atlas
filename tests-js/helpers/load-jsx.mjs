// Test-only JSX compilation using the existing Vite toolchain. This is not
// website SSR and is never imported into the production application.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export async function loadJsxModules(...paths) {
  const server = await createServer({
    // Vite 6 must see one Windows drive spelling, or relative imports can
    // instantiate a second React/i18n context under c:/ versus C:/.
    root: fileURLToPath(new URL("../../", import.meta.url)).replace(/^([a-z]):/, (_, drive) => `${drive.toUpperCase()}:`),
    configFile: false, plugins: [react()], logLevel: "silent",
    server: { middlewareMode: true, watch: null }, appType: "custom",
  });
  try {
    return await Promise.all(paths.map((path) => server.ssrLoadModule(path)));
  } finally {
    await server.close();
  }
}
