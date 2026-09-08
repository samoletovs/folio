import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(root, args, allowMissing = false) {
  try {
    return execFileSync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (allowMissing && error.status === 1) return '';
    throw new Error('A required Git query failed; the audit cannot safely continue.');
  }
}

function nulPaths(output) {
  return output.split('\0').filter(Boolean);
}

export function isPrivateDataPath(path) {
  const normalized = path.replaceAll('\\', '/')
    .replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
  const segments = normalized.split('/');
  const name = segments.at(-1);
  if (segments.slice(0, -1).some((segment) =>
    /^(?:\.me|private|vault|data|holdings|portfolio|statements|exports)$/.test(segment))) return true;
  if (/^\.env(?:$|\.)/.test(name) && !/^\.env\.(?:example|sample|template)$/.test(name)) return true;
  if (/(?:leak-patterns|personal-info-patterns)/.test(name)) return true;
  if (/\.(?:csv|tsv|ofx|qfx|qif|xlsx?|xlsm|enc|encrypted|aes|age|gpg|pgp|folio)$/.test(name)
    || /\.(?:db|sqlite3?)(?:-(?:wal|shm|journal))?$/.test(name)) return true;
  if (/(?:^|[._ -])private(?:[._ -]|$)/.test(name)) return true;
  if (/\.json(?:$|\.)/.test(name)
    && /(?:^|[._ -])(?:ips|policy|investment-policy|folio|vault|enc|encrypted|backup)(?:[._ -]|$)/.test(name)) return true;
  return /\.(?:json|xml|txt|pdf|zip|gz|7z)$/.test(name)
    && /(?:^|[._ -])(?:ips|policy|vault|encrypted|backup|holdings?|portfolio|statements?|transactions?|trades?|positions?|balances?|activity|flex(?:query|report)?|ibkr|degiro|broker|swedbank|luminor|capital-gains|tax-lots?)(?:[._ -]|$)/.test(name);
}

export function checkTrackedData(root = repositoryRoot, { history = false } = {}) {
  const names = nulPaths(git(root, ['ls-files', '--cached', '-z']));
  if (history) {
    names.push(...nulPaths(git(root, ['log', '--all', '--format=', '--name-only', '-z', '--diff-filter=ACMR'])));
  }
  const blocked = [...new Set(names.filter(isPrivateDataPath))];
  if (blocked.length) {
    // Names can themselves include private identifiers; report counts only.
    throw new Error(`Tracked-data check blocked ${blocked.length} private/financial path(s) in the index${history ? ' or history' : ''}. No names or contents were printed.`);
  }
  return new Set(names).size;
}

function isWithin(parent, path) {
  const child = relative(parent, path);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

export function validatePrivatePatterns(root, patternsFile) {
  if (!patternsFile || !isAbsolute(patternsFile)) {
    throw new Error('Configure an explicit absolute PRIVATE patterns file outside all repository worktrees.');
  }
  let path;
  try {
    path = realpathSync(patternsFile);
    if (!statSync(path).isFile()) throw new Error();
  } catch {
    throw new Error('The private patterns file is missing or is not a regular file.');
  }
  const worktrees = nulPaths(git(root, ['worktree', 'list', '--porcelain', '-z']))
    .filter((field) => field.startsWith('worktree ')).map((field) => field.slice(9));
  for (const worktree of [root, ...worktrees]) {
    if (isWithin(realpathSync(worktree), path)) {
      throw new Error('The PRIVATE patterns file must be outside every repository worktree, including linked paths.');
    }
  }
  let hasPatterns = false;
  try {
    hasPatterns = readFileSync(path, 'utf8').split(/\r?\n/)
      .some((line) => line.trim() && !line.trim().startsWith('#'));
  } catch {
    throw new Error('Cannot read the private patterns file.');
  }
  if (!hasPatterns) throw new Error('The private patterns file must contain at least one owner-supplied pattern.');
  return path;
}

function requireMatchingStagedFiles(root) {
  const staged = new Set(nulPaths(git(root, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])));
  const unstaged = nulPaths(git(root, ['diff', '--name-only', '-z']));
  // The canonical script reads working files, not index blobs. Fail closed for partial staging.
  if (unstaged.some((name) => staged.has(name))) {
    throw new Error('The private audit cannot verify partially staged files. Make staged and working versions agree, then retry.');
  }
}

function requireReachablePushes(root, input) {
  const reachable = new Set(git(root, ['rev-list', '--all']).trim().split(/\r?\n/));
  for (const line of input.toString('utf8').split(/\r?\n/).filter(Boolean)) {
    const fields = line.split(' ');
    if (fields.length !== 4 || !/^[0-9a-f]{40,64}$/.test(fields[1])) {
      throw new Error('Cannot validate outgoing push references.');
    }
    if (!/^0+$/.test(fields[1]) && !reachable.has(fields[1])) {
      throw new Error('Attach outgoing revisions to a local branch before pushing so the full-history audit can verify them.');
    }
  }
}

export function runHook(root, hook, hookArgs = [], pushInput = Buffer.alloc(0)) {
  if (hook !== 'pre-commit' && hook !== 'pre-push') throw new Error('Unsupported audit hook.');
  checkTrackedData(root, { history: hook === 'pre-push' });
  if (hook === 'pre-commit') requireMatchingStagedFiles(root);
  else requireReachablePushes(root, pushInput);
  const patterns = validatePrivatePatterns(root, git(root, ['config', '--local', '--get', 'folio.leakPatternsFile'], true).trim());

  // Force renamed staged files to appear as additions for the canonical -Staged scan.
  const env = { ...process.env };
  const configCount = Number(env.GIT_CONFIG_COUNT ?? 0);
  if (!Number.isSafeInteger(configCount) || configCount < 0) throw new Error('Invalid Git environment configuration.');
  env.GIT_CONFIG_COUNT = String(configCount + 1);
  env[`GIT_CONFIG_KEY_${configCount}`] = 'diff.renames';
  env[`GIT_CONFIG_VALUE_${configCount}`] = 'false';
  const args = [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-File', resolve(root, 'scripts', 'audit-leaks.ps1'),
    '-PatternsFile', patterns, '-LocalPatternsFile', patterns, '-Quiet',
    hook === 'pre-commit' ? '-Staged' : '-History',
  ];
  // The shared scanner prints matched values even with -Quiet: keep ALL its output local and suppressed.
  let result = spawnSync('pwsh', args, { cwd: root, env, stdio: 'ignore' });
  if (result.error?.code === 'ENOENT' && process.platform === 'win32') {
    result = spawnSync('powershell.exe', args, { cwd: root, env, stdio: 'ignore' });
  }
  if (result.error || result.status !== 0) {
    throw new Error('Private leak audit failed or could not run. Its output was suppressed to protect identifiers; review your staged files/history and private patterns locally.');
  }

  const previous = git(root, ['config', '--local', '--get', 'folio.previousHooksPath'], true).trim();
  if (previous) {
    const current = git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']).trim();
    if (resolve(previous) === resolve(current)) throw new Error('Refusing a recursive existing-hook configuration.');
    let inputFile;
    try {
      const forwarding = ['-c', `core.hooksPath=${previous}`, 'hook', 'run', '--ignore-missing'];
      if (hook === 'pre-push') {
        // `git hook run` does not inherit stdin; preserve push refs in Git-private storage.
        const candidate = git(root, ['rev-parse', '--path-format=absolute', '--git-path', `folio-prepush-input-${randomUUID()}`]).trim();
        const descriptor = openSync(candidate, 'wx', 0o600);
        inputFile = candidate;
        try {
          writeFileSync(descriptor, pushInput);
        } finally {
          closeSync(descriptor);
        }
        forwarding.push(`--to-stdin=${inputFile}`);
      }
      const forwarded = spawnSync('git', [...forwarding, hook, '--', ...hookArgs], {
        cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
      });
      if (forwarded.error || forwarded.status !== 0) throw new Error('An existing repository hook declined the operation.');
    } finally {
      if (inputFile) rmSync(inputFile, { force: true });
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--validate-patterns' && args.length === 2) {
      validatePrivatePatterns(repositoryRoot, args[1]);
      console.log('Private pattern-file location validated; no patterns were displayed or copied.');
    } else if (args[0] === '--hook' && args.length >= 2) {
      runHook(repositoryRoot, args[1], args.slice(2), args[1] === 'pre-push' ? readFileSync(0) : Buffer.alloc(0));
    } else {
      if (args.length > 1 || (args.length === 1 && args[0] !== '--history')) {
        throw new Error('Usage: node scripts/check-tracked-data.mjs [--history]');
      }
      const count = checkTrackedData(repositoryRoot, { history: args[0] === '--history' });
      console.log(`Tracked-data filename check passed (${count} paths; no contents read).`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
