import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explanationFacts } from '../src/lib/explanations.ts';
import { generatedPolicy } from './vault-fixture.ts';
import type { Evaluation, Snapshot } from '../src/types/index.ts';

test('incomplete data never creates an in-band or reassuring cost explanation', () => {
  const snapshot: Snapshot = { baseCurrency: 'EUR', accounts: [], holdings: [], issues: [], fetchedAt: new Date().toISOString() };
  const evaluation: Evaluation = {
    complete: false, issues: [], totalMinor: 0, rebalanceMinor: 0, observedMinor: 0, reservedMinor: 0,
    rows: [{ categoryId: 'generated', label: 'Generated category', valueMinor: 0, targetBps: 10_000, actualBps: 0, driftBps: -10_000, breached: true }],
    costs: { knownValueMinor: 0, unknownValueMinor: 0, blendedTerBps: 0, complete: true, overCeiling: false },
  };
  const facts = explanationFacts(snapshot, generatedPolicy(), evaluation, null);
  assert.ok(!facts.some((fact) => fact.id.startsWith('allocation-')));
  assert.match(facts.find((fact) => fact.id === 'costs')?.text ?? '', /unavailable/);
  assert.match(facts.find((fact) => fact.id === 'scope')?.text ?? '', /incomplete/);
  assert.ok(facts.every((fact) => fact.source.length > 0));
});
