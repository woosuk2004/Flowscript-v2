import test from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../src/index.js";

test("runtime keeps plain Set assignments as one-time snapshots", () => {
  const result = execute([
    "Set price to 10",
    "Set snapshot to price",
    "Set price to 20",
    "Print snapshot."
  ].join("\n"));

  assert.equal(result.scope.get("snapshot"), 10);
  assert.equal(result.scope.get("price"), 20);
  assert.deepEqual(result.output, ["10"]);
});

test("runtime accepts multiple boolean literal spellings", () => {
  const result = execute([
    "Set active flag to yes",
    "Set visible flag to off",
    "Print active flag.",
    "Print visible flag."
  ].join("\n"));

  assert.equal(result.scope.get("active flag"), true);
  assert.equal(result.scope.get("visible flag"), false);
  assert.deepEqual(result.output, ["true", "false"]);
});

test("runtime stores formatted values as strings", () => {
  const result = execute([
    "Set total to 20",
    "Set total label to fixed(total, 2)",
    "Print total label."
  ].join("\n"));

  assert.equal(result.scope.get("total label"), "20.00");
  assert.deepEqual(result.output, ["20.00"]);
});

test("runtime joins strings with joined with", () => {
  const result = execute([
    'Set first name to "Flow"',
    'Set last name to "Script"',
    "Set full name to first name joined with last name",
    "Print full name."
  ].join("\n"));

  assert.equal(result.scope.get("full name"), "FlowScript");
  assert.deepEqual(result.output, ["FlowScript"]);
});
