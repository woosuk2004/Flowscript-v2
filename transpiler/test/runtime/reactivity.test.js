import test from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../src/index.js";

test("runtime recomputes always is bindings when dependencies change", () => {
  const result = execute([
    "Set price to 10",
    "Set quantity to 2",
    "Set total always is the result of round(price * quantity, 2)"
  ].join("\n"));

  assert.equal(result.scope.get("total"), 20);
  result.scope.set("price", 15);
  assert.equal(result.scope.get("total"), 30);
});

test("runtime throws a clear error for reactive dependency cycles", () => {
  const result = execute([
    "Set alpha always is the result of (beta + 1)",
    "Set beta always is the result of (alpha + 1)"
  ].join("\n"));

  assert.throws(() => result.scope.get("alpha"), /Reactive cycle detected: alpha -> beta -> alpha/);
});

test("runtime prints the current value of reactive expressions", () => {
  const result = execute([
    "Set price to 12",
    "Set quantity to 3",
    "Set total always is the result of round(price * quantity, 2)",
    "Print total."
  ].join("\n"));

  assert.deepEqual(result.output, ["36"]);
});

test("runtime evaluates round, floor, and ceil math functions", () => {
  const result = execute([
    "Set rounded units to the result of round(100 * 2 / 3)",
    "Set rounded units precise to the result of round(100 * 2 / 3, 2)",
    "Set floored units to the result of floor(100 * 2 / 3)",
    "Set ceiled units to the result of ceil(100 * 2 / 3)"
  ].join("\n"));

  assert.equal(result.scope.get("rounded units"), 67);
  assert.equal(result.scope.get("rounded units precise"), 66.67);
  assert.equal(result.scope.get("floored units"), 66);
  assert.equal(result.scope.get("ceiled units"), 67);
});

test("runtime evaluates sentence-style comparison expressions", () => {
  const result = execute([
    "Set user age to 20",
    "Set adult status to user age is greater than or equal to 18",
    "Set exact match to user age is equal to 20",
    "Set hidden status to user age is less than 10",
    "Print adult status.",
    "Print exact match.",
    "Print hidden status."
  ].join("\n"));

  assert.equal(result.scope.get("adult status"), true);
  assert.equal(result.scope.get("exact match"), true);
  assert.equal(result.scope.get("hidden status"), false);
  assert.deepEqual(result.output, ["true", "true", "false"]);
});

test("runtime prints formatted numeric output with fixed precision", () => {
  const result = execute([
    "Set total to the result of (10 / 3)",
    "Print fixed(total, 2)."
  ].join("\n"));

  assert.deepEqual(result.output, ["3.33"]);
});

test("runtime evaluates logical and string operators", () => {
  const result = execute([
    'Set title to "FlowScript Guide"',
    'Set greeting to "Hello, World!"',
    'Set title status to title contains "Flow" and not title ends with "Draft"',
    'Set greeting status to greeting starts with "Hello" or greeting ends with "?"',
    "Print title status.",
    "Print greeting status."
  ].join("\n"));

  assert.equal(result.scope.get("title status"), true);
  assert.equal(result.scope.get("greeting status"), true);
  assert.deepEqual(result.output, ["true", "true"]);
});

test("runtime executes When / In case / Otherwise blocks", () => {
  const result = execute([
    "Set user age to 15",
    "When user age is greater than 18:",
    "    Print \"Adult\".",
    "In case user age is greater than 12:",
    "    Print \"Teen\".",
    "Otherwise:",
    "    Print \"Child\"."
  ].join("\n"));

  assert.deepEqual(result.output, ["Teen"]);
});

test("runtime executes Check / Case / Default blocks", () => {
  const result = execute([
    'Set role to "editor"',
    "Check role:",
    '    Case "admin":',
    '        Print "Admin".',
    '    Case "editor":',
    '        Print "Editor".',
    "    Default:",
    '        Print "Guest".'
  ].join("\n"));

  assert.deepEqual(result.output, ["Editor"]);
});
