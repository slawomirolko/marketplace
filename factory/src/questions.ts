import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** One question the factory put to the user in a run, with the answer once it came. */
export interface AskedQuestion {
  runId: string;
  questionId: string;
  node: string | null;
  /** The llm steps whose output the question passes on; empty when the engine asks on its own. */
  askedBy: string[];
  text: string;
  allowed: string[] | null;
  askedAt: string;
  answer: string | null;
  answeredAt: string | null;
}

interface QuestionRow {
  run_id: string;
  question_id: string;
  node: string | null;
  asked_by: string | null;
  text: string;
  allowed: string | null;
  asked_at: string;
  answer: string | null;
  answered_at: string | null;
}

const SCHEMA = `
create table if not exists questions (
  run_id text not null,
  question_id text not null,
  node text,
  asked_by text,
  text text not null,
  allowed text,
  asked_at text not null,
  answer text,
  answered_at text,
  primary key (run_id, question_id)
)`;

function storedAskedBy(askedBy: string[]): string | null {
  if (askedBy.length === 0) return null;
  return askedBy.length === 1 ? askedBy[0]! : JSON.stringify(askedBy);
}

function readAskedBy(stored: string | null): string[] {
  if (stored === null) return [];
  return stored.startsWith("[") ? (JSON.parse(stored) as string[]) : [stored];
}

export function questionsFile(dataDir: string): string {
  return path.join(dataDir, "questions.sqlite");
}

function withStore<T>(dataDir: string, use: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(questionsFile(dataDir));
  try {
    db.exec("pragma busy_timeout = 5000; pragma journal_mode = wal;");
    db.exec(SCHEMA);
    return use(db);
  } finally {
    db.close();
  }
}

/** Stores a question when it is asked; asking it again after a restart keeps the first record. */
export function recordQuestion(dataDir: string, question: Omit<AskedQuestion, "answer" | "answeredAt">): void {
  withStore(dataDir, (db) => {
    db.prepare("insert or ignore into questions (run_id, question_id, node, asked_by, text, allowed, asked_at) values (?, ?, ?, ?, ?, ?, ?)")
      .run(question.runId, question.questionId, question.node, storedAskedBy(question.askedBy), question.text, question.allowed ? JSON.stringify(question.allowed) : null, question.askedAt);
  });
}

export function recordAnswer(dataDir: string, runId: string, questionId: string, answer: string, answeredAt: string): void {
  withStore(dataDir, (db) => {
    db.prepare("update questions set answer = ?, answered_at = ? where run_id = ? and question_id = ? and answer is null").run(answer, answeredAt, runId, questionId);
  });
}

export function readQuestions(dataDir: string, runId: string): AskedQuestion[] {
  const file = questionsFile(dataDir);
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("pragma busy_timeout = 5000;");
    const rows = db.prepare("select * from questions where run_id = ? order by asked_at, rowid").all(runId) as unknown as QuestionRow[];
    return rows.map((r) => ({
      runId: r.run_id,
      questionId: r.question_id,
      node: r.node,
      askedBy: readAskedBy(r.asked_by),
      text: r.text,
      allowed: r.allowed ? (JSON.parse(r.allowed) as string[]) : null,
      askedAt: r.asked_at,
      answer: r.answer,
      answeredAt: r.answered_at,
    }));
  } finally {
    db.close();
  }
}
