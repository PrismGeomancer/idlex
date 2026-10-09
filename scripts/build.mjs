import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { bundleOptions } from "./bundle-config.mjs";

await build(bundleOptions);

await writeFile(join(dirname(bundleOptions.outfile), ".nojekyll"), "");
