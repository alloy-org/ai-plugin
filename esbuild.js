import dotenv from "dotenv"
import esbuild from "esbuild"

dotenv.config();

// Adapted from Lucian
const result = await esbuild.build({
  entryPoints: [`lib/plugin.js`],
  bundle: true,
  format: "iife",
  // minify: true,
  outfile: "build/compiled.js",
  packages: "external",
  platform: "node",
  write: true,
});
console.log("Result was", result)
