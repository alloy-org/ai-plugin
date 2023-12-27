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
    write: true, // Don't write to disk, return in outputFiles instead
});
console.log("Result was", result)

// Taken from internet recommendation on getting an esbuild https://medium.com/geekculture/build-a-library-with-esbuild-23235712f3c
// Will we actually need to build this? TBD
// esbuild
//     .build({
//         entryPoints: ["src/index.js"],
//         outdir: "lib",
//         bundle: true,
//         sourcemap: true,
//         minify: true,
//         splitting: true,
//         format: "esm",
//         target: ["esnext"]
//     })
//     .catch(() => process.exit(1));
