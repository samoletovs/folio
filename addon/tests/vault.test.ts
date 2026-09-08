import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptPolicy, encryptPolicy, parseEnvelope, parsePolicyJson } from '../src/lib/vault.ts';
import { generatedPolicy } from './vault-fixture.ts';

test('IPS round-trips through authenticated encryption without storing plaintext', async () => {
  const policy = generatedPolicy();
  const passphrase = crypto.randomUUID();
  const envelope = await encryptPolicy(policy, passphrase);
  assert.deepEqual(await decryptPolicy(envelope, passphrase), policy);
  assert.ok(!JSON.stringify(envelope).includes(policy.categories[0].label));
  assert.ok(!JSON.stringify(envelope).includes(passphrase));
  const second = await encryptPolicy(policy, passphrase);
  assert.notEqual(envelope.salt, second.salt);
  assert.notEqual(envelope.iv, second.iv);
  assert.notEqual(envelope.ciphertext, second.ciphertext);
});

test('wrong passphrases and tampered ciphertext fail without yielding policy data', async () => {
  const passphrase = crypto.randomUUID();
  const envelope = await encryptPolicy(generatedPolicy(), passphrase);
  await assert.rejects(decryptPolicy(envelope, crypto.randomUUID()), /Cannot unlock/);
  const ciphertext = (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1);
  await assert.rejects(decryptPolicy({ ...envelope, ciphertext }, passphrase), /Cannot unlock/);
});

test('unsupported algorithms, work factors and short passphrases are rejected', async () => {
  await assert.rejects(encryptPolicy(generatedPolicy(), 'short'), /12 to/);
  const envelope = await encryptPolicy(generatedPolicy(), crypto.randomUUID());
  assert.throws(() => parseEnvelope({ ...envelope, iterations: 1 }), /supported/);
  assert.throws(() => parseEnvelope({ ...envelope, version: 2 }), /supported/);
  assert.throws(() => parseEnvelope({ ...envelope, iv: 'invalid' }), /invalid/);
  assert.throws(() => parsePolicyJson('{"private-identifier":'), /not valid JSON/);
  assert.throws(() => parsePolicyJson('x'.repeat(1_048_577)), /size limit/);
});
