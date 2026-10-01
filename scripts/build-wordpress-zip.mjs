/**
 * Build the WordPress plugin and zip it into the Consentful portal, which
 * serves it at /downloads/consentful-wordpress.zip (linked from the docs and
 * the homepage "Get the plugin" menu).
 *
 *   npm run build:wordpress-zip
 *
 * Expects the portal repo as a sibling: ../consentful-portal. Commit the zip
 * there (apps/web/public/downloads) and deploy the dashboard. The zip's top
 * folder is `consentful/`, as wp-admin → Plugins → Upload expects.
 *
 * The zip is written with Node's zlib (no `zip`/`tar` binary), so it works the
 * same on Windows, macOS and Linux.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = resolve(root, 'apps/wordpress-plugin/plugin');
const outDir = resolve(root, '../consentful-portal/apps/web/public/downloads');
const out = resolve(outDir, 'consentful-wordpress.zip');

if (!existsSync(resolve(outDir, '..'))) {
  console.error(`✖ Portal public folder not found at ${resolve(outDir, '..')}`);
  process.exit(1);
}
execSync('npm run build --workspace=apps/wordpress-plugin', { cwd: root, stdio: 'inherit' });

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

const files = walk(join(pluginDir, 'consentful')).map((full) => ({
  name: relative(pluginDir, full).split(sep).join('/'),
  data: readFileSync(full),
}));
mkdirSync(outDir, { recursive: true });
writeFileSync(out, zip(files));
console.log(`✔ WordPress plugin zipped (${files.length} files) to ${out}`);
