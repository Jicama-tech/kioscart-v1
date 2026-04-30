// One-shot: converts public/assets/step-*.png to .webp.
// Run from repo root: node frontend/scripts/convert-step-images.mjs
import { readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const requireFromBackend = createRequire(resolve(here, "../../backend/package.json"));
const sharp = requireFromBackend("sharp");

const ASSETS = resolve(here, "../public/assets");

const files = (await readdir(ASSETS)).filter((f) => /^step-\d+\.png$/i.test(f));
if (files.length === 0) {
  console.log("No step-*.png files found in", ASSETS);
  process.exit(0);
}

let savedTotal = 0;
for (const file of files) {
  const src = join(ASSETS, file);
  const dst = join(ASSETS, file.replace(/\.png$/i, ".webp"));
  const before = (await stat(src)).size;
  await sharp(src).webp({ quality: 82, effort: 5 }).toFile(dst);
  const after = (await stat(dst)).size;
  savedTotal += before - after;
  console.log(
    `${file}: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB ` +
      `(${(((before - after) / before) * 100).toFixed(0)}% smaller)`,
  );
}
console.log(`\nTotal saved: ${(savedTotal / 1024).toFixed(0)} KB`);
