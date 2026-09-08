import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createStandaloneServer } from '../scripts/serve-standalone.mjs';

test('standalone server serves only built static files over loopback, with no financial-data endpoints', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'folio-static-test-'));
  const directory = join(temporary, 'dist-web');
  await mkdir(join(directory, 'assets'), { recursive: true });
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Generated local app</title>');
  await writeFile(join(directory, 'assets', 'app.js'), '/* generated test asset */');
  await writeFile(join(temporary, 'private.txt'), 'generated inaccessible content');
  const server = await createStandaloneServer(directory);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const get = (path, options = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, ...options }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
  try {
    const page = await get('/');
    assert.equal(page.status, 200);
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal((await get('/assets/app.js')).status, 200);
    assert.equal((await get('/', { method: 'POST' })).status, 405);
    assert.equal((await get('/', { headers: { Host: 'attacker.invalid' } })).status, 421);
    for (const path of ['/private.txt', '/src/standalone/app.tsx', '/assets/../../private.txt', '/assets/%2e%2e/%2e%2e/private.txt', '/assets/%5c..%5cprivate.txt']) {
      const result = await get(path);
      assert.equal(result.status, 404);
      assert.ok(!result.body.includes('inaccessible'));
    }
    assert.equal((await get('/', { method: 'HEAD' })).body, '');
  } finally {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await rm(temporary, { recursive: true, force: true });
  }
});
