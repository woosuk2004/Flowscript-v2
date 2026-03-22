import test from "node:test";
import assert from "node:assert/strict";

import { execute } from "../../src/index.js";

test("runtime builds derived lists from record collections", () => {
  const result = execute([
    "Create a List called users defined as:",
    '    - {Name: "Alice", Age: 25, Active: Yes}',
    '    - {Name: "Bob", Age: 17, Active: No}',
    '    - {Name: "Charlie", Age: 30, Active: Yes}',
    "Create a List called adults from users where Age >= 20.",
    "Create a List called active names from users where Active is Yes select Name."
  ].join("\n"));

  assert.equal(result.scope.get("adults").length, 2);
  assert.deepEqual(result.scope.get("active names"), ["Alice", "Charlie"]);
});

test("runtime builds primitive sets with stable first-seen order", () => {
  const result = execute([
    "Create a Set called tags defined as:",
    '    - "vip"',
    '    - "trial"',
    '    - "vip"',
    '    - "active"'
  ].join("\n"));

  assert.deepEqual(result.scope.get("tags"), ["vip", "trial", "active"]);
});

test("runtime runs collection pipelines end to end", () => {
  const result = execute([
    "Create a List called raw orders defined as:",
    '    - {Email: "alice@example.com", Amount: 120, status: "Delivered"}',
    '    - {Email: "bob@example.com", Amount: 80, status: "Pending"}',
    '    - {Email: "charlie@example.com", Amount: 150, status: "Delivered"}',
    '    - {Email: "dana@example.com", Amount: 140, status: "Delivered"}',
    "Take raw orders:",
    '    Then filter where status is "Delivered"',
    '    Then sort by Amount descending',
    '    Then take the first 2 items',
    '    Then select Email',
    '    Then save to vip emails as a list',
    'Print "Top VIP Emails: " joined with vip emails.'
  ].join("\n"));

  assert.deepEqual(result.scope.get("vip emails"), ["charlie@example.com", "dana@example.com"]);
  assert.deepEqual(result.output, ["Top VIP Emails: [charlie@example.com, dana@example.com]"]);
});

test("runtime iterates sets with For each in insertion order", () => {
  const result = execute([
    "Create a Set called tags defined as:",
    '    - "vip"',
    '    - "trial"',
    '    - "vip"',
    '    - "active"',
    'For each tag in tags:',
    '    Print tag.'
  ].join("\n"));

  assert.deepEqual(result.output, ["vip", "trial", "active"]);
});
