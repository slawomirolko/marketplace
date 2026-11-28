import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateDotnetSource } from "./dotnet-implementation-rules.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function countOccurrences(markdown, phrase) {
  return markdown.split(phrase).length - 1;
}

function assertContainsExactlyOnce(markdown, phrase, file) {
  assert.equal(
    countOccurrences(markdown, phrase),
    1,
    `${file} must contain exactly one occurrence of: ${phrase}`,
  );
}

const implementer = read("agents/opencode/olko-dotnet-implementer.md");
const auditor = read("agents/opencode/olko-dotnet-auditor.md");
const testRunner = read("agents/opencode/olko-dotnet-test-runner.md");
const planOrchestrator = read("agents/opencode/olko-plan-documentation-orchestrator.md");
const implementationOrchestrator = read(
  "agents/opencode/olko-implementation-orchestrator.md",
);
const styleWorkflow = read("skills/dotnet/olko-dotnet-style/workflow.md");
const testingWorkflow = read("skills/dotnet/olko-dotnet-testing/workflow.md");

test("flags XML doc comments in a production file", () => {
  const source = [
    "/// <summary>Aggregates.</summary>",
    "public sealed class Service",
    "{",
    "}",
  ].join("\n");
  assert.deepEqual(
    validateDotnetSource(source, { file: "Service.cs" }).map((v) => v.rule),
    ["comment"],
  );
});

test("flags inline line comments in a production file", () => {
  const source = ["// rationale", "public sealed class Service", "{", "}"].join("\n");
  const violations = validateDotnetSource(source, { file: "Service.cs" });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "comment");
});

test("allows only the three AAA markers in a test file", () => {
  const source = [
    "public sealed class ServiceTests",
    "{",
    "    [Fact]",
    "    public void Run__case_passes()",
    "    {",
    "        // Arrange",
    "        // Act",
    "        // Assert",
    "    }",
    "}",
  ].join("\n");
  assert.deepEqual(
    validateDotnetSource(source, { file: "ServiceTests.cs", isTest: true }),
    [],
  );
});

test("flags any other comment in a test file", () => {
  const source = ["public sealed class ServiceTests", "{", "    // helper", "}"].join(
    "\n",
  );
  const violations = validateDotnetSource(source, {
    file: "ServiceTests.cs",
    isTest: true,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "comment");
});

test("flags a second top-level type in one file", () => {
  const source = [
    "public sealed record First(int Value);",
    "public sealed record Second(int Value);",
  ].join("\n");
  const violations = validateDotnetSource(source, { file: "Types.cs" });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "multiple-types");
  assert.equal(violations[0].line, 2);
});

test("flags a nested private helper type", () => {
  const source = [
    "public sealed class Service",
    "{",
    "    private sealed class Helper",
    "    {",
    "    }",
    "}",
  ].join("\n");
  const violations = validateDotnetSource(source, { file: "Service.cs" });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "nested-type");
});

test("flags a nested record used as an interface result", () => {
  const source = [
    "public interface IService",
    "{",
    "    public sealed record RunResult(int Count);",
    "}",
  ].join("\n");
  const violations = validateDotnetSource(source, { file: "IService.cs" });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "nested-type");
});

test("flags while (true) in any file", () => {
  const source = ["while (true)", "{", "    break;", "}"].join("\n");
  const violations = validateDotnetSource(source, { file: "Loop.cs" });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "unbounded-loop");
});

test("accepts a bounded for loop with a named cap", () => {
  const source = [
    "public sealed class Service",
    "{",
    "    private const int MaxPageCount = 10_000;",
    "    public void Run()",
    "    {",
    "        for (var page = 0; page < MaxPageCount; page++)",
    "        {",
    "        }",
    "    }",
    "}",
  ].join("\n");
  assert.deepEqual(validateDotnetSource(source, { file: "Service.cs" }), []);
});

test("flags a classic this-extension method", () => {
  const source = [
    "internal static class FeedbackAggregateExtensions",
    "{",
    "    public static ErrorOr<WeatherMemoryFeedback> ToWeatherMemoryFeedback(this FeedbackAggregate aggregate, DateTime evaluatedAtUtc) =>",
    "        WeatherMemoryFeedback.Create(aggregate.Commodity);",
    "}",
  ].join("\n");
  const violations = validateDotnetSource(source, {
    file: "FeedbackAggregateExtensions.cs",
  });
  assert.deepEqual(
    violations.map((v) => v.rule),
    ["classic-extension-method"],
  );
  assert.equal(violations[0].line, 3);
});

test("flags a classic this-extension method split across lines", () => {
  const source = [
    "internal static class FeedbackAggregateExtensions",
    "{",
    "    public static ErrorOr<WeatherMemoryFeedback> ToWeatherMemoryFeedback(",
    "        this FeedbackAggregate aggregate,",
    "        DateTime evaluatedAtUtc)",
    "    {",
    "        return WeatherMemoryFeedback.Create(aggregate.Commodity);",
    "    }",
    "}",
  ].join("\n");
  const violations = validateDotnetSource(source, {
    file: "FeedbackAggregateExtensions.cs",
  });
  assert.deepEqual(
    violations.map((v) => v.rule),
    ["classic-extension-method"],
  );
});

test("accepts a C# 14 extension block", () => {
  const source = [
    "internal static class FeedbackAggregateExtensions",
    "{",
    "    extension(FeedbackAggregate aggregate)",
    "    {",
    "        public ErrorOr<WeatherMemoryFeedback> ToWeatherMemoryFeedback(DateTime evaluatedAtUtc) =>",
    "            WeatherMemoryFeedback.Create(aggregate.Commodity);",
    "    }",
    "}",
  ].join("\n");
  assert.deepEqual(
    validateDotnetSource(source, { file: "FeedbackAggregateExtensions.cs" }),
    [],
  );
});

test("accepts a plain static helper that is not an extension", () => {
  const source = [
    "internal static class MathHelpers",
    "{",
    "    public static int Add(int left, int right) => left + right;",
    "}",
  ].join("\n");
  assert.deepEqual(validateDotnetSource(source, { file: "MathHelpers.cs" }), []);
});

test("implementer carries all structural hard rules exactly once", () => {
  for (const heading of [
    "HARD RULE — ONE TYPE PER FILE, NO NESTED TYPES",
    "HARD RULE — ZERO COMMENTS, INCLUDING XML DOCS",
    "HARD RULE — NO UNBOUNDED LOOPS",
    "HARD RULE — MAPPING VIA C# 14 EXTENSION BLOCKS",
    "HARD RULE — RUN THE MARKETPLACE SOURCE-RULE EVALUATOR BEFORE REPORTING",
    "HARD RULE — TESTS USE PRODUCTION TYPES AND SHARED BUILDERS",
  ]) {
    assertContainsExactlyOnce(implementer, heading, "olko-dotnet-implementer.md");
  }
  assert.match(implementer, /not a nested `private sealed` helper/);
  assert.match(implementer, /`WeatherMemoryFeedbackTestBuilder\.Create\(/);
  assert.match(implementer, /NEVER declare a `private static` factory\/helper/);
  assert.match(implementer, /C# 14 EXTENSION BLOCK/);
  assert.match(implementer, /NEVER use the classic `this` extension-method parameter form/);
  assert.doesNotMatch(implementer, /scripts\/evals\/dotnet-implementation-rules/);
});

test("implementer no longer permits comments or tiny nested helpers", () => {
  assert.doesNotMatch(implementer, /XML docs only where the file type requires them/);
  assert.doesNotMatch(implementer, /truly unavoidable/);
  assert.doesNotMatch(implementer, /tiny helper type is tightly bound/);
});

test("auditor reports nested types, unbounded loops, private mappers and builders", () => {
  assertContainsExactlyOnce(
    auditor,
    "STRUCTURE FINDINGS — ALWAYS REPORT",
    "olko-dotnet-auditor.md",
  );
  assert.match(auditor, /Flag ANY second type declaration in one file/);
  assert.match(auditor, /Flag `while \(true\)`/);
  assert.match(auditor, /C# 14 extension block on a `<Thing>Extensions` static class/);
  assert.match(auditor, /`private static` helper in a test class/);
  assert.match(auditor, /Flag any added XML-doc\/parameter-doc block/);
  assert.match(auditor, /Flag the classic `this` extension-method parameter form/);
});

test("test runner reports builder, naming and comment violations read-only", () => {
  assertContainsExactlyOnce(
    testRunner,
    "TEST-SOURCE REVIEW (read-only findings, owner directive)",
    "olko-dotnet-test-runner.md",
  );
  assert.match(testRunner, /`<Type>TestBuilder`/);
  assert.match(testRunner, /MethodUnderTest__scenario_expectedResult/);
  assert.match(testRunner, /missing `\/\/ Arrange`, `\/\/ Act`, or `\/\/ Assert`/);
});

test("planning orchestrator forbids plans that prescribe structural defects", () => {
  assertContainsExactlyOnce(
    planOrchestrator,
    "HARD RULE — PLANS NEVER PRESCRIBE STRUCTURAL DEFECTS",
    "olko-plan-documentation-orchestrator.md",
  );
  assert.match(planOrchestrator, /a second type in one file/);
  assert.match(planOrchestrator, /`while \(true\)` or any loop without a provable/);
  assert.match(planOrchestrator, /instead of a C# 14 extension block/);
  assert.match(planOrchestrator, /instead of a `<Type>TestBuilder`/);
  assert.match(planOrchestrator, /never plan to preserve it/);
});

test("implementation orchestrator runs the evaluator before every commit", () => {
  assertContainsExactlyOnce(
    implementationOrchestrator,
    "HARD RULE — SOURCE-RULE EVALUATOR BEFORE COMMIT",
    "olko-implementation-orchestrator.md",
  );
  assert.match(implementationOrchestrator, /dotnet-implementation-rules\.mjs <file> \[--test\]/);
  assert.match(implementationOrchestrator, /check_file_size\.py --all/);
  assert.match(implementationOrchestrator, /PASS <file>/);
  assert.match(implementationOrchestrator, /green CI is never evidence instead/);
});

test("style skill carries the one-type, bounded-loop, zero-comment and mapper rules", () => {
  assert.match(styleWorkflow, /One file = one type declaration/);
  assert.match(styleWorkflow, /no nested `private sealed` helper/);
  assert.match(styleWorkflow, /never `while \(true\)`/);
  assert.match(styleWorkflow, /a changed C# file carries ZERO comments/);
  assert.match(styleWorkflow, /A private `Build\*`\/`Create\*`\/`Map\*` method/);
  assert.doesNotMatch(styleWorkflow, /unless a tiny helper type is tightly bound/);
  assert.match(styleWorkflow, /C# 14 extension block/);
  assert.match(styleWorkflow, /extension blocks are required/);
});

test("testing skill requires shared builders and bans private static factories", () => {
  assert.match(testingWorkflow, /`<Type>TestBuilder`/);
  assert.match(testingWorkflow, /even when only one test class uses it/);
  assert.match(testingWorkflow, /ONLY comments allowed in test code/);
  assert.doesNotMatch(testingWorkflow, /when a second test class needs the same data/);
});
