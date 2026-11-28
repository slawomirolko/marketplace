import { useCallback, useEffect, useState } from "react";
import { messageOf, postAction, requestJson } from "./api.ts";

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
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    requestJson<PendingDecision[]>(`${api}/pending`, "/pending")
      .then((decisions) => {
        setPending(decisions);
        setLoadError(null);
      })
      .catch((failure: unknown) => setLoadError(`Could not load the pending decisions: ${messageOf(failure)}`));
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
        const body = await postAction<unknown>(`${api}/runs/${encodeURIComponent(item.runId)}/answer?${query.toString()}`, "answer");
        if (!Array.isArray(body)) {
          throw new Error("answer failed: the server did not return the pending list");
        }
        setPending(body as PendingDecision[]);
      } catch (answerError) {
        setError(messageOf(answerError));
      } finally {
        setBusy(null);
      }
    },
    [api],
  );

  if (pending.length === 0 && !error && !loadError) {
    return null;
  }
  return (
    <section className="pending" aria-label="Waiting for your decision">
      <h2>Waiting for your decision ({pending.length})</h2>
      {loadError && <p className="pending-error">{loadError}</p>}
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
