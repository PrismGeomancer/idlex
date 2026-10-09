import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const bundleOptions = {
  entryPoints: [resolve(project, "dist/app.js")],
  outfile: resolve(project, "dist/app.bundle.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  logLevel: "info",
};
