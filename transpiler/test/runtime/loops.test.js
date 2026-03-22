import test from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../src/index.js";

test("runtime iterates lists in order with For each", () => {
  const result = execute([
    "Set numbers to the list of (1, 2, 3)",
    "For each item in numbers:",
    '    Print "Item is (item)".'
  ].join("\n"));

  assert.deepEqual(result.output, ["Item is 1", "Item is 2", "Item is 3"]);
});

test("runtime keeps For each item variables block-local", () => {
  const result = execute([
    'Set item to "outside"',
    'Set names to the list of ("A", "B")',
    "For each item in names:",
    "    Print item.",
    "Print item."
  ].join("\n"));

  assert.equal(result.scope.get("item"), "outside");
  assert.deepEqual(result.output, ["A", "B", "outside"]);
});

test("runtime repeats a block the requested number of times", () => {
  const result = execute([
    "Repeat 3 times:",
    '    Print "Again".'
  ].join("\n"));

  assert.deepEqual(result.output, ["Again", "Again", "Again"]);
});

test("runtime rejects invalid repeat counts", () => {
  assert.throws(
    () => execute(["Repeat 2.5 times:", '    Print "No".'].join("\n")),
    /Repeat count must be a non-negative integer/
  );
});

test("runtime keeps doing this while a condition remains true", () => {
  const result = execute([
    "Set counter to 0",
    "Keep doing this while counter is less than 3:",
    "    Print counter.",
    "    Set counter to the result of (counter + 1)"
  ].join("\n"));

  assert.equal(result.scope.get("counter"), 3);
  assert.deepEqual(result.output, ["0", "1", "2"]);
});

test("runtime lowers until loops to while not behavior", () => {
  const result = execute([
    "Set counter to 0",
    "Keep doing this until counter is greater than or equal to 3:",
    "    Print counter.",
    "    Set counter to the result of (counter + 1)"
  ].join("\n"));

  assert.equal(result.scope.get("counter"), 3);
  assert.deepEqual(result.output, ["0", "1", "2"]);
});
