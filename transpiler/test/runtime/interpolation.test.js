import test from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../src/index.js";

test("runtime interpolates variable references inside printed strings", () => {
  const result = execute([
    "Set user age to 20",
    "Print \"Hello, World!\"",
    "Print \"Age is (user age)\"."
  ].join("\n"));

  assert.deepEqual(result.output, ["Hello, World!", "Age is 20"]);
});

test("runtime interpolates variable references inside stored string values", () => {
  const result = execute([
    "Set user age to 20",
    "Set greeting to \"Age is (user age)\"",
    "Print greeting."
  ].join("\n"));

  assert.equal(result.scope.get("greeting"), "Age is 20");
  assert.deepEqual(result.output, ["Age is 20"]);
});

test("runtime normalizes article words inside interpolation references", () => {
  const result = execute([
    "Set user age to 20",
    'Print "Age is (the user age)".'
  ].join("\n"));

  assert.deepEqual(result.output, ["Age is 20"]);
});

test("runtime escapes literal parentheses inside strings", () => {
  const result = execute(['Print "Use (( and ))".'].join("\n"));

  assert.deepEqual(result.output, ["Use ( and )"]);
});

test("runtime rejects non-variable interpolation expressions", () => {
  assert.throws(() => execute('Print "(price * quantity)".'), /Invalid interpolation reference/);
});
