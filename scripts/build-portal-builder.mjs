/**
 * Build the embed builder and copy it into the Consentful dashboard, which
 * serves it same-origin at /builder (dashboard "Websites" → Edit banner).
 *
 *   npm run build:portal-builder
 *
 * Expects the portal repo as a sibling: ../consentful-portal. Commit the
 * copied files there (apps/web/public/builder) and deploy the dashboard.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'apps/embed-config/dist');
const target = resolve(root, '../consentful-portal/apps/web/public/builder');

if (!existsSync(resolve(target, '..'))) {
  console.error(`✖ Portal web app not found at ${resolve(target, '..')}`);
  process.exit(1);
}
execSync('npm run build --workspace=apps/embed-config', { cwd: root, stdio: 'inherit' });
rmSync(target, { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
console.log(`✔ Builder copied to ${target}`);
