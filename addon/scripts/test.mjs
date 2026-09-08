import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { addonRoot, isMainModule } from './paths.mjs';

export async function discoverTests(root = addonRoot) {
  const entries = await readdir(join(root, 'tests'), { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && /\.test\.(?:ts|mjs)$/.test(entry.name))
    .map((entry) => join('tests', entry.name)).sort();
  if (files.length === 0) throw new Error('No tests/*.test.ts or tests/*.test.mjs files were found.');
  return files;
}

if (isMainModule(import.meta.url)) {
  try {
    const files = await discoverTests();
    const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
      cwd: addonRoot,
      stdio: 'inherit',
    });
    if (result.error) throw new Error('Could not start the Node test runner.');
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
