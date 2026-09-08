import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPolicy } from '../src/lib/vault.ts';
import { discardDamagedVault, readVault, writeVault } from '../src/lib/vault-store.ts';
import { generatedPolicy } from './vault-fixture.ts';

test('encrypted persistence survives reopening and prevents stale overwrites or deletion', async () => {
  assert.equal(await readVault(), null);
  const envelope = await encryptPolicy(generatedPolicy(), crypto.randomUUID());
  const first = await writeVault(envelope, null);
  assert.ok(first);
  await assert.rejects(discardDamagedVault(), /readable IPS/);
  assert.deepEqual(await readVault(), first);
  const next = await writeVault(envelope, first.revision);
  assert.ok(next);
  assert.notEqual(next.revision, first.revision);
  await assert.rejects(writeVault(envelope, first.revision), /another window/);
  await assert.rejects(writeVault(null, first.revision), /another window/);
  assert.deepEqual(await readVault(), next);
  assert.equal(await writeVault(null, next.revision), null);
  assert.equal(await readVault(), null);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('folio-private-policy', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('vault', 'readwrite');
      transaction.objectStore('vault').put({ damaged: true }, 'ips');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  });
  await assert.rejects(readVault(), /damaged/);
  await discardDamagedVault();
  assert.equal(await readVault(), null);
});
