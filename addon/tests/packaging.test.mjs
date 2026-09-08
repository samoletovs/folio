import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { unzipSync, zipSync } from 'fflate';
import { cleanDist } from '../scripts/clean.mjs';
import { packageAddon } from '../scripts/package.mjs';
import { addonRoot, archiveEntries, loadPublicFiles, requiredPermissions, validateMetadata } from '../scripts/public-files.mjs';
import { validateArchive, validatePackage } from '../scripts/validate-package.mjs';
import { discoverTests } from '../scripts/test.mjs';
import { checkTrackedData, isPrivateDataPath, validatePrivatePatterns } from '../../scripts/check-tracked-data.mjs';

const projectRoot = resolve(addonRoot, '..');
const manifest = JSON.parse(await readFile(join(addonRoot, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(addonRoot, 'package.json'), 'utf8'));
const declaredFunction = (name) => ({ name, isDeclared: true, isDetected: false });

async function fixture(t) {
  // Every fixture is generated, isolated under ignored project test output, then removed.
  const base = join(projectRoot, 'test-results', `delivery-${randomUUID()}`);
  const root = join(base, 'addon');
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(base, 'LICENSE'), 'Synthetic test license\n');
  await writeFile(join(root, 'README.md'), 'Generated public packaging fixture\n');
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'dist', 'addon.js'), 'export default function enable() {}\n');
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, root };
}

test('metadata declares the SDK 2 contract and non-trading functions without loading browser globals', () => {
  validateMetadata(manifest, pkg);
  assert.equal(pkg.engines.node, '>=22.18.0');
  assert.equal(manifest.minWealthfolioVersion, '2.0.0');
  assert.equal(typeof globalThis.window, 'undefined');
  for (const permission of manifest.permissions) {
    assert.deepEqual(permission.functions.map((fn) => fn.name), requiredPermissions[permission.category]);
    for (const fn of permission.functions) {
      assert.deepEqual(fn, declaredFunction(fn.name));
    }
  }
});

test('metadata rejects stale schema, missing permissions and privilege expansion', () => {
  for (const modify of [
    (value) => { value.sdkVersion = '1.0.0'; },
    (value) => { delete value.minWealthfolioVersion; },
    (value) => { value.minWealthfolioVersion = '1.0.0'; },
    (value) => { value.version = '0.0.0'; },
    (value) => { value.main = '../private.json'; },
    (value) => { value.permissions[0].functions = ['sidebar.addItem', 'router.add']; },
    (value) => { value.permissions.pop(); },
    (value) => { value.permissions[1].functions.push(declaredFunction('create')); },
    (value) => { value.permissions[2].functions.push(declaredFunction('update')); },
    (value) => { value.permissions[4].functions.push(declaredFunction('portfolio.onUpdateStart')); },
    (value) => { value.permissions[0].functions[0].isDetected = true; },
    (value) => { value.permissions[0].functions[0] = null; },
  ]) {
    const invalid = structuredClone(manifest);
    modify(invalid);
    assert.throws(() => validateMetadata(invalid, pkg));
  }
  assert.throws(() => validateMetadata(manifest, { ...pkg, name: '../escape' }));
});

test('test discovery explicitly lists TS and MJS tests, tolerating either suffix on its own', async (t) => {
  const { root } = await fixture(t);
  await mkdir(join(root, 'tests'));
  await writeFile(join(root, 'tests', 'fixture.ts'), 'export {};\n');
  await assert.rejects(discoverTests(root), /No tests/);
  await writeFile(join(root, 'tests', 'zeta.test.ts'), 'export {};\n');
  assert.deepEqual(await discoverTests(root), [join('tests', 'zeta.test.ts')]);
  await writeFile(join(root, 'tests', 'alpha with spaces.test.mjs'), 'export {};\n');
  await mkdir(join(root, 'tests', 'directory.test.ts'));
  assert.deepEqual(await discoverTests(root), [
    join('tests', 'alpha with spaces.test.mjs'), join('tests', 'zeta.test.ts'),
  ]);
  await rm(join(root, 'tests', 'zeta.test.ts'));
  assert.deepEqual(await discoverTests(root), [join('tests', 'alpha with spaces.test.mjs')]);
});

test('package includes exactly four public inputs, not directories, private files or itself', async (t) => {
  const { root } = await fixture(t);
  const privateMarker = `generated-${randomUUID()}`;
  for (const path of [
    ['dist', 'holdings.csv'], ['dist', 'addon.js.map'], ['dist', 'previous.zip'],
    ['assets', 'folio-ips.private.json'], ['node_modules', 'dependency', 'index.js'],
    ['.env'], ['local.ips.json'], ['folio-vault.enc'], ['dev', 'index.html'],
  ]) {
    await mkdir(dirname(join(root, ...path)), { recursive: true });
    await writeFile(join(root, ...path), privateMarker);
  }
  const output = await packageAddon(root);
  assert.equal(relative(root, dirname(output)), 'out');
  const bytes = await readFile(output);
  const entries = unzipSync(bytes);
  assert.deepEqual(Object.keys(entries).sort(), [...archiveEntries].sort());
  for (const value of Object.values(entries)) assert.ok(!Buffer.from(value).includes(Buffer.from(privateMarker)));
  assert.equal(Buffer.from(entries['dist/addon.js']).toString(), 'export default function enable() {}\n');
  assert.equal(Buffer.from(entries.LICENSE).toString(), 'Synthetic test license\n');
  await validatePackage(root);
  assert.equal(await packageAddon(root), output);
  assert.deepEqual(await readFile(output), bytes);
  assert.deepEqual(await readdir(dirname(output)), [`${pkg.name}-${pkg.version}.zip`]);
});

test('package fails closed when required inputs are missing or empty', async (t) => {
  const { root } = await fixture(t);
  await rm(join(root, 'dist', 'addon.js'));
  await assert.rejects(packageAddon(root));
  await assert.rejects(lstat(join(root, 'out')), { code: 'ENOENT' });
  await writeFile(join(root, 'dist', 'addon.js'), '');
  await assert.rejects(packageAddon(root), /nonempty regular files/);
});

test('archive validation rejects additional paths and altered bundle bytes', async (t) => {
  const { root } = await fixture(t);
  const { files } = await loadPublicFiles(root);
  assert.throws(() => validateArchive(zipSync({ ...files, 'local.ips.json': new Uint8Array([1]) }), files), /only/);
  assert.throws(() => validateArchive(zipSync({ ...files, '../LICENSE': files.LICENSE }), files), /only/);
  assert.throws(() => validateArchive(zipSync({ ...files, 'dist/addon.js': new Uint8Array([1]) }), files), /match/);
  assert.throws(() => validateArchive(new Uint8Array([1, 2, 3]), files));
});

test('clean is idempotent and deletes only addon/dist', async (t) => {
  const { root } = await fixture(t);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'keep.ts'), 'export {};\n');
  const output = await packageAddon(root);
  await cleanDist(root);
  await cleanDist(root);
  assert.equal(await readFile(join(root, 'src', 'keep.ts'), 'utf8'), 'export {};\n');
  assert.ok((await lstat(output)).isFile());
  assert.ok((await lstat(join(root, 'manifest.json'))).isFile());
  await assert.rejects(lstat(join(root, 'dist')), { code: 'ENOENT' });
});

test('clean CLI is independent of the working directory and needs no installed dependencies', async (t) => {
  const { root, base } = await fixture(t);
  await mkdir(join(root, 'scripts'));
  await mkdir(join(base, 'dist'));
  await writeFile(join(base, 'dist', 'keep.txt'), 'generated parent content');
  for (const name of ['clean.mjs', 'paths.mjs']) {
    await copyFile(join(addonRoot, 'scripts', name), join(root, 'scripts', name));
  }
  const script = join(root, 'scripts', 'clean.mjs');
  const result = spawnSync(process.execPath, [script], { cwd: base, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  await assert.rejects(lstat(join(root, 'dist')), { code: 'ENOENT' });
  assert.equal(await readFile(join(base, 'dist', 'keep.txt'), 'utf8'), 'generated parent content');
  assert.equal(spawnSync(process.execPath, [script, base], { cwd: base }).status, 1);
  assert.equal(await readFile(join(base, 'dist', 'keep.txt'), 'utf8'), 'generated parent content');
});

test('clean and package refuse linked dist or output directories', async (t) => {
  const { root, base } = await fixture(t);
  const outside = join(base, 'protected');
  await mkdir(outside);
  await writeFile(join(outside, 'addon.js'), 'generated protected content');
  await rm(join(root, 'dist'), { recursive: true });
  await symlink(outside, join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(cleanDist(root), /links and junctions/);
  await assert.rejects(packageAddon(root), /links and junctions/);
  assert.equal(await readFile(join(outside, 'addon.js'), 'utf8'), 'generated protected content');
  await rm(join(root, 'dist'));
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist', 'addon.js'), 'export default () => {};');
  await symlink(outside, join(root, 'out'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(packageAddon(root), /links and junctions/);
  assert.deepEqual(await readdir(outside), ['addon.js']);
});

test('a nested dist link never causes clean to delete its target', async (t) => {
  const { root, base } = await fixture(t);
  const outside = join(base, 'protected');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.txt'), 'generated protected content');
  await symlink(outside, join(root, 'dist', 'nested'), process.platform === 'win32' ? 'junction' : 'dir');
  await cleanDist(root);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'generated protected content');
});

test('filename gate rejects private IPS, encrypted data, patterns and raw financial exports', () => {
  for (const path of [
    'ips.json', 'owner.ips.json', 'policy.json', 'folio-ips.private.json', 'target.folio-ips.json',
    'folio-vault.enc', 'encrypted-ips.json', 'backup.folio.json', 'folio-policy.json.backup',
    'vault/local.json', '.me/notes.md', 'scripts/.leak-patterns.txt',
    'scripts/.leak-patterns.local.txt', 'personal-info-patterns.txt', '.env.local',
    'fake-fixtures/holdings.csv', 'BROKER.TSV', 'accounts.ofx', 'accounts.qfx',
    'accounts.qif', 'Wealthfolio.sqlite', 'snapshot.db', 'broker-export.xlsx',
    'flex-report.xml', 'IBKR.xml', 'account-statement.pdf', 'transactions.json',
    'positions.zip', 'raw\\holdings.CSV', 'notes.private.md', 'private-summary.md',
    'ActivityStatement.pdf', 'FlexQuery.xml', 'HoldingsExport.json', 'IPSBackup.json',
    'app.db-wal', 'app.sqlite3-shm', 'Wealthfolio-backup.zip', 'local.enc.json',
  ]) assert.equal(isPrivateDataPath(path), true, path);
  for (const path of [
    'addon/package.json', 'addon/manifest.json', 'addon/src/lib/policy.ts',
    'addon/tests/packaging.test.mjs', 'addon/tests/policy.test.ts', 'docs/ips-format.md',
    'docs/vision.md', '.env.example', '.github/workflows/addon-checks.yml',
    'scripts/setup-leak-audit.ps1', 'scripts/audit-leaks.ps1', 'scripts/check-tracked-data.mjs',
  ]) assert.equal(isPrivateDataPath(path), false, path);
});

async function gitFixture(t) {
  const { base } = await fixture(t);
  const repo = join(base, 'repository');
  await mkdir(join(repo, 'scripts'), { recursive: true });
  execFileSync('git', ['init', '--quiet', repo], { stdio: 'pipe' });
  for (const name of ['check-tracked-data.mjs', 'audit-leaks.ps1', 'setup-leak-audit.ps1']) {
    await copyFile(join(projectRoot, 'scripts', name), join(repo, 'scripts', name));
  }
  const pattern = `synthetic-audit-${randomUUID()}`;
  const patternsFile = join(base, 'owner-patterns.txt');
  await writeFile(patternsFile, `${pattern}\n`);
  return { base, repo, patternsFile, pattern };
}

function runGit(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
}

test('tracked-data gate examines index names and never reports private contents or names', async (t) => {
  const { repo } = await gitFixture(t);
  await writeFile(join(repo, 'public.txt'), 'Generated nonfinancial source');
  runGit(repo, 'add', 'public.txt');
  assert.equal(checkTrackedData(repo), 1);
  const marker = randomUUID();
  await writeFile(join(repo, `${marker}.ips.json`), `synthetic-body-${marker}`);
  runGit(repo, 'add', `${marker}.ips.json`);
  assert.throws(() => checkTrackedData(repo), /blocked 1/);
  const result = spawnSync(process.execPath, ['scripts/check-tracked-data.mjs'], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(marker));
});

test('private patterns must be nonempty and outside the repository, even through links', async (t) => {
  const { repo, patternsFile, base } = await gitFixture(t);
  assert.equal(validatePrivatePatterns(repo, patternsFile), patternsFile);
  assert.throws(() => validatePrivatePatterns(repo, 'relative.txt'), /absolute PRIVATE/);
  const inside = join(repo, 'patterns.txt');
  await writeFile(inside, 'generated-only-pattern\n');
  assert.throws(() => validatePrivatePatterns(repo, inside), /outside every repository/);
  const alias = join(base, 'alias');
  await symlink(repo, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => validatePrivatePatterns(repo, join(alias, 'patterns.txt')), /outside every repository/);
  await writeFile(patternsFile, '# No owner patterns supplied\n\n');
  assert.throws(() => validatePrivatePatterns(repo, patternsFile), /at least one/);
});

function setup(repo, patternsFile) {
  return spawnSync('pwsh', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-File', 'scripts/setup-leak-audit.ps1',
    '-PatternsFile', patternsFile,
  ], { cwd: repo, encoding: 'utf8' });
}

test('local setup preserves and chains existing hooks; canonical failures are redacted', async (t) => {
  const { repo, base, patternsFile, pattern } = await gitFixture(t);
  const existing = join(base, 'existing-hooks');
  await mkdir(existing);
  const prior = '#!/bin/sh\nprintf "Existing hook ran\\n"\n';
  await writeFile(join(existing, 'pre-commit'), prior);
  await chmod(join(existing, 'pre-commit'), 0o755);
  runGit(repo, 'config', '--local', 'core.hooksPath', existing);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = setup(repo, patternsFile);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  }
  assert.equal(await readFile(join(existing, 'pre-commit'), 'utf8'), prior);
  assert.equal(runGit(repo, 'config', '--local', '--get', 'folio.previousHooksPath').replaceAll('\\', '/'), existing.replaceAll('\\', '/'));
  assert.equal(runGit(repo, 'config', '--local', '--get', 'folio.leakPatternsFile'), patternsFile);
  await writeFile(join(repo, 'probe.txt'), pattern);
  runGit(repo, 'add', 'probe.txt');
  let result = spawnSync('git', ['hook', 'run', 'pre-commit'], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Private leak audit failed/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(pattern));
  assert.ok(!`${result.stdout}${result.stderr}`.includes('Existing hook ran'));
  await writeFile(join(repo, 'probe.txt'), 'Generated clean fixture');
  runGit(repo, 'add', 'probe.txt');
  result = spawnSync('git', ['hook', 'run', 'pre-commit'], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(`${result.stdout}${result.stderr}`, /Existing hook ran/);
  await writeFile(join(repo, 'probe.txt'), 'Unstaged generated edit');
  result = spawnSync('git', ['hook', 'run', 'pre-commit'], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /partially staged/);
});

test('setup refuses an in-repository pattern file or a conflicting generated-hook location', async (t) => {
  const { repo, patternsFile } = await gitFixture(t);
  const local = join(repo, 'patterns.txt');
  await writeFile(local, 'generated-only-pattern\n');
  assert.notEqual(setup(repo, local).status, 0);
  const hooks = runGit(repo, 'rev-parse', '--path-format=absolute', '--git-path', 'folio-hooks');
  await mkdir(hooks, { recursive: true });
  await writeFile(join(hooks, 'pre-commit'), 'user-owned existing hook\n');
  const result = setup(repo, patternsFile);
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(join(hooks, 'pre-commit'), 'utf8'), 'user-owned existing hook\n');
  assert.equal(spawnSync('git', ['config', '--local', '--get', 'folio.leakPatternsFile'], { cwd: repo }).status, 1);
});

test('pre-push preserves existing-hook arguments/stdin and checks names before forwarding', async (t) => {
  const { repo, base, patternsFile, pattern } = await gitFixture(t);
  const existing = join(base, 'existing-hooks');
  const input = `(delete) ${'0'.repeat(40)} refs/heads/generated ${'1'.repeat(40)}\n`;
  await mkdir(existing);
  await writeFile(join(existing, 'pre-push'), [
    '#!/bin/sh',
    '[ "$1" = "generated-remote" ] || exit 31',
    '[ "$2" = "generated-url" ] || exit 32',
    'IFS= read -r row || exit 33',
    `[ "$row" = "${input.trim()}" ] || exit 34`,
    'printf "Existing push hook ran\\n"',
    '',
  ].join('\n'));
  await chmod(join(existing, 'pre-push'), 0o755);
  runGit(repo, 'config', '--local', 'core.hooksPath', existing);
  const installed = setup(repo, patternsFile);
  assert.equal(installed.status, 0, `${installed.stdout}${installed.stderr}`);
  const args = ['scripts/check-tracked-data.mjs', '--hook', 'pre-push', 'generated-remote', 'generated-url'];
  let result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', input });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(`${result.stdout}${result.stderr}`, /Existing push hook ran/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(pattern));
  assert.ok(!(await readdir(join(repo, '.git'))).some((name) => name.startsWith('folio-prepush-input-')));
  await writeFile(join(repo, 'generated.ips.json'), 'generated private fixture');
  runGit(repo, 'add', 'generated.ips.json');
  result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', input });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /blocked 1/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('Existing push hook ran'));
});
