import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ExplanationFact } from '../lib/explanations.ts';
import { selectLocalExplanations } from '../lib/ollama.ts';

export function ExplanationPanel({ facts }: { facts: ExplanationFact[] }) {
  const [model, setModel] = useState('');
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(false);
  const [answer, setAnswer] = useState<ExplanationFact[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setAnswer(null); setError(''); setBusy(false);
  }, [facts]);
  async function explain(event: FormEvent) {
    event.preventDefault();
    if (!consent) { setError('Confirm local-only processing before asking the model.'); return; }
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true); setError(''); setAnswer(null);
    try {
      const result = await selectLocalExplanations(model.trim(), question, facts, controller.signal);
      if (request.current === controller) setAnswer(result);
    } catch (failure) {
      if (request.current === controller) setError(failure instanceof Error ? failure.message : 'Local explanation failed.');
    } finally { if (request.current === controller) setBusy(false); }
  }
  return <section aria-labelledby="explain-title">
    <h2 id="explain-title">Understand this review</h2>
    <p>These explanations come from the policy evaluator. No model is needed to read them.</p>
    <div className="folio-facts">{facts.slice(0, 4).map((fact) => <details key={fact.id}><summary>{fact.title}</summary><p>{fact.text}</p><small>Source: {fact.source}</small></details>)}</div>
    <details>
      <summary>Ask a local model to find the relevant explanation</summary>
      <p>Ollama selects from existing facts; it cannot write new numbers or advice. Requests go only to 127.0.0.1. Cloud-disabled status and a local model are required before any question or portfolio facts are sent.</p>
      <form className="folio-stack" onSubmit={explain}>
        <label>Installed Ollama model<input required value={model} disabled={busy} placeholder="Local model name" onChange={(event) => setModel(event.target.value)} /></label>
        <label>Your question<textarea required maxLength={500} rows={3} disabled={busy} value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
        <label className="folio-check"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />I allow this question and the displayed facts to be processed by my local Ollama service.</label>
        <div className="folio-actions"><button disabled={busy || !consent} type="submit">{busy ? 'Finding explanations...' : 'Find relevant explanations'}</button>{busy && <button className="folio-secondary" type="button" onClick={() => request.current?.abort()}>Cancel request</button>}</div>
      </form>
      {error && <p className="folio-error" role="alert">{error}</p>}
      {answer && <div aria-live="polite">{answer.length === 0 ? <p>The available facts do not answer this question. folio will not guess.</p> : answer.map((fact) => <article key={fact.id}><h3>{fact.title}</h3><p>{fact.text}</p><small>Source: {fact.source}</small></article>)}</div>}
    </details>
  </section>;
}
