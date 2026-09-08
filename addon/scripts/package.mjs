import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, basename } from 'node:path';
import { zipSync } from 'fflate';
import { addonRoot, archivePath, assertDirectory, isMainModule, loadPublicFiles } from './public-files.mjs';
import { validateArchive } from './validate-package.mjs';

export async function packageAddon(root = addonRoot) {
  const { files, pkg } = await loadPublicFiles(root);
  const output = archivePath(root, pkg);
  await mkdir(dirname(output), { recursive: true });
  await assertDirectory(dirname(output));

  // Fixed timestamps and entry order make an unchanged build reproducible.
  const zipFiles = Object.fromEntries(Object.entries(files).map(([name, bytes]) =>
    [name, [bytes, { mtime: new Date(2000, 0, 1, 0, 0, 0) }]]));
  const archive = zipSync(zipFiles, { level: 9 });
  validateArchive(archive, files);

  const existing = await lstat(output).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error('Refusing to replace a non-regular archive output.');
  }
  // Write beside the output, never inside dist or through an existing link.
  const pending = `${output}.${randomUUID()}.pending`;
  const handle = await open(pending, 'wx');
  try {
    try {
      await handle.writeFile(archive);
    } finally {
      await handle.close();
    }
    await rename(pending, output);
  } finally {
    await rm(pending, { force: true });
  }
  return output;
}

if (isMainModule(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('package does not accept paths or additional inputs.');
    const output = await packageAddon();
    console.log(`Validated package: out/${basename(output)} (4 allowlisted files).`);
  } catch (error) {
    console.error(`Package failed: ${error.message}`);
    process.exitCode = 1;
  }
}
