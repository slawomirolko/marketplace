import { useViewer } from "./context.ts";
import { questionsFor, stepName } from "./tree.ts";
import type { Item } from "./types.ts";

function when(at: string | null): string {
  return at ? new Date(at).toLocaleString() : "";
}

export function QuestionsList({ item }: { item: Item | null }) {
  const { mode, run, questions, humans } = useViewer();
  if (!item || item.kind === "terminal") return <p className="muted">Click a human icon to see the questions of that step.</p>;
  const name = stepName(item.key);
  const icon = humans.get(item.key);
  if (mode !== "runs" || !run) return <p className="muted">Pick a run to see what {name} asked you and what you answered.</p>;
  const asked = questionsFor(item.key, questions);
  return (
    <section>
      <h2>Questions of {name}</h2>
      <p className="muted">
        Run {run.runId}. {icon?.role === "relays" ? "This step passes on questions that other steps ask." : "Questions this step asked you, oldest first."}
      </p>
      {asked.length === 0 ? (
        <p className="muted">No question of this step is stored for this run. Only runs started after the question store (questions.sqlite) was added keep their questions.{icon?.permission ? ` A question the agent asks itself through its own permission (${icon.permission}) is not stored by the factory.` : ""}</p>
      ) : (
        <ol className="questions">
          {asked.map((q) => (
            <li key={q.questionId} className="question">
              <div className="question-head">
                <code>{q.questionId}</code>
                {q.node && q.node !== item.key && <span className="muted"> · through {stepName(q.node)}</span>}
                {q.askedBy.some((by) => by !== item.key) && <span className="muted"> · asked by {q.askedBy.filter((by) => by !== item.key).map(stepName).join(", ")}</span>}
                <span className="muted"> · {when(q.askedAt)}</span>
              </div>
              <pre className="question-text">{q.text}</pre>
              {q.allowed && <div className="muted">Allowed answers: {q.allowed.join(", ")}</div>}
              {q.answer === null ? (
                <div className="question-answer waiting">Waiting for your answer</div>
              ) : (
                <div className="question-answer">
                  <strong>Your answer:</strong> {q.answer} <span className="muted">· {when(q.answeredAt)}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
