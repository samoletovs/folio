import { basename } from 'node:path';
import { unzipSync } from 'fflate';
import {
  addonRoot, archiveEntries, archivePath, isMainModule, loadPublicFiles, readPublicFile,
} from './public-files.mjs';

export function validateArchive(archive, expectedFiles) {
  const names = [];
  const files = unzipSync(archive, {
    filter: (file) => { names.push(file.name); return true; },
  });
  names.sort();
  if (JSON.stringify(names) !== JSON.stringify([...archiveEntries].sort())) {
    throw new Error('Archive must contain only manifest.json, dist/addon.js, README.md and LICENSE.');
  }
  for (const name of archiveEntries) {
    if (!Buffer.from(files[name]).equals(expectedFiles[name])) {
      throw new Error('Archive contents must match the validated public build inputs.');
    }
  }
}

export async function validatePackage(root = addonRoot) {
  const { pkg, files } = await loadPublicFiles(root);
  const output = archivePath(root, pkg);
  const archive = await readPublicFile(root, 'out', basename(output));
  validateArchive(archive, files);
  return output;
}

if (isMainModule(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('validate:package does not accept arbitrary archives.');
    await validatePackage();
    console.log('Package validation passed: exact public-file allowlist and matching contents.');
  } catch (error) {
    console.error(`Package validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
