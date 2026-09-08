import { lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { addonRoot, assertDirectory, isMainModule } from './paths.mjs';

export async function cleanDist(root = addonRoot) {
  await assertDirectory(root);
  const dist = join(root, 'dist');
  try {
    await lstat(dist);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  await assertDirectory(dist);
  await rm(dist, { recursive: true, force: true });
}

if (isMainModule(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('clean does not accept a path or other arguments.');
    await cleanDist();
    console.log('Cleaned addon/dist only.');
  } catch (error) {
    console.error(`Clean failed: ${error.message}`);
    process.exitCode = 1;
  }
}
