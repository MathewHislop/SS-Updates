#!/usr/bin/env node
/**
 * Site Sparrow icon pipeline.
 *
 *   node build/generate-icons.js
 *
 * Turns the brand master artwork into the icon files electron-builder consumes.
 *
 *   INPUT    build/site-sparrow-icon-source.png   <- the master. Committed, never generated.
 *   OUTPUTS  build/icon.png                       <- what electron-builder.json points at
 *            build/icon.ico                       <- Windows/NSIS, multi-resolution
 *            build/icon.icns                      <- macOS .app bundle
 *
 * The three outputs are DERIVED. Never hand-edit them; re-run this script instead.
 *
 * Source image requirements (enforced below, not just documented):
 *   - PNG, square, at least 512x512 (1024x1024 strongly preferred)
 *   - true alpha channel (transparent background, not white)
 *
 * Dependencies: none beyond what electron-builder already pulls in. This shells
 * out to app-builder-bin, the same binary electron-builder uses internally for
 * icon conversion, so the .ico/.icns produced here are byte-for-byte what a real
 * build would produce. Deliberately avoids adding sharp/ImageMagick/
 * electron-icon-builder — a rebrand is not worth a new supply-chain dependency,
 * and there is no machine-wide ImageMagick on this box anyway.
 *
 * NOTE ON SVG: if the master arrives as an SVG rather than a PNG, this script
 * cannot consume it — none of the already-installed tooling rasterises SVG.
 * Export a 1024x1024 transparent PNG from the SVG first.
 *
 * NOTE ON SCOPE: this script only touches build/. The web favicon under
 * client/public/ is owned by the client app, not the Electron shell.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BUILD_DIR = __dirname;
const SOURCE = path.join(BUILD_DIR, "site-sparrow-icon-source.png");
const PROJECT_ROOT = path.join(BUILD_DIR, "..");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_EDGE = 512;

function fail(message, hint) {
  console.error(`\n  [icons] ${message}`);
  if (hint) console.error(`          ${hint}`);
  console.error("");
  process.exit(1);
}

/** Parse a PNG IHDR without pulling in an image library. */
function readPngHeader(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(33);
  try {
    fs.readSync(fd, head, 0, 33, 0);
  } finally {
    fs.closeSync(fd);
  }

  if (!head.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(
      `${path.basename(file)} is not a PNG file.`,
      "Export a transparent PNG master (SVG and JPEG are both unusable here)."
    );
  }

  return {
    width: head.readUInt32BE(16),
    height: head.readUInt32BE(20),
    bitDepth: head[24],
    // 6 = RGBA, 4 = grayscale+alpha, 3 = palette (may carry a tRNS chunk)
    colorType: head[25],
  };
}

function validateSource() {
  if (!fs.existsSync(SOURCE)) {
    fail(
      `missing master artwork at build/${path.basename(SOURCE)}`,
      "Drop the transparent >=1024x1024 Site Sparrow bird-mark PNG there, then re-run."
    );
  }

  const { width, height, colorType, bitDepth } = readPngHeader(SOURCE);

  if (width !== height) {
    fail(
      `master artwork must be square, got ${width}x${height}.`,
      "App icons are rendered square on every platform; a non-square source gets distorted or letterboxed."
    );
  }
  if (width < MIN_EDGE) {
    fail(
      `master artwork is ${width}x${width}; needs to be at least ${MIN_EDGE}x${MIN_EDGE}.`,
      "macOS .icns wants a 1024x1024 top layer. Upscaling a small source produces a visibly soft icon."
    );
  }
  if (colorType !== 6 && colorType !== 4 && colorType !== 3) {
    fail(
      `master artwork has no alpha channel (PNG colour type ${colorType}).`,
      "Re-export with a transparent background, otherwise the icon ships with an opaque rectangle behind it."
    );
  }
  if (colorType === 3) {
    console.warn(
      "  [icons] warning: palette PNG. Transparency may be limited/binary — prefer a 32-bit RGBA export."
    );
  }

  console.log(`  [icons] source ok: ${width}x${height}, ${bitDepth}-bit, colour type ${colorType}`);
  return { width, height };
}

function convert(format) {
  const { appBuilderPath } = require("app-builder-bin");
  const stdout = execFileSync(
    appBuilderPath,
    [
      "icon",
      "--format", format,
      // app-builder silently returns {"isFallback":true} and writes nothing when
      // handed a relative path. Absolute paths only.
      "--input", path.resolve(SOURCE),
      "--out", path.resolve(BUILD_DIR),
      "--root", path.resolve(PROJECT_ROOT),
    ],
    { encoding: "utf8" }
  );

  const result = JSON.parse(stdout);
  if (result.isFallback || !result.icons || result.icons.length === 0) {
    fail(
      `app-builder could not produce a .${format} from the master artwork.`,
      `Raw output: ${stdout.trim()}`
    );
  }
  for (const icon of result.icons) {
    console.log(`  [icons] wrote ${path.relative(PROJECT_ROOT, icon.file)} (${icon.size}px)`);
  }
}

function main() {
  console.log("\n  Site Sparrow icon pipeline\n");

  validateSource();

  // electron-builder.json points `icon` at build/icon.png and derives whatever
  // per-platform format each target needs. Keeping icon.png as a straight copy
  // of the master means no resampling happens here that electron-builder would
  // not do itself, at higher quality, at build time.
  fs.copyFileSync(SOURCE, path.join(BUILD_DIR, "icon.png"));
  console.log("  [icons] wrote build/icon.png (copy of master)");

  // Explicit .ico/.icns so the artefacts are inspectable and diffable in the
  // repo rather than materialising invisibly inside a build.
  convert("ico");
  convert("icns");

  console.log("\n  Done. Verify build/icon.ico at 16px and 32px before shipping —");
  console.log("  a detailed bird mark can turn to mush at taskbar size.\n");
}

main();
