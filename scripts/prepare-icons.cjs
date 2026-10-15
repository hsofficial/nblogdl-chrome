/* Prepare Chrome icon sizes from the generated master; no visual redraw.
 * Sharp is an optional development dependency, never an extension dependency.
 * Set SHARP_PATH to a bundled package path when it is not installed normally.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.SHARP_PATH || 'sharp');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'nblog-icon-source.png');
const output = path.join(root, 'extension', 'icons');
async function main() {
  fs.mkdirSync(output, {recursive: true});
  for (const size of [16, 32, 48, 128]) {
    await sharp(source).resize(size, size, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
      .png().toFile(path.join(output, `icon-${size}.png`));
    console.log(`[icon] prepared size=${size}`);
  }
}
main().catch(() => {console.error('[icon] preparation_failed'); process.exitCode = 1;});
