import { useCallback, useEffect, useState } from "react";

export interface PendingDecision {
  runId: string;
  goal: string;
  workflow: string;
  questionId: string;
  text: string;
  allowed: string[];
}

const REFRESH_MS = 15_000;

/** Questions of runs the viewer process owns (for example runs started by a watch), with one button per allowed answer. */
export function PendingDecisions({ api, onOpenRun }: { api: string; onOpenRun: (runId: string) => void }) {
  const [pending, setPending] = useState<PendingDecision[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${api}/pending`)
      .then(async (response) => (response.ok ? ((await response.json()) as PendingDecision[]) : []))
      .then(setPending)
      .catch(() => setPending([]));
  }, [api]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const answer = useCallback(
    async (item: PendingDecision, choice: string) => {
      setBusy(item.runId);
      setError(null);
      try {
        const query = new URLSearchParams({ question: item.questionId, answer: choice });
        const response = await fetch(`${api}/runs/${encodeURIComponent(item.runId)}/answer?${query.toString()}`, { method: "POST", headers: { "x-factory-action": "answer" } });
        const body = (await response.json()) as PendingDecision[] | { error?: string };
        if (!response.ok || !Array.isArray(body)) throw new Error(Array.isArray(body) ? `answer failed: ${response.status}` : (body.error ?? `answer failed: ${response.status}`));
        setPending(body);
      } catch (answerError) {
        setError(answerError instanceof Error ? answerError.message : String(answerError));
      } finally {
        setBusy(null);
      }
    },
    [api],
  );

  if (pending.length === 0 && !error) return null;
  return (
    <section className="pending" aria-label="Waiting for your decision">
      <h2>Waiting for your decision ({pending.length})</h2>
      {error && <p className="pending-error">{error}</p>}
      <ul>
        {pending.map((item) => (
          <li key={`${item.runId}:${item.questionId}`} className="pending-item">
            <div className="pending-head">
              <strong>{item.goal}</strong>{" "}
              <button type="button" className="link" onClick={() => onOpenRun(item.runId)}>
                {item.runId}
              </button>
            </div>
            <pre className="question-text">{item.text}</pre>
            <div className="pending-actions">
              {item.allowed.map((choice) => (
                <button key={choice} type="button" disabled={busy === item.runId} onClick={() => void answer(item, choice)}>
                  {choice}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
