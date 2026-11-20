import test from "node:test";
import assert from "node:assert/strict";
import { buildParser, isParseSpec, parseContract } from "../src/parse-spec.ts";
import { missingField } from "../src/contract.ts";

test("a line parse maps the last result line to the declared fields and keeps the text", () => {
  const parse = buildParser({ line: ["step", "verdict", "detail"] });
  const output = "FACTS: fine\n`verify | fail | yaml 2 | engine 1`";
  assert.deepEqual(parse(output), { step: "verify", verdict: "fail", detail: "yaml 2 | engine 1", text: output });
  assert.throws(() => parse("no result line"), /no result line with 3 fields/);
});

test("a json parse reads the last json block and requires the declared fields", () => {
  const parse = buildParser({ json: ["findings", "note?"] });
  const output = "draft\n```json\n{\"findings\": [1]}\n```\nfinal\n```json\n{\"findings\": [2, 3]}\n```";
  assert.deepEqual(parse(output), { note: null, findings: [2, 3], text: output });
  assert.throws(() => parse("```json\n{\"other\": 1}\n```"), /has no findings/);
  assert.throws(() => parse("plain text"), /no ```json block/);
});

test("text parse trims, and the contract names the declared fields only", () => {
  assert.equal(buildParser("text")("  ok \n"), "ok");
  assert.equal(isParseSpec({ line: [] }), false);
  assert.equal(isParseSpec("review.findings"), false);
  const contract = parseContract({ line: ["verdict", "detail"] });
  assert.equal(missingField(contract, ["verdict"]), null);
  assert.equal(missingField(contract, ["text", "length"]), null);
  assert.equal(missingField(contract, ["count"]), "count");
  assert.equal(missingField(parseContract({ json: ["items"] }), ["items", "0", "id"]), null);
});
