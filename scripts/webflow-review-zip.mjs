/**
 * Build the Webflow Designer Extension and package both Marketplace uploads
 * from that ONE build, so the bundle and the review material always match:
 *
 *   - apps/webflow-app/bundle.zip — the extension bundle (Webflow CLI), with
 *     no source maps inside;
 *   - marketing/store-assets/upload/webflow/consentful-webflow-review.zip — the
 *     review ZIP Webflow asks for: the source maps, package.json files and the
 *     lockfile from this exact build, plus a short README.
 *
 *   node scripts/webflow-review-zip.mjs
 *
 * Needs apps/webflow-app/.env with VITE_WORKER_BASE (see .env.example).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(root, 'apps/webflow-app');
const outDir = resolve(root, 'marketing/store-assets/upload/webflow');
const mapsDir = resolve(outDir, 'sourcemaps');

if (!existsSync(resolve(appDir, '.env'))) {
  console.error('✖ apps/webflow-app/.env is missing (VITE_WORKER_BASE). Copy .env.example first.');
  process.exit(1);
}

/** Every file under `dir`, recursively. */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Minimal ZIP (deflate) writer: local headers + central directory. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + deflated.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// 1. One build. The shared packages first, so the app compiles against fresh dist.
execSync('npm run build --workspace=shared', { cwd: root, stdio: 'inherit' });
execSync('npx vite build', { cwd: appDir, stdio: 'inherit' });

// 2. Move the source maps out of the bundle folder into the review material.
rmSync(mapsDir, { recursive: true, force: true });
const publicDir = resolve(appDir, 'public');
const maps = walk(publicDir).filter((f) => f.endsWith('.map'));
for (const map of maps) {
  const dest = resolve(mapsDir, relative(publicDir, map));
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(map, dest);
}

// 3. The extension bundle, via Webflow's own CLI.
rmSync(resolve(appDir, 'bundle.zip'), { force: true });
execSync('npx webflow extension bundle --no-input --skip-update-check', { cwd: appDir, stdio: 'inherit' });

// 4. The review ZIP.
const bundleJs = walk(publicDir)
  .filter((f) => /index-.*\.js$/.test(f))
  .map((f) => relative(publicDir, f).split(sep).join('/'));
const runtimeVersion = /RUNTIME_VERSION = "([^"]+)"/.exec(readFileSync(resolve(root, 'shared/src/runtime-cdn.ts'), 'utf8'))[1];
// The Data Client Worker ships as source (Cloudflare runs it from source), with
// its tests and the reproducible live auth check, so reviewers can read and
// re-run everything the backend claims.
const workerSources = [
  'apps/webflow-app/src/worker.ts',
  'apps/webflow-app/src/oauth.ts',
  'apps/webflow-app/src/webflow-api-client.ts',
  'apps/webflow-app/wrangler.toml',
  'tests/webflow-worker.test.ts',
  'tests/webflow-oauth.test.ts',
  'tests/webflow-api-client.test.ts',
  'scripts/webflow-auth-check.mjs',
];
const readme = `# Consentful for Webflow: review material

Built from https://github.com/thepluginsco/framer-cookie-consent (npm workspaces).
This ZIP holds the source maps, package.json files and lockfile of the exact build
that produced the submitted bundle (${bundleJs.join(', ')}), plus the source of
the Data Client Worker and its tests.

Runtime: ${runtimeVersion}. The bundle, the deployed Worker and the review site
all register https://cdn.jsdelivr.net/gh/thepluginsco/framer-cookie-consent@${runtimeVersion}/runtime/dist/consent.min.js
with its SRI hash (shared/src/runtime-cdn.ts, RUNTIME_VERSION + RUNTIME_INTEGRITY).

## Verify the backend yourself

    node scripts/webflow-auth-check.mjs           # live Worker: 401/403/400 matrix
    npx vitest run tests/webflow-worker.test.ts tests/webflow-oauth.test.ts

## Rebuild

    npm ci
    cp apps/webflow-app/.env.example apps/webflow-app/.env   # set VITE_WORKER_BASE
    node scripts/webflow-review-zip.mjs

The Designer Extension is apps/webflow-app (src/designer). It reuses the shared
editor UI (shared-ui/) and config engine (shared/). The Data Client Worker that
holds the OAuth token is apps/webflow-app/src/worker.ts (Cloudflare Workers).

## Security notes

- Every Worker /api/* request carries the Designer user's ID token
  (webflow.getIdToken()) as "Authorization: Bearer". The Worker resolves it with
  Webflow (POST /beta/token/resolve) and requires the resolved siteId to match
  the request; otherwise it answers 401 (no token) or 403 (other site, expired,
  forged). Tests: tests/webflow-worker.test.ts.
- The license key is never sent to, stored by or served from the Worker.
- The banner script written to the site is pinned to an immutable release tag
  and carries a Subresource Integrity hash; callers cannot choose the script URL.
`;
const reviewFiles = [
  ...walk(mapsDir).map((f) => ({ name: `sourcemaps/${relative(mapsDir, f).split(sep).join('/')}`, data: readFileSync(f) })),
  { name: 'package.json', data: readFileSync(resolve(root, 'package.json')) },
  { name: 'package-lock.json', data: readFileSync(resolve(root, 'package-lock.json')) },
  { name: 'apps/webflow-app/package.json', data: readFileSync(resolve(appDir, 'package.json')) },
  { name: 'apps/webflow-app/webflow.json', data: readFileSync(resolve(appDir, 'webflow.json')) },
  { name: 'shared/package.json', data: readFileSync(resolve(root, 'shared/package.json')) },
  { name: 'shared-ui/package.json', data: readFileSync(resolve(root, 'shared-ui/package.json')) },
  ...workerSources.map((f) => ({ name: f, data: readFileSync(resolve(root, f)) })),
  { name: 'README.md', data: Buffer.from(readme, 'utf8') },
];
mkdirSync(outDir, { recursive: true });
const reviewZip = resolve(outDir, 'consentful-webflow-review.zip');
writeFileSync(reviewZip, zip(reviewFiles));
console.log(`✔ bundle: ${resolve(appDir, 'bundle.zip')}`);
console.log(`✔ review ZIP (${reviewFiles.length} files): ${reviewZip}`);
