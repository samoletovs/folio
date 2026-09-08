import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectLocalExplanations } from '../src/lib/ollama.ts';
import type { ExplanationFact } from '../src/lib/explanations.ts';

const facts: ExplanationFact[] = [{ id: 'known', title: 'Generated fact', text: 'Only code-produced text may be displayed.', source: 'generated evaluator' }];
const local = { details: { format: 'gguf' }, model_info: { 'general.architecture': 'fixture' } };
const signal = () => new AbortController().signal;
function mockFetch(responses: unknown[], requests: { url: string; options?: RequestInit }[]): typeof fetch {
  return async (input, options) => {
    requests.push({ url: String(input), options });
    return new Response(JSON.stringify(responses.shift()), { headers: { 'Content-Type': 'application/json' } });
  };
}

test('private prompts are not sent until both cloud-disabled and local model preflights pass', async () => {
  const requests: { url: string; options?: RequestInit }[] = [];
  await assert.rejects(selectLocalExplanations('local', 'private-question', facts, signal(), mockFetch([{ cloud: { disabled: false } }], requests)), /Disable Ollama cloud/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options?.body, undefined);
  await assert.rejects(selectLocalExplanations('local', 'private-question', facts, signal(), mockFetch([{ cloud: { disabled: true } }, { ...local, remote_host: 'https://remote.invalid' }], requests)), /installed local/);
  assert.ok(!JSON.stringify(requests).includes('private-question'));
});

test('local selection returns only existing facts, uses fixed loopback and rejects redirects', async () => {
  const requests: { url: string; options?: RequestInit }[] = [];
  const selected = await selectLocalExplanations('local:fixture', 'Explain this', facts, signal(), mockFetch([
    { cloud: { disabled: true } }, local, { done: true, message: { content: '{"factIds":["known"]}' } },
  ], requests));
  assert.deepEqual(selected, facts);
  assert.equal(requests.length, 3);
  requests.forEach(({ url, options }) => {
    assert.ok(url.startsWith('http://127.0.0.1:11434/api/'));
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.credentials, 'omit');
  });
  const chat = JSON.parse(String(requests[2].options?.body));
  assert.equal(chat.keep_alive, 0);
  assert.equal(chat.stream, false);
  assert.equal(chat.tools, undefined);
});

test('unfounded numbers, unknown facts and cloud model aliases cannot become an explanation', async () => {
  for (const content of ['{"factIds":["invented"]}', '{"factIds":["known"],"advice":"invented amount"}', '{"factIds":["known","known"]}', 'invalid']) {
    await assert.rejects(selectLocalExplanations('local', 'Explain', facts, signal(), mockFetch([
      { cloud: { disabled: true } }, local, { done: true, message: { content } },
    ], [])), /references|JSON/);
  }
  await assert.rejects(selectLocalExplanations('foo-cloud', 'Explain', facts, signal(), mockFetch([], [])), /not a cloud/);
});

test('an empty selection abstains and server failures never fall back to another origin', async () => {
  assert.deepEqual(await selectLocalExplanations('local', 'Unanswerable', facts, signal(), mockFetch([
    { cloud: { disabled: true } }, local, { done: true, message: { content: '{"factIds":[]}' } },
  ], [])), []);
  let calls = 0;
  const fail: typeof fetch = async () => { calls++; throw new TypeError('private error body'); };
  await assert.rejects(selectLocalExplanations('local', 'Question', facts, signal(), fail), /No cloud fallback/);
  assert.equal(calls, 1);
});
