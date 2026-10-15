/* Validate store artwork without adding any extension dependencies. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const output = path.join(__dirname,'assets');
const manifest = JSON.parse(fs.readFileSync(path.join(output,'asset-manifest.json'),'utf8'));
assert.equal(manifest.files.length,8);
const checksums = [];
for (const file of manifest.files) {
  const buffer = fs.readFileSync(path.join(output,file.file));
  assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(buffer.readUInt32BE(16),file.width);
  assert.equal(buffer.readUInt32BE(20),file.height);
  assert.equal(buffer[24],8);
  // Chrome-generated screenshots/promo canvases must be opaque RGB PNGs;
  // only the packaged icon is allowed to retain alpha transparency.
  if (!file.file.startsWith('icon-')) assert.equal(buffer[25],2);
  checksums.push(crypto.createHash('sha256').update(buffer).digest('hex')+'  '+file.file);
}
assert.equal(manifest.files.filter(file=>file.kind==='annotated-ui-screenshot').length,5);
assert.equal(manifest.nativeDownloadsPerformed,false);
for (const relative of ['README.md','listing-ko.md','../PRIVACY.md']) {
  const filename = path.resolve(__dirname,relative);
  const text = fs.readFileSync(filename,'utf8');
  for (const match of text.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
    const target = decodeURIComponent(match[1].split('#')[0]);
    assert.ok(fs.existsSync(path.resolve(path.dirname(filename),target)),'missing_local_document_link');
  }
}
fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),checksums.join('\n')+'\n');
console.log('[store] asset_dimensions_format_and_local_links_pass files='+manifest.files.length);
