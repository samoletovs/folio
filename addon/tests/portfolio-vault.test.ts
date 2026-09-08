import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPortfolioSession, openPortfolio, portfolioStore, sealPortfolio } from '../src/lib/portfolio-vault.ts';
import { encryptPolicy } from '../src/lib/vault.ts';
import { generatedPolicy } from './vault-fixture.ts';
import { generatedPortfolio } from './portfolio-fixture.ts';

test('portfolio ciphertext survives reopening; edits reuse only an in-memory non-exportable key with fresh nonces', async () => {
  const passphrase = crypto.randomUUID();
  const document = generatedPortfolio();
  const session = await createPortfolioSession(passphrase);
  assert.equal(session.key.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', session.key));
  const first = await sealPortfolio(document, session);
  const stored = await portfolioStore.write(first, null);
  assert.ok(stored);
  const reopened = await portfolioStore.read();
  assert.ok(reopened);
  assert.deepEqual((await openPortfolio(reopened.envelope, passphrase)).document, document);
  assert.ok(!JSON.stringify(reopened).includes(document.accounts[0].name));
  assert.ok(!JSON.stringify(reopened).includes(passphrase));
  document.holdings[0].valueMinor++;
  const next = await sealPortfolio(document, session);
  assert.equal(first.salt, next.salt);
  assert.notEqual(first.iv, next.iv);
  const updated = await portfolioStore.write(next, stored.revision);
  assert.ok(updated);
  await assert.rejects(portfolioStore.write(first, stored.revision), /another window/);
  await assert.rejects(openPortfolio(next, crypto.randomUUID()), /Cannot unlock/);
  await portfolioStore.write(null, updated.revision);
});
test('an IPS backup cannot be confused with a whole-portfolio backup', async () => {
  const passphrase = crypto.randomUUID();
  const ips = await encryptPolicy(generatedPolicy(), passphrase);
  await assert.rejects(openPortfolio(ips, passphrase), /supported encrypted/);
});
