/**
 * scripts/download-ffmpeg.mjs
 *
 * Downloads ffmpeg-core.js and ffmpeg-core.wasm to /public/ffmpeg/
 * so they are served same-origin — bypassing all CORS/COEP/blob-URL issues.
 *
 * Run automatically via "postinstall" in package.json.
 * Files are gitignored (large binaries should not be in the repo).
 */

import { createWriteStream, mkdirSync, existsSync } from "fs";
import { pipeline } from "stream/promises";
import { get } from "https";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.join(__dirname, "..", "public", "ffmpeg");
const VERSION   = "0.12.6";
const BASE_URL  = `https://unpkg.com/@ffmpeg/core@${VERSION}/dist/umd`;

const FILES = [
  "ffmpeg-core.js",
  "ffmpeg-core.wasm",
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      pipeline(res, file).then(resolve).catch(reject);
    }).on("error", reject);
  });
}

mkdirSync(OUT_DIR, { recursive: true });

let allPresent = true;
for (const f of FILES) {
  if (!existsSync(path.join(OUT_DIR, f))) { allPresent = false; break; }
}

if (allPresent) {
  console.log("✓ ffmpeg-core files already present in public/ffmpeg/");
  process.exit(0);
}

console.log(`Downloading ffmpeg-core@${VERSION} → public/ffmpeg/`);

for (const file of FILES) {
  const url  = `${BASE_URL}/${file}`;
  const dest = path.join(OUT_DIR, file);
  process.stdout.write(`  ${file}… `);
  try {
    await download(url, dest);
    console.log("✓");
  } catch (err) {
    console.error(`✗ failed: ${err.message}`);
    process.exit(1);
  }
}

console.log("✓ ffmpeg-core files ready.");
