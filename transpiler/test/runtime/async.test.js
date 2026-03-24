import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { execute, executeFile } from "../../src/index.js";

test("runtime creates background tasks, waits for them, and returns results from wait expressions", () => {
  const result = execute([
    "Set formatter job to the background task:",
    "    Print \"Preparing\".",
    "Set picked value to the result of wait for any of (formatter job)",
    "Wait for formatter job.",
    "Print picked value."
  ].join("\n"));

  assert.deepEqual(result.output, ["Preparing", "no value"]);
});

test("runtime supports try blocks around wait failures", () => {
  const result = execute([
    "Set broken job to the background task:",
    "    Wait for 10.",
    "Try this:",
    "    Wait for broken job.",
    "    Print \"Done\".",
    "If it fails:",
    "    Print \"Recovered\"."
  ].join("\n"));

  assert.deepEqual(result.output, ["Recovered"]);
});

test("runtime binds caught errors and always runs cleanup blocks", () => {
  const result = execute([
    "Set broken job to the background task:",
    "    Wait for 10.",
    "Try this:",
    "    Wait for broken job for 5 seconds.",
    "If it fails as error:",
    "    Print the code of error.",
    "    Print the kind of error.",
    "    Print the message of error.",
    "In any case:",
    "    Print \"Cleanup\"."
  ].join("\n"));

  assert.deepEqual(result.output, ["WAIT_EXPECTS_TASK", "WaitError", "Wait for expects a background task", "Cleanup"]);
});

test("runtime accepts wait timeouts on completed tasks and result waits", () => {
  const result = execute([
    "Set report job to the background task:",
    "    Print \"Building\".",
    "Wait for report job for 1 second.",
    "Set picked value to the result of wait for any of (report job) for 1 minute",
    "Print picked value."
  ].join("\n"));

  assert.deepEqual(result.output, ["Building", "no value"]);
});

test("runtime runs delayed blocks at finish and allows delayed task cancellation", () => {
  const result = execute([
    "After 5 seconds:",
    "    Print \"Later\".",
    "Set reminder job to the delayed task after 1 minute:",
    "    Print \"Should not run\".",
    "Cancel reminder job.",
    "Try this:",
    "    Wait for reminder job.",
    "If it fails as error:",
    "    Print the code of error.",
    "    Print the kind of error."
  ].join("\n"));

  assert.deepEqual(result.output, ["TASK_CANCELED", "CanceledError", "Later"]);
});

test("runtime surfaces unhandled background task failures clearly", () => {
  assert.throws(
    () =>
      execute([
        "In the background:",
        "    Wait for 10."
      ].join("\n")),
    /Unhandled background task failure: Wait for expects a background task/
  );
});

test("runtime executes async example files through the module-aware executeFile path", async () => {
  const currentFilePath = fileURLToPath(import.meta.url);
  const transpilerRoot = path.resolve(path.dirname(currentFilePath), "..", "..");
  const repoRoot = path.resolve(transpilerRoot, "..");
  const result = await executeFile(path.resolve(repoRoot, "examples/async-synchronization.flow"));

  assert.deepEqual(result.output, ["Preparing email", "no value", "Recovered"]);
});
