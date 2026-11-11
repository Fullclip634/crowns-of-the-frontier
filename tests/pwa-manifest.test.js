import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

// An installable web app is defined by its manifest. A missing icon or a
// relative start_url is the difference between a real install prompt and a
// bookmark, so the fields browsers actually require are asserted here.
test('the web app manifest declares everything an install prompt needs', () => {
  assert.equal(manifest.name, 'Crowns of the Frontier');
  assert.ok(manifest.short_name && manifest.short_name.length <= 12, 'short_name fits under a home screen icon');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/', 'scope is explicit so the app cannot be opened out of context');
  assert.equal(manifest.id, '/', 'a stable id keeps the install identity across start_url changes');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.lang, 'en');
  assert.ok(manifest.categories.includes('games'));
  assert.ok(manifest.display_override.includes('standalone'), 'a fallback display mode is offered when fullscreen is refused');
});

test('every declared icon exists and a maskable 192 and 512 are provided', () => {
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);
  const sizes = new Set();
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('/'), `${icon.src} is rooted, so it resolves from any route`);
    const file = new URL(`../public${icon.src}`, import.meta.url);
    assert.ok(fs.existsSync(file), `${icon.src} is present in public/`);
    assert.ok(fs.statSync(file).size > 0, `${icon.src} is not empty`);
    if (icon.purpose?.includes('maskable')) sizes.add(icon.sizes);
  }
  assert.ok(sizes.has('192x192'), 'a maskable 192 icon is declared');
  assert.ok(sizes.has('512x512'), 'a maskable 512 icon is declared');
});

test('the manifest stays small enough to parse before first paint', () => {
  const bytes = fs.statSync(new URL('../public/manifest.webmanifest', import.meta.url)).size;
  assert.ok(bytes < 4096, `manifest is ${bytes} bytes`);
});
