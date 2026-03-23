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

test("runtime resolves collection access helpers for lists and sets", () => {
  const result = execute([
    "Create a List called users defined as:",
    '    - "Alice"',
    '    - "Bob"',
    '    - "Charlie"',
    "Create a Set called tags defined as:",
    '    - "vip"',
    '    - "trial"',
    '    - "vip"',
    "Set first user to first item of users",
    "Set last tag to last item of tags",
    "Set picked user to item at index 1 of users",
    "Set user slice to items from index 1 to 5 of users",
    "Set missing user to item at index 99 of users",
    "Print first user.",
    "Print last tag.",
    "Print picked user.",
    "Print user slice.",
    "Print missing user."
  ].join("\n"));

  assert.equal(result.scope.get("first user"), "Alice");
  assert.equal(result.scope.get("last tag"), "trial");
  assert.equal(result.scope.get("picked user"), "Bob");
  assert.deepEqual(result.scope.get("user slice"), ["Bob", "Charlie"]);
  assert.equal(result.scope.get("missing user"), result.scope.noValue);
  assert.deepEqual(result.output, ["Alice", "trial", "Bob", "[Bob, Charlie]", "no value"]);
});

test("runtime resolves first item where and count where for record collections", () => {
  const result = execute([
    "Create a List called users defined as:",
    '    - {Name: "Alice", Age: 17, Active: Yes}',
    '    - {Name: "Bob", Age: 25, Active: No}',
    '    - {Name: "Charlie", Age: 30, Active: Yes}',
    "Set first adult to first item of users where Age >= 20",
    "Set adult count to count of users where Age >= 20",
    "Set first senior to first item of users where Age >= 99",
    "Print first adult.",
    "Print adult count.",
    "Print first senior."
  ].join("\n"));

  assert.deepEqual(result.scope.get("first adult"), { Name: "Bob", Age: 25, Active: false });
  assert.equal(result.scope.get("adult count"), 2);
  assert.equal(result.scope.get("first senior"), result.scope.noValue);
  assert.deepEqual(result.output, [
    "{Name: Bob, Age: 25, Active: false}",
    "2",
    "no value"
  ]);
});

test("runtime evaluates collection count, emptiness, and primitive contains helpers", () => {
  const result = execute([
    "Create a List called users defined as:",
    '    - "Alice"',
    '    - "Bob"',
    "Create a List called records defined as:",
    '    - {Name: "Alice", Age: 25}',
    "Create a Set called tags defined as:",
    '    - "vip"',
    '    - "trial"',
    "Set user count to count of users",
    "Set users empty to users is empty",
    "Set empty tags to the list of ()",
    "Set tags empty to empty tags is empty",
    'Set has alice to users contains item "Alice"',
    'Set has vip to tags contains item "vip"',
    'Set has record to records contains item "Alice"',
    "Print user count.",
    "Print users empty.",
    "Print tags empty.",
    "Print has alice.",
    "Print has vip.",
    "Print has record."
  ].join("\n"));

  assert.equal(result.scope.get("user count"), 2);
  assert.equal(result.scope.get("users empty"), false);
  assert.equal(result.scope.get("tags empty"), true);
  assert.equal(result.scope.get("has alice"), true);
  assert.equal(result.scope.get("has vip"), true);
  assert.equal(result.scope.get("has record"), false);
  assert.deepEqual(result.output, ["2", "false", "true", "true", "true", "false"]);
});

test("runtime evaluates extended collection access helpers", () => {
  const result = execute([
    "Create a List called users defined as:",
    '    - "Alice"',
    '    - "Bob"',
    '    - "Charlie"',
    '    - "Dana"',
    "Create a Set called tags defined as:",
    '    - "vip"',
    '    - "trial"',
    '    - "active"',
    'Set first users to first 3 items of users',
    'Set last users to last 2 items of users',
    'Set many tags to first 5 items of tags',
    'Set invalid user slice to first "bad" items of users',
    'Set alice index to index of "Alice" in users',
    'Set missing index to index of "Missing" in users',
    "Print first users.",
    "Print last users.",
    "Print many tags.",
    "Print invalid user slice.",
    "Print alice index.",
    "Print missing index."
  ].join("\n"));

  assert.deepEqual(result.scope.get("first users"), ["Alice", "Bob", "Charlie"]);
  assert.deepEqual(result.scope.get("last users"), ["Charlie", "Dana"]);
  assert.deepEqual(result.scope.get("many tags"), ["vip", "trial", "active"]);
  assert.deepEqual(result.scope.get("invalid user slice"), []);
  assert.equal(result.scope.get("alice index"), 0);
  assert.equal(result.scope.get("missing index"), result.scope.noValue);
  assert.deepEqual(result.output, [
    "[Alice, Bob, Charlie]",
    "[Charlie, Dana]",
    "[vip, trial, active]",
    "[]",
    "0",
    "no value"
  ]);
});

test("runtime evaluates has any and has all helpers for primitive collections", () => {
  const result = execute([
    "Create a List called users defined as:",
    '    - "Alice"',
    '    - "Bob"',
    "Create a Set called tags defined as:",
    '    - "vip"',
    '    - "active"',
    'Set users has any match to users has any of ("Guest", "Alice")',
    'Set users has all match to users has all of ("Alice", "Bob")',
    'Set tags has all match to tags has all of ("vip", "active")',
    'Set tags has invalid match to tags has any of (no value)',
    "Print users has any match.",
    "Print users has all match.",
    "Print tags has all match.",
    "Print tags has invalid match."
  ].join("\n"));

  assert.equal(result.scope.get("users has any match"), true);
  assert.equal(result.scope.get("users has all match"), true);
  assert.equal(result.scope.get("tags has all match"), true);
  assert.equal(result.scope.get("tags has invalid match"), false);
  assert.deepEqual(result.output, ["true", "true", "true", "false"]);
});
