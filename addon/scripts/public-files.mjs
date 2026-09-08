import { lstat, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { addonRoot, assertDirectory } from './paths.mjs';
export { addonRoot, assertDirectory, isMainModule } from './paths.mjs';

export const archiveEntries = Object.freeze(['manifest.json', 'dist/addon.js', 'README.md', 'LICENSE']);
// Verified against SDK 2's permission APIs; kept local to avoid loading the browser SDK in Node.
export const requiredPermissions = Object.freeze({
  ui: ['sidebar.addItem', 'router.add'],
  accounts: ['getAll'],
  portfolio: ['getHoldings'],
  settings: ['get'],
  events: ['onUpdateStart', 'onUpdateComplete', 'onUpdateError'],
  files: ['openSaveDialog'],
});

export async function readPublicFile(root, ...segments) {
  await assertDirectory(root);
  let path = root;
  for (const segment of segments.slice(0, -1)) {
    path = join(path, segment);
    await assertDirectory(path);
  }
  path = join(path, segments.at(-1));
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || info.size === 0) {
    throw new Error('Public package inputs must be nonempty regular files, not links.');
  }
  return readFile(path);
}

export function validateMetadata(manifest, pkg) {
  if (manifest.id !== 'folio' || manifest.name !== 'folio'
    || !/^[a-z0-9][a-z0-9-]*$/.test(pkg.name)
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)
    || manifest.version !== pkg.version || manifest.license !== pkg.license
    || manifest.license !== 'MIT' || manifest.main !== 'dist/addon.js'
    || pkg.main !== manifest.main || manifest.sdkVersion !== '2.0.0'
    || manifest.minWealthfolioVersion !== '2.0.0') {
    throw new Error('Package and manifest metadata must agree on version, entry point, license and the SDK 2 contract.');
  }
  if (!Array.isArray(manifest.permissions)
    || manifest.permissions.length !== Object.keys(requiredPermissions).length) {
    throw new Error('Manifest must declare exactly the required read-only permission categories.');
  }
  const seen = new Set();
  for (const permission of manifest.permissions) {
    const expected = Object.hasOwn(requiredPermissions, permission?.category) ? requiredPermissions[permission.category] : undefined;
    if (!expected || seen.has(permission.category)
      || typeof permission.purpose !== 'string' || !permission.purpose.trim()
      || !Array.isArray(permission.functions)
      || permission.functions.some((fn) => !fn || typeof fn !== 'object'
        || fn.isDeclared !== true || fn.isDetected !== false || fn.detectedAt !== undefined
        || !expected.includes(fn.name))) {
      throw new Error('Manifest permissions must use SDK 2 declared function objects and known functions.');
    }
    seen.add(permission.category);
    const declared = permission.functions.map((fn) => fn.name);
    if (declared.length !== expected.length || new Set(declared).size !== declared.length
      || expected.some((name) => !declared.includes(name))) {
      throw new Error('Manifest permissions must not omit required functions or grant additional access.');
    }
  }
}

export async function loadPublicFiles(root = addonRoot) {
  const pkg = JSON.parse(await readPublicFile(root, 'package.json'));
  const manifestBytes = await readPublicFile(root, 'manifest.json');
  const manifest = JSON.parse(manifestBytes);
  validateMetadata(manifest, pkg);
  const files = {
    'manifest.json': manifestBytes,
    'dist/addon.js': await readPublicFile(root, 'dist', 'addon.js'),
    'README.md': await readPublicFile(root, 'README.md'),
    LICENSE: await readPublicFile(dirname(root), 'LICENSE'),
  };
  return { pkg, manifest, files };
}

export function archivePath(root, pkg) {
  return join(root, 'out', `${pkg.name}-${pkg.version}.zip`);
}
