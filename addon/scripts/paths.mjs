import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const addonRoot = fileURLToPath(new URL('..', import.meta.url));

export function isMainModule(url) {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === url;
}

export async function assertDirectory(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error('Expected a real directory; links and junctions are not allowed.');
  }
}
