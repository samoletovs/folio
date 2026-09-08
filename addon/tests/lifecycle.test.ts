import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle } from '../src/lib/lifecycle.ts';

test('disabling notifies mounted UI once and subsequent enables use fresh state', () => {
  const lifecycle = createLifecycle();
  let notified = 0;
  const remove = lifecycle.subscribe(() => { notified++; });
  assert.equal(lifecycle.isActive(), true);
  lifecycle.disable();
  lifecycle.disable();
  assert.equal(lifecycle.isActive(), false);
  assert.equal(notified, 1);
  remove();
  assert.equal(createLifecycle().isActive(), true);
});
