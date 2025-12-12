import dotenv from "dotenv"
import esbuild from "esbuild"
import path from "path"
import { fileURLToPath } from "url"

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin to resolve absolute imports from lib directory
const absoluteImportsPlugin = {
  name: 'absolute-imports',
  setup(build) {
    build.onResolve({ filter: /^[^.\/]/ }, args => {
      // Skip node_modules packages
      if (args.path.startsWith('dotenv') ||
          args.path.startsWith('esbuild') ||
          args.path.startsWith('isomorphic-fetch')) {
        return null;
      }

      // Resolve from lib directory and add .js extension
      const libPath = path.join(__dirname, 'lib', args.path + '.js');
      return { path: libPath };
    });
  },
};

// Adapted from Lucian
const result = await esbuild.build({
  entryPoints: [`lib/plugin.js`],
  bundle: true,
  format: "iife",
  // minify: true,
  outfile: "build/compiled.js",
  packages: "external",
  platform: "node",
  plugins: [absoluteImportsPlugin],
  write: true,
});
console.log("Result was", result)
